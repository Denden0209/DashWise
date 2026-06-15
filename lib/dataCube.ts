// lib/dataCube.ts
// The data engine behind the interactive dashboard.
// Build side (upload time): classifies columns, aggregates rows into a
//   week-grain cube — runs entirely in the browser, zero API cost.
// Query side (dashboard): filters + re-aggregates the cube locally so
//   every number on screen is computed, never AI-generated.
// Pure TypeScript, no framework imports — unit-testable in Node.

// ── Types ──────────────────────────────────────────────────
export type Grain = "week" | "month" | "quarter" | "year";

export type CubeRow = {
  w: string;                      // ISO date of the week's Monday, e.g. "2013-10-14"
  mo: string;                     // calendar month of the source rows, e.g. "2013-10"
  d: Record<string, string>;      // dimension values
  m: Record<string, number>;      // summed measures
  n: number;                      // source row count
};                                // weeks straddling a month boundary are split into two rows
                                  // so month/quarter/year rollups stay calendar-exact

export type CubeDimension = { name: string; values: string[] };

export type DataCube = {
  version:        1;
  fileName:       string;
  sheetName:      string;
  builtAt:        string;
  dateField:      string;
  dateRange:      { min: string; max: string };
  spanDays:       number;
  grainBase:      "week" | "month";
  dimensions:     CubeDimension[];
  measures:       string[];
  moneyMeasures:  string[];       // measures formatted as currency
  rows:           CubeRow[];
  sourceRowCount: number;
  skippedRows:    number;         // rows without a parseable date
};

export type Filters = Record<string, string[]>;  // dimension -> allowed values (empty/missing = all)

export type DateWindow = { from?: string; to?: string }; // ISO dates inclusive

// ── Config ─────────────────────────────────────────────────
const MAX_DIMENSIONS    = 4;
const MAX_DIM_VALUES    = 25;
const DIM_CARDINALITY_MAX = 50;
const MAX_CUBE_ROWS     = 50_000;   // if exceeded at week grain → rebuild at month grain
const OTHER_LABEL       = "Other";

// ── Date parsing ───────────────────────────────────────────
export function parseDateValue(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  if (typeof v === "number") {
    // Excel serial date
    if (v > 25569 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return isNaN(d.getTime()) ? null : d;
    }
    // yyyymmdd integer key (e.g. 20130715 — common in star schemas)
    if (v >= 19000101 && v <= 21001231) {
      const s  = String(Math.trunc(v));
      const yy = +s.slice(0, 4), mm = +s.slice(4, 6), dd = +s.slice(6, 8);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const d = new Date(Date.UTC(yy, mm - 1, dd));
        return isNaN(d.getTime()) ? null : d;
      }
    }
    return null;
  }

  const s = String(v).trim();
  if (!s) return null;
  // yyyymmdd as string
  if (/^\d{8}$/.test(s)) return parseDateValue(Number(s));
  // ISO / common formats — let Date try
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function isNumericValue(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (typeof v === "number") return !isNaN(v);
  const s = String(v).replace(/[$,%\s]/g, "");
  return s !== "" && !isNaN(Number(s));
}

export function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  return Number(String(v).replace(/[$,%\s]/g, ""));
}

// Monday of the week containing d (UTC)
export function weekStartISO(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
}

export function monthStartISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// ── Grain key + label from a cube row date ─────────────────
export function grainKey(isoDate: string, grain: Grain): string {
  const y = isoDate.slice(0, 4), m = isoDate.slice(5, 7);
  if (grain === "week")    return isoDate;
  if (grain === "month")   return `${y}-${m}`;
  if (grain === "quarter") return `${y}-Q${Math.floor((+m - 1) / 3) + 1}`;
  return y;
}

