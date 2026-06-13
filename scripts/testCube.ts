// Unit tests for the data cube engine.
// Generates a synthetic 3-year sales dataset, builds the cube,
// and verifies every computation against brute-force on raw rows.
import {
  buildDataCube, filterRows, computeMeasure, seriesByGrain,
  byDimension, yoyOverlay, periodComparison, timeCapabilities,
  presetWindow, parseDateValue, grainKey, Grain,
} from "../lib/dataCube";

let passed = 0, failed = 0;
function assert(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else      { failed++; console.log(`  ❌ ${name} ${detail}`); }
}
function close(a: number, b: number, eps = 0.01) { return Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)); }

// ── Synthetic dataset: 3 years, 60K rows ──────────────────
const TERRITORIES = ["North", "South", "East", "West", "Central"];
const CHANNELS    = ["Reseller", "Online"];
const CATEGORIES  = Array.from({ length: 40 }, (_, i) => `Cat-${String(i + 1).padStart(2, "0")}`); // 40 > 25 cap → tests "Other"

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

const headers = ["SalesOrderKey", "OrderDate", "Territory", "Channel", "Category", "Sales Amount", "Total Cost", "Order Quantity"];
const rows: unknown[][] = [];
const start = Date.UTC(2021, 0, 4);  // Mon Jan 4 2021
const DAYS = 365 * 3;
for (let i = 0; i < 60_000; i++) {
  const dayOffset = Math.floor(rand() * DAYS);
  const date = new Date(start + dayOffset * 86400000);
  // seasonal + yearly growth signal
  const year = date.getUTCFullYear();
  const growth = 1 + (year - 2021) * 0.2;
  const amount = Math.round((50 + rand() * 400) * growth * 100) / 100;
  const cost   = Math.round(amount * (0.55 + rand() * 0.15) * 100) / 100;
  // Use yyyymmdd integer date keys for ~half the rows to test that path
  const dateVal = i % 2 === 0
    ? date.toISOString().slice(0, 10)
    : year * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  rows.push([
    100000 + i, dateVal,
    TERRITORIES[Math.floor(rand() * TERRITORIES.length)],
    CHANNELS[Math.floor(rand() * CHANNELS.length)],
    CATEGORIES[Math.floor(rand() * CATEGORIES.length)],
    amount, cost, 1 + Math.floor(rand() * 5),
  ]);
}
// Inject dirt: 200 rows with blank amounts, 50 with unparseable dates, a TOTAL row pattern
for (let i = 0; i < 200; i++) rows[i * 37][5] = "";
for (let i = 0; i < 50; i++)  rows[i * 211][1] = "not-a-date";

console.log("\n══ Building cube from 60,000 synthetic rows ══");
const t0 = Date.now();
const cube = buildDataCube("synthetic_sales.xlsx", "Sales", headers, rows);
const buildMs = Date.now() - t0;
console.log(`  Build time: ${buildMs}ms | cube rows: ${cube?.rows.length}`);

assert("Cube builds successfully", cube !== null);
if (!cube) process.exit(1);

// ── Classification correctness ─────────────────────────────
assert("Date field detected = OrderDate", cube.dateField === "OrderDate", `got ${cube.dateField}`);
assert("Territory is a dimension", cube.dimensions.some(d => d.name === "Territory"));
assert("Channel is a dimension",   cube.dimensions.some(d => d.name === "Channel"));
assert("Category is a dimension",  cube.dimensions.some(d => d.name === "Category"));
assert("SalesOrderKey is NOT a measure (ID excluded)", !cube.measures.includes("SalesOrderKey"));
assert("Sales Amount is a measure", cube.measures.includes("Sales Amount"));
assert("Total Cost is a measure",   cube.measures.includes("Total Cost"));
assert("Sales Amount flagged as money", cube.moneyMeasures.includes("Sales Amount"));
const catDim = cube.dimensions.find(d => d.name === "Category")!;
assert("Category capped at 25 values + Other", catDim.values.length === 26 && catDim.values.includes("Other"),
  `got ${catDim.values.length}`);
assert("Unparseable dates counted as skipped", cube.skippedRows === 50, `got ${cube.skippedRows}`);
assert("Multi-year span detected", cube.spanDays > 1000, `got ${cube.spanDays}`);

// ── Brute-force ground truth ───────────────────────────────
function bruteSum(filter: (r: unknown[]) => boolean, col: number): number {
  let s = 0;
  for (const r of rows) {
    if (!parseDateValue(r[1])) continue;
    if (!filter(r)) continue;
    const v = r[col];
    if (v !== "" && v !== null && !isNaN(Number(v))) s += Number(v);
  }
  return s;
}

console.log("\n══ Totals vs brute force ══");
const allRows = filterRows(cube, {});
const cubeTotal  = computeMeasure(allRows, { kind: "field", field: "Sales Amount" });
const bruteTotal = bruteSum(() => true, 5);
assert("Total Sales Amount matches raw sum", close(cubeTotal, bruteTotal, 1e-6),
  `cube=${cubeTotal.toFixed(2)} brute=${bruteTotal.toFixed(2)}`);

const cubeCost  = computeMeasure(allRows, { kind: "field", field: "Total Cost" });
const bruteCost = bruteSum(() => true, 6);
assert("Total Cost matches raw sum", close(cubeCost, bruteCost, 1e-6));

