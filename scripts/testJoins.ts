// Verifies Option A (multi-sheet join enrichment) produces correct numbers:
// a fact table joined to dimension tables should let us aggregate by the
// dimension's descriptive columns — and totals must match brute-force sums.
import { buildSchemaModel } from "../lib/schemaProfiler";
import { buildJoinLookups, enrichFactRows, buildDataCube, filterRows, computeMeasure, SheetData } from "../lib/dataCube";

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); } }

// ── Synthetic star schema (AdventureWorks-like) ──
const CATEGORIES = ["Bikes", "Accessories", "Clothing"];
const products: unknown[][] = [];
for (let pk = 1; pk <= 60; pk++) {
  products.push([pk, `Product-${pk}`, CATEGORIES[pk % 3]]);
}
const productHeaders = ["ProductKey", "Product Name", "Category"];

const customers: unknown[][] = [];
const SEGMENTS = ["Consumer", "Corporate", "Home Office"];
for (let ck = 1; ck <= 200; ck++) customers.push([ck, `Customer-${ck}`, SEGMENTS[ck % 3]]);
const customerHeaders = ["CustomerKey", "Customer Name", "Segment"];

// Fact: sales with FK to product + customer + a date + amount
const sales: unknown[][] = [];
const salesHeaders = ["SalesKey", "OrderDate", "ProductKey", "CustomerKey", "Sales Amount", "Cost"];
let bikesTotal = 0, corporateTotal = 0, grandTotal = 0;
let n = 0;
for (let y = 2021; y <= 2023; y++) {
  for (let m = 1; m <= 12; m++) {
    for (let i = 0; i < 50; i++) {
      n++;
      const pk = (n % 60) + 1;
      const ck = (n % 200) + 1;
      const amt = 100 + (n % 500);
      const cost = amt * 0.6;
      const date = `${y}-${String(m).padStart(2,"0")}-15`;
      sales.push([n, date, pk, ck, amt, cost]);
      grandTotal += amt;
      if (CATEGORIES[pk % 3] === "Bikes") bikesTotal += amt;
      if (SEGMENTS[ck % 3] === "Corporate") corporateTotal += amt;
    }
  }
}

console.log(`\nSynthetic star: ${sales.length} sales, ${products.length} products, ${customers.length} customers`);

// ── Build schema model ──
const model = buildSchemaModel("AdventureWorks.xlsx", [
  { name: "Sales_data",    headers: salesHeaders,    rows: sales },
  { name: "Product_data",  headers: productHeaders,  rows: products },
  { name: "Customer_data", headers: customerHeaders, rows: customers },
]);

console.log("\n══ Schema detection ══");
ok(model.shape === "star", `shape detected as star (got: ${model.shape})`);
ok(model.factTables.includes("Sales_data"), "Sales_data identified as fact");
ok(model.dimensionTables.includes("Product_data"), "Product_data identified as dimension");
ok(model.dimensionTables.includes("Customer_data"), "Customer_data identified as dimension");
ok(model.relationships.some(r => r.fromTable === "Sales_data" && r.toTable === "Product_data"), "Sales→Product relationship found");
ok(model.relationships.some(r => r.fromTable === "Sales_data" && r.toTable === "Customer_data"), "Sales→Customer relationship found");

// ── Apply joins ──
const factSheet: SheetData = { name: "Sales_data", headers: salesHeaders, rows: sales };
const others: SheetData[] = [
  { name: "Product_data",  headers: productHeaders,  rows: products },
  { name: "Customer_data", headers: customerHeaders, rows: customers },
];
const rels = model.relationships.filter(r => r.fromTable === "Sales_data");
const lookups = buildJoinLookups(factSheet, others, rels);
console.log("\n══ Join enrichment ══");
ok(lookups.length >= 2, `built ${lookups.length} label lookups (Category, Segment, names)`);

const enriched = enrichFactRows(factSheet, lookups);
ok(enriched.headers.includes("Category"), "Category column added to fact rows");
ok(enriched.headers.includes("Segment"), "Segment column added to fact rows");
ok(enriched.rows.length === sales.length, "row count preserved after enrichment");

// ── Build cube from enriched fact ──
const cube = buildDataCube("AdventureWorks.xlsx", "Sales_data", enriched.headers, enriched.rows);
console.log("\n══ Cube with joined dimensions ══");
ok(!!cube, "cube built from enriched fact");
if (cube) {
  const dimNames = cube.dimensions.map(d => d.name);
  ok(dimNames.includes("Category"), `Category is now a filterable dimension (dims: ${dimNames.join(", ")})`);
  ok(dimNames.includes("Segment"), "Segment is now a filterable dimension");

  // Total check
  const allRows = filterRows(cube, {}, {});
  const total = computeMeasure(allRows, { kind:"field", field:"Sales Amount" });
  ok(Math.abs(total - grandTotal) < 1, `grand total ${total} matches brute force ${grandTotal}`);

  // Filter by Category=Bikes → must match brute-force bikes total
  const bikeRows = filterRows(cube, { Category: ["Bikes"] }, {});
  const bikeSum  = computeMeasure(bikeRows, { kind:"field", field:"Sales Amount" });
  ok(Math.abs(bikeSum - bikesTotal) < 1, `Bikes total ${bikeSum} matches brute force ${bikesTotal}`);

  // Filter by Segment=Corporate → must match brute-force corporate total
  const corpRows = filterRows(cube, { Segment: ["Corporate"] }, {});
  const corpSum  = computeMeasure(corpRows, { kind:"field", field:"Sales Amount" });
  ok(Math.abs(corpSum - corporateTotal) < 1, `Corporate total ${corpSum} matches brute force ${corporateTotal}`);
}

console.log("\n════════════════════════════════════");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