// Grain key for a cube row — calendar grains come from `mo` so years are exact
export function rowGrainKey(r: CubeRow, grain: Grain): string {
  if (grain === "week") return r.w;
  const y = r.mo.slice(0, 4), m = r.mo.slice(5, 7);
  if (grain === "month")   return r.mo;
  if (grain === "quarter") return `${y}-Q${Math.floor((+m - 1) / 3) + 1}`;
  return y;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function grainLabel(key: string, grain: Grain): string {
  if (grain === "week")    return key.slice(5);                       // "10-14"
  if (grain === "month")   return `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(2, 4)}`;
  if (grain === "quarter") return key;                                // "2013-Q4"
  return key;                                                         // "2013"
}

// ── Column classification ──────────────────────────────────
type ColumnProfile = {
  name:       string;
  index:      number;
  nonBlank:   number;
  numericPct: number;
  intPct:     number;             // share of numeric values that are integers
  datePct:    number;
  unique:     number;
  topValues:  [string, number][];
};

function profileColumns(headers: string[], rows: unknown[][], sampleCap = 20_000): ColumnProfile[] {
  const step = rows.length > sampleCap ? Math.ceil(rows.length / sampleCap) : 1;
  return headers.map((name, index) => {
    let nonBlank = 0, numeric = 0, ints = 0, dates = 0;
    const freq = new Map<string, number>();
    for (let i = 0; i < rows.length; i += step) {
      const v = rows[i][index];
      if (v === null || v === undefined || v === "") continue;
      nonBlank++;
      if (isNumericValue(v)) { numeric++; if (Number.isInteger(toNumber(v))) ints++; }
      if (parseDateValue(v)) dates++;
      if (freq.size <= 5000) {
        const key = String(v).trim();
        freq.set(key, (freq.get(key) || 0) + 1);
      }
    }
    const topValues = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    return {
      name, index, nonBlank,
      numericPct: nonBlank ? numeric / nonBlank : 0,
      intPct:     numeric ? ints / numeric : 0,
      datePct:    nonBlank ? dates / nonBlank : 0,
      unique:     freq.size,
      topValues,
    };
  });
}

function pickDateColumn(profiles: ColumnProfile[]): ColumnProfile | null {
  const candidates = profiles
    .filter(p => p.datePct >= 0.7 && p.nonBlank > 0)
    .map(p => {
      const nameHint = /date|day|time|period/i.test(p.name) ? 1 : 0;
      return { p, score: p.datePct + nameHint };
    })
    .sort((a, b) => b.score - a.score);
  return candidates.length ? candidates[0].p : null;
}

function pickDimensions(profiles: ColumnProfile[], dateName: string, rowCount: number): ColumnProfile[] {
  return profiles
    .filter(p =>
      p.name !== dateName &&
      p.unique >= 2 && p.unique <= DIM_CARDINALITY_MAX &&
      p.nonBlank >= rowCount * 0.3 &&
      p.datePct < 0.7
    )
    .map(p => {
      const nameHint = /territory|region|channel|category|type|status|segment|store|location|department|product line|class|group|country|state/i.test(p.name) ? 2 : 0;
      const cardScore = p.unique >= 2 && p.unique <= 25 ? 1 : 0;
      const numericPenalty = p.numericPct > 0.9 && nameHint === 0 ? 1.5 : 0;
      return { p, score: nameHint + cardScore + p.nonBlank / Math.max(rowCount, 1) - numericPenalty };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DIMENSIONS)
    .map(x => x.p);
}

function pickMeasures(profiles: ColumnProfile[], dateName: string, dims: ColumnProfile[], rowCount: number): ColumnProfile[] {
  const dimNames = new Set(dims.map(d => d.name));
  return profiles.filter(p => {
    if (p.name === dateName || dimNames.has(p.name)) return false;
    if (p.numericPct < 0.7) return false;
    // Exclude ID-like: near-unique numerics or *Key/*Id names with high cardinality
    const idName = /key$|id$|number$|^id|sk$/i.test(p.name.trim());
    if (idName && p.unique > DIM_CARDINALITY_MAX) return false;
    // Near-unique pure-integer columns are IDs; near-unique decimals are real measures
    if (p.unique >= rowCount * 0.9 && rowCount > 100 && p.intPct > 0.99) return false;
    // Exclude yyyymmdd date keys that snuck through
    if (p.datePct >= 0.7) return false;
    return true;
  }).slice(0, 8);
}

// ── Cube builder ───────────────────────────────────────────
export function buildDataCube(
  fileName:  string,
  sheetName: string,
  headers:   string[],
  rows:      unknown[][],
): DataCube | null {
  if (rows.length < 10 || headers.length < 2) return null;

  const profiles = profileColumns(headers, rows);
  const dateCol  = pickDateColumn(profiles);
  if (!dateCol) return null;                       // no time axis → no interactive cube

  const dims     = pickDimensions(profiles, dateCol.name, rows.length);
  const measures = pickMeasures(profiles, dateCol.name, dims, rows.length);
  if (measures.length === 0) return null;          // nothing to aggregate

  // Top-N value sets per dimension (rest → "Other")
  const dimValueSets = dims.map(d => new Set(d.topValues.slice(0, MAX_DIM_VALUES).map(([v]) => v)));

  function aggregateAt(grainBase: "week" | "month") {
    const map = new Map<string, CubeRow>();
    let minD = "", maxD = "", skipped = 0;
    for (const row of rows) {
      const date = parseDateValue(row[dateCol!.index]);
      if (!date) { skipped++; continue; }
      const wk = grainBase === "week" ? weekStartISO(date) : monthStartISO(date);
      const mo = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const dayISO = date.toISOString().slice(0, 10);
      if (!minD || dayISO < minD) minD = dayISO;
      if (!maxD || dayISO > maxD) maxD = dayISO;

      const dvals: Record<string, string> = {};
      dims.forEach((d, i) => {
        const raw = row[d.index];
        const v = raw === null || raw === undefined || raw === "" ? "(blank)" : String(raw).trim();
        dvals[d.name] = dimValueSets[i].has(v) ? v : OTHER_LABEL;
      });

      const key = wk + "|" + mo + "|" + dims.map(d => dvals[d.name]).join("|");
      let cr = map.get(key);
      if (!cr) {
        cr = { w: wk, mo, d: dvals, m: {}, n: 0 };
        for (const ms of measures) cr.m[ms.name] = 0;
        map.set(key, cr);
      }
      cr.n++;
      for (const ms of measures) {
        const v = row[ms.index];
        if (isNumericValue(v)) cr.m[ms.name] += toNumber(v);
      }
    }
    return { map, minD, maxD, skipped };
  }

  let grainBase: "week" | "month" = "week";
  let agg = aggregateAt("week");
  if (agg.map.size > MAX_CUBE_ROWS) { grainBase = "month"; agg = aggregateAt("month"); }
  if (agg.map.size === 0) return null;

  const spanDays = Math.round((new Date(agg.maxD).getTime() - new Date(agg.minD).getTime()) / 86400000);
  const moneyRe  = /amount|price|cost|revenue|sales|total|profit|margin|fee|tax|pay|wage|salary|spend|income|expense/i;

  return {
    version: 1,
    fileName, sheetName,
    builtAt: new Date().toISOString(),
    dateField: dateCol.name,
    dateRange: { min: agg.minD, max: agg.maxD },
    spanDays,
    grainBase,
    dimensions: dims.map((d, i) => ({
      name: d.name,
      values: [...d.topValues.slice(0, MAX_DIM_VALUES).map(([v]) => v),
               ...(d.unique > MAX_DIM_VALUES ? [OTHER_LABEL] : [])],
    })),
    measures: measures.map(m => m.name),
    moneyMeasures: measures.filter(m => moneyRe.test(m.name)).map(m => m.name),
    rows: [...agg.map.values()],
    sourceRowCount: rows.length,
    skippedRows: agg.skipped,
  };
}

// ── Query engine ───────────────────────────────────────────
function endOfMonthISO(mo: string): string {
  const y = +mo.slice(0, 4), m = +mo.slice(5, 7);
  const last = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of mo
  return last.toISOString().slice(0, 10);
}
function addDaysISO(iso: string, days: number): string {
  return new Date(new Date(iso + "T00:00:00Z").getTime() + days * 86400000).toISOString().slice(0, 10);
}

export function filterRows(cube: DataCube, filters: Filters, win?: DateWindow): CubeRow[] {
  const active = Object.entries(filters).filter(([, vals]) => vals && vals.length > 0)
    .map(([k, vals]) => [k, new Set(vals)] as const);
  return cube.rows.filter(r => {
    if (win?.from || win?.to) {
      // True period of a cube row = intersection of its week and its month
      const moStart  = r.mo + "-01";
      const rowStart = r.w > moStart ? r.w : moStart;
      const weekEnd  = addDaysISO(r.w, 6);
      const moEnd    = endOfMonthISO(r.mo);
      const rowEnd   = weekEnd < moEnd ? weekEnd : moEnd;
      if (win.from && rowEnd < win.from) return false;
      if (win.to && rowStart > win.to) return false;
    }
    for (const [dim, allowed] of active) {
      if (!allowed.has(r.d[dim])) return false;
    }
    return true;
  });
}

export type MeasureSpec =
  | { kind: "field"; field: string }
  | { kind: "ratio"; num: string; den: string; pct?: boolean }       // sum(num)/sum(den)
  | { kind: "marginPct"; revenue: string; cost: string }             // (rev-cost)/rev
  | { kind: "count" };

export function computeMeasure(rows: CubeRow[], spec: MeasureSpec): number {
  if (spec.kind === "count") return rows.reduce((s, r) => s + r.n, 0);
  if (spec.kind === "field") return rows.reduce((s, r) => s + (r.m[spec.field] || 0), 0);
  if (spec.kind === "ratio") {
    const num = rows.reduce((s, r) => s + (r.m[spec.num] || 0), 0);
    const den = rows.reduce((s, r) => s + (r.m[spec.den] || 0), 0);
    return den === 0 ? 0 : (num / den) * (spec.pct ? 100 : 1);
  }
  const rev  = rows.reduce((s, r) => s + (r.m[spec.revenue] || 0), 0);
  const cost = rows.reduce((s, r) => s + (r.m[spec.cost] || 0), 0);
  return rev === 0 ? 0 : ((rev - cost) / rev) * 100;
}

export function seriesByGrain(
  rows: CubeRow[], grain: Grain, spec: MeasureSpec,
): { key: string; label: string; value: number }[] {
  const groups = new Map<string, CubeRow[]>();
  for (const r of rows) {
    const k = rowGrainKey(r, grain);
    const g = groups.get(k); if (g) g.push(r); else groups.set(k, [r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rs]) => ({ key, label: grainLabel(key, grain), value: computeMeasure(rs, spec) }));
}

export function byDimension(
  rows: CubeRow[], dim: string, spec: MeasureSpec, topN = 10,
): { label: string; value: number }[] {
  const groups = new Map<string, CubeRow[]>();
  for (const r of rows) {
    const k = r.d[dim] ?? "(blank)";
    const g = groups.get(k); if (g) g.push(r); else groups.set(k, [r]);
  }
  return [...groups.entries()]
    .map(([label, rs]) => ({ label, value: computeMeasure(rs, spec) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

// Multi-year overlay: month-of-year series per year (last `maxYears` years)
export function yoyOverlay(
  rows: CubeRow[], spec: MeasureSpec, maxYears = 3,
): { years: string[]; points: { monthIdx: number; label: string; values: Record<string, number | null> }[] } {
  const byYearMonth = new Map<string, Map<number, CubeRow[]>>();
  for (const r of rows) {
    const y = r.mo.slice(0, 4), mIdx = +r.mo.slice(5, 7) - 1;
    let ym = byYearMonth.get(y);
    if (!ym) { ym = new Map(); byYearMonth.set(y, ym); }
    const g = ym.get(mIdx); if (g) g.push(r); else ym.set(mIdx, [r]);
  }
  const years = [...byYearMonth.keys()].sort().slice(-maxYears);
  const points = MONTHS.map((label, monthIdx) => {
    const values: Record<string, number | null> = {};
    for (const y of years) {
      const rs = byYearMonth.get(y)?.get(monthIdx);
      values[y] = rs && rs.length ? computeMeasure(rs, spec) : null;
    }
    return { monthIdx, label, values };
  });
  return { years, points };
}

// Current vs prior period (trailing windows of equal length ending at cube max date)
export function periodComparison(
  cube: DataCube, filters: Filters, spec: MeasureSpec, days = 365,
): { current: number; prior: number; deltaPct: number | null } {
  const max = new Date(cube.dateRange.max + "T00:00:00Z");
  const curFrom = new Date(max.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const priTo   = new Date(max.getTime() - days * 86400000).toISOString().slice(0, 10);
  const priFrom = new Date(max.getTime() - (2 * days - 1) * 86400000).toISOString().slice(0, 10);
  const current = computeMeasure(filterRows(cube, filters, { from: curFrom }), spec);
  const prior   = computeMeasure(filterRows(cube, filters, { from: priFrom, to: priTo }), spec);
  return { current, prior, deltaPct: prior === 0 ? null : ((current - prior) / Math.abs(prior)) * 100 };
}

// Which time-intelligence features the dataset supports
export function timeCapabilities(cube: DataCube): {
  grains: Grain[]; multiYear: boolean; yoy: boolean; years: string[];
} {
  const span = cube.spanDays;
  const grains: Grain[] = [];
  if (cube.grainBase === "week" && span <= 430) grains.push("week");
  if (span >= 56)  grains.push("month");
  if (span >= 180) grains.push("quarter");
  if (span >= 420) grains.push("year");
  if (grains.length === 0) grains.push(cube.grainBase === "week" ? "week" : "month");
  const years = [...new Set(cube.rows.map(r => r.mo.slice(0, 4)))].sort();
  return { grains, multiYear: span >= 420, yoy: span >= 420 && years.length >= 2, years };
}

// Preset date windows
export function presetWindow(cube: DataCube, preset: "all" | "ytd" | "l12m" | "lastyear"): DateWindow {
  const max = cube.dateRange.max;
  if (preset === "all") return {};
  if (preset === "ytd") return { from: `${max.slice(0, 4)}-01-01` };
  if (preset === "l12m") {
    const d = new Date(max + "T00:00:00Z");
    return { from: new Date(d.getTime() - 364 * 86400000).toISOString().slice(0, 10) };
  }
  const prevYear = String(+max.slice(0, 4) - 1);
  return { from: `${prevYear}-01-01`, to: `${prevYear}-12-31` };
}

export function formatMeasureValue(v: number, measure: string, cube: DataCube, isPct = false): string {
  if (isPct) return `${v.toFixed(1)}%`;
  const money = cube.moneyMeasures.includes(measure);
  const abs = Math.abs(v);
  const num = abs >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M`
    : abs >= 10_000 ? `${(v / 1_000).toFixed(1)}K`
    : v % 1 === 0 ? v.toLocaleString() : v.toFixed(2);
  return money ? `$${num}` : num;
}

// ── Multi-sheet join enrichment (Option A) ─────────────────
// Given a fact sheet and the other sheets, look up dimension labels via
// foreign keys and inject them as extra columns BEFORE cube build, so the
// cube gains real business dimensions (Category, Product Name) not just keys.

export type SheetData = { name: string; headers: string[]; rows: unknown[][] };

type LookupSpec = {
  factKeyIdx:   number;        // column index of the FK in the fact sheet
  dimByKey:     Map<string, string>;  // dim key value -> label value
  newColName:   string;        // e.g. "Category" or "Product Name"
};

// Choose which descriptive columns to pull from a dimension table.
// Prefer low-cardinality category-like text columns (good for filtering).
function pickDimLabelColumns(dim: SheetData, keyColName: string): number[] {
  const out: { idx: number; score: number }[] = [];
  dim.headers.forEach((h, idx) => {
    if (!h || h === keyColName) return;
    if (/key$|id$|sk$|code$/i.test(h.trim())) return;          // skip other keys
    // sample cardinality + numeric share
    let nonBlank = 0, numeric = 0; const uniq = new Set<string>();
    const step = dim.rows.length > 5000 ? Math.ceil(dim.rows.length / 5000) : 1;
    for (let i = 0; i < dim.rows.length; i += step) {
      const v = dim.rows[i][idx];
      if (v === null || v === undefined || v === "") continue;
      nonBlank++; if (isNumericValue(v)) numeric++;
      if (uniq.size <= 200) uniq.add(String(v).trim());
    }
    if (nonBlank === 0) return;
    const numericPct = numeric / nonBlank;
    if (numericPct > 0.6) return;                               // skip numeric/measure cols
    if (uniq.size < 2 || uniq.size > 50) return;                // good dimension cardinality only
    const nameHint = /name|category|subcategory|type|class|group|segment|status|color|size|brand|region|country|department|title/i.test(h) ? 2 : 0;
    out.push({ idx, score: nameHint + (uniq.size <= 25 ? 1 : 0) });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, 2).map(x => x.idx);  // up to 2 labels per dim
}

// Build lookup specs from fact → each related dimension sheet.
export function buildJoinLookups(
  fact: SheetData,
  others: SheetData[],
  relationships: { fromColumn: string; toTable: string; toColumn: string }[],
): LookupSpec[] {
  const specs: LookupSpec[] = [];
  for (const rel of relationships) {
    const dim = others.find(s => s.name === rel.toTable);
    if (!dim) continue;
    const factKeyIdx = fact.headers.findIndex(h => h.toLowerCase() === rel.fromColumn.toLowerCase());
    const dimKeyIdx  = dim.headers.findIndex(h => h.toLowerCase() === rel.toColumn.toLowerCase());
    if (factKeyIdx < 0 || dimKeyIdx < 0) continue;

    const labelIdxs = pickDimLabelColumns(dim, dim.headers[dimKeyIdx]);
    if (labelIdxs.length === 0) continue;

    for (const labelIdx of labelIdxs) {
      const dimByKey = new Map<string, string>();
      for (const r of dim.rows) {
        const k = r[dimKeyIdx];
        if (k === null || k === undefined || k === "") continue;
        const lbl = r[labelIdx];
        dimByKey.set(String(k).trim(), lbl === null || lbl === undefined || lbl === "" ? "(blank)" : String(lbl).trim());
      }
      if (dimByKey.size > 0) {
        // Disambiguate column name if it collides with a fact column
        let newColName = dim.headers[labelIdx];
        if (fact.headers.includes(newColName)) newColName = `${dim.name.replace(/_data$|_dim$/i,"")}.${newColName}`;
        specs.push({ factKeyIdx, dimByKey, newColName });
      }
    }
  }
  return specs;
}

// Apply lookups: returns enriched headers + rows (fact rows + appended label columns)
export function enrichFactRows(
  fact: SheetData,
  lookups: LookupSpec[],
): { headers: string[]; rows: unknown[][] } {
  if (lookups.length === 0) return { headers: fact.headers, rows: fact.rows };
  const headers = [...fact.headers, ...lookups.map(l => l.newColName)];
  const rows = fact.rows.map(r => {
    const extra = lookups.map(l => {
      const k = r[l.factKeyIdx];
      if (k === null || k === undefined || k === "") return "(blank)";
      return l.dimByKey.get(String(k).trim()) ?? "(unmatched)";
    });
    return [...r, ...extra];
  });
  return { headers, rows };
}