console.log("\n══ Filters vs brute force ══");
const northOnline = filterRows(cube, { Territory: ["North"], Channel: ["Online"] });
const cubeNO  = computeMeasure(northOnline, { kind: "field", field: "Sales Amount" });
const bruteNO = bruteSum(r => r[2] === "North" && r[3] === "Online", 5);
assert("Filter North+Online exact match", close(cubeNO, bruteNO, 1e-6),
  `cube=${cubeNO.toFixed(2)} brute=${bruteNO.toFixed(2)}`);

// "Other" bucket: pick a category beyond top 25
const inCube = new Set(catDim.values);
const otherCats = CATEGORIES.filter(c => !inCube.has(c));
assert("Some categories bucketed to Other", otherCats.length > 0, `all 40 fit?`);
if (otherCats.length) {
  const cubeOther  = computeMeasure(filterRows(cube, { Category: ["Other"] }), { kind: "field", field: "Sales Amount" });
  const bruteOther = bruteSum(r => otherCats.includes(r[4] as string), 5);
  assert("'Other' bucket sums correctly", close(cubeOther, bruteOther, 1e-6),
    `cube=${cubeOther.toFixed(2)} brute=${bruteOther.toFixed(2)}`);
}

console.log("\n══ Time rollups (lossless week→month→year) ══");
const grains: Grain[] = ["week", "month", "quarter", "year"];
for (const g of grains) {
  const series = seriesByGrain(allRows, g, { kind: "field", field: "Sales Amount" });
  const seriesSum = series.reduce((s, p) => s + p.value, 0);
  assert(`${g} series sums to total (${series.length} points)`, close(seriesSum, cubeTotal, 1e-9));
}
// Year buckets must match brute-force per-year sums
const yearSeries = seriesByGrain(allRows, "year", { kind: "field", field: "Sales Amount" });
for (const pt of yearSeries) {
  const bruteYear = bruteSum(r => {
    const d = parseDateValue(r[1]);
    return d !== null && String(d.getUTCFullYear()) === pt.key;
  }, 5);
  assert(`Year ${pt.key} matches brute force`, close(pt.value, bruteYear, 1e-6),
    `cube=${pt.value.toFixed(2)} brute=${bruteYear.toFixed(2)}`);
}

console.log("\n══ Date windows ══");
const win = presetWindow(cube, "ytd");
const ytdRows = filterRows(cube, {}, win);
const maxYear = cube.dateRange.max.slice(0, 4);
assert("YTD window only includes max year", ytdRows.every(r => r.w.slice(0, 4) === maxYear));
const cubeYTD = computeMeasure(ytdRows, { kind: "field", field: "Sales Amount" });
// brute YTD by calendar year of the row date — week-grain caveat: weeks are bucketed by Monday.
// Verify against week-start based brute force (the documented grain behavior).
const bruteYTD = bruteSum(r => {
  const d = parseDateValue(r[1]);
  return d !== null && String(d.getUTCFullYear()) === maxYear;
}, 5);
assert("YTD total matches brute force (calendar-exact)", close(cubeYTD, bruteYTD, 1e-6),
  `cube=${cubeYTD.toFixed(2)} brute=${bruteYTD.toFixed(2)}`);

console.log("\n══ Derived measures ══");
const margin = computeMeasure(allRows, { kind: "marginPct", revenue: "Sales Amount", cost: "Total Cost" });
const bruteMargin = ((bruteTotal - bruteCost) / bruteTotal) * 100;
assert("Margin % computed correctly", close(margin, bruteMargin, 1e-6), `cube=${margin} brute=${bruteMargin}`);
assert("Margin in plausible range (30-45%)", margin > 30 && margin < 45, `got ${margin.toFixed(1)}%`);

console.log("\n══ YoY + capabilities ══");
const caps = timeCapabilities(cube);
assert("Multi-year detected", caps.multiYear);
assert("YoY enabled", caps.yoy);
assert("All years listed (data spills into a 4th calendar year)", caps.years.length >= 3 && caps.years.includes("2021") && caps.years.includes("2023"), `got ${caps.years.join(",")}`);
assert("Year grain available", caps.grains.includes("year"));

const overlay = yoyOverlay(allRows, { kind: "field", field: "Sales Amount" });
assert("YoY overlay has 12 month points", overlay.points.length === 12);
assert("YoY overlay has all 3 years", overlay.years.length === 3);
// Growth signal: 2023 total > 2021 total (we injected 20%/yr growth)
const y21 = yearSeries.find(p => p.key === "2021")?.value || 0;
const y23 = yearSeries.find(p => p.key === "2023")?.value || 0;
assert("Growth trend visible (2023 > 2021)", y23 > y21 * 1.2);

const cmp = periodComparison(cube, {}, { kind: "field", field: "Sales Amount" });
assert("Period comparison computes delta", cmp.deltaPct !== null && cmp.current > 0 && cmp.prior > 0);

console.log("\n══ Sub-500-row dataset (should still cube if dated) ══");
const small = buildDataCube("small.csv", "small", headers, rows.slice(0, 300));
assert("Small dataset builds cube", small !== null);

console.log("\n══ Dataset with no date column ══");
const noDate = buildDataCube("nodate.csv", "x", ["Name", "Value"], [["a", 1], ["b", 2], ["c", 3], ["d", 4], ["e", 5], ["f", 6], ["g", 7], ["h", 8], ["i", 9], ["j", 10], ["k", 11]]);
assert("No-date dataset returns null (static fallback)", noDate === null);

console.log(`\n════════════════════════════════════`);
console.log(`RESULT: ${passed} passed, ${failed} failed | cube build ${buildMs}ms for 60K rows`);
process.exit(failed > 0 ? 1 : 0);
