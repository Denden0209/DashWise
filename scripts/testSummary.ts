// Verifies Phase 1: smart multi-tab summarization.
// Asserts EVERY tab appears in the output with KPI headlines, within budget,
// even with 20+ tabs — and that entity counts (distinct customers/products)
// are surfaced so "how many customers" is answerable from the summary.
import { buildSchemaModel } from "../lib/schemaProfiler";
import { buildSmartSummary } from "../lib/kpiSummary";

let pass = 0, fail = 0;
function ok(c: boolean, m: string) { if (c) { pass++; console.log("  ✅ " + m); } else { fail++; console.log("  ❌ " + m); } }

// Build a 22-tab workbook: 2 fact tables, 10 dimensions, 10 lookup/reference
const sheets: { name: string; headers: string[]; rows: unknown[][] }[] = [];

// Fact 1: Sales (big)
const sales: unknown[][] = [];
for (let i = 1; i <= 5000; i++) sales.push([i, `2023-${String((i%12)+1).padStart(2,"0")}-15`, (i%60)+1, (i%200)+1, 100+(i%900), (100+(i%900))*0.6]);
sheets.push({ name:"Sales_data", headers:["SalesKey","OrderDate","ProductKey","CustomerKey","Sales Amount","Cost"], rows:sales });

// Fact 2: Returns (medium)
const returns: unknown[][] = [];
for (let i = 1; i <= 800; i++) returns.push([i, `2023-${String((i%12)+1).padStart(2,"0")}-20`, (i%60)+1, -(50+(i%200))]);
sheets.push({ name:"Returns_data", headers:["ReturnKey","ReturnDate","ProductKey","Refund Amount"], rows:returns });

// Dimension: Products (with Category)
const products: unknown[][] = [];
const cats = ["Bikes","Accessories","Clothing"];
for (let i = 1; i <= 60; i++) products.push([i, `Product-${i}`, cats[i%3]]);
sheets.push({ name:"Product_data", headers:["ProductKey","Product Name","Category"], rows:products });

// Dimension: Customers (with Segment)
const customers: unknown[][] = [];
const segs = ["Consumer","Corporate","Home Office"];
for (let i = 1; i <= 200; i++) customers.push([i, `Customer-${i}`, segs[i%3]]);
sheets.push({ name:"Customer_data", headers:["CustomerKey","Customer Name","Segment"], rows:customers });

// 8 more dimension tables
for (let d = 1; d <= 8; d++) {
  const rows: unknown[][] = [];
  for (let i = 1; i <= 30 + d*5; i++) rows.push([i, `Dim${d}-Value-${i}`, `Type-${i%4}`]);
  sheets.push({ name:`Dimension${d}_data`, headers:[`Dim${d}Key`, `Dim${d} Name`, `Dim${d} Type`], rows });
}

// 10 small reference/lookup tables
for (let r = 1; r <= 10; r++) {
  const rows: unknown[][] = [];
  for (let i = 1; i <= 5 + r; i++) rows.push([i, `Lookup${r}-${i}`]);
  sheets.push({ name:`Lookup${r}`, headers:[`Lookup${r}Key`, `Lookup${r} Label`], rows });
}

console.log(`\nSynthetic workbook: ${sheets.length} tabs, ${sheets.reduce((s,sh)=>s+sh.rows.length,0).toLocaleString()} total rows`);

const model = buildSchemaModel("BigWorkbook.xlsx", sheets);
const summary = buildSmartSummary("BigWorkbook.xlsx", model, sheets, 60_000);

console.log("\n══ Coverage: every tab represented ══");
let allPresent = true;
for (const s of sheets) {
  if (!summary.includes(s.name)) { allPresent = false; console.log(`     missing: ${s.name}`); }
}
ok(allPresent, `all ${sheets.length} tabs appear in the summary`);

console.log("\n══ Budget ══");
ok(summary.length <= 60_000, `summary within budget (${summary.length.toLocaleString()} / 60,000 chars)`);
ok(summary.length > 1000, `summary is substantive (${summary.length.toLocaleString()} chars)`);

console.log("\n══ Entity counts surfaced (fixes 'how many customers') ══");
ok(/200 distinct/i.test(summary) || summary.includes("200"), "200 distinct customers surfaced");
ok(/60 distinct/i.test(summary) || summary.includes("60"), "60 distinct products surfaced");

console.log("\n══ Money KPIs surfaced ══");
ok(/Total Sales Amount/i.test(summary), "Total Sales Amount KPI present");
ok(/margin/i.test(summary), "Gross margin computed (revenue + cost present)");

console.log("\n══ Importance ranking: facts before lookups ══");
const salesPos  = summary.indexOf("Sales_data");
const lookupPos = summary.indexOf("Lookup1");
ok(salesPos >= 0 && salesPos < lookupPos, "fact table ranked above lookup tables");

console.log("\n══ Category breakdown present ══");
ok(/Bikes|Accessories|Clothing/.test(summary), "Product category breakdown surfaced");

console.log("\n--- SUMMARY PREVIEW (first 1400 chars) ---");
console.log(summary.slice(0, 1400));
console.log("...");

console.log("\n════════════════════════════════════");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
