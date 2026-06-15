// lib/kpiSummary.ts
// Smart multi-tab summarization (Phase 1).
// For each sheet: extract headline KPIs a business person cares about,
// rank sheets by importance, then assemble a budget-aware summary where
// EVERY sheet is represented — fact tables get rich detail, dimension
// tables get tight KPI blocks, lookup tables get one-liners.
// Pure browser code — zero API cost. Uses the schema model's classification.

import { SchemaModel, TableInfo, ColumnInfo } from "@/lib/schemaProfiler";
import { parseDateValue, isNumericValue, toNumber } from "@/lib/dataCube";

export type SheetKpi = {
  sheet:       string;
  role:        string;
  rowCount:    number;
  importance:  number;
  kpiLines:    string[];   // headline KPIs (always included)
  detailLines: string[];   // deeper stats (budget-permitting)
};

const MONEY_RE = /amount|price|cost|revenue|sales|total|profit|margin|fee|tax|pay|wage|salary|spend|income|expense|balance|value/i;
const TOP_N    = 8;
const SAMPLE_CAP = 20_000;

function fmtNum(n: number): string {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n/1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)     return `${(n/1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)         return `${(n/1_000).toFixed(1)}K`;
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
}

// ── Compute KPIs for one table from its raw rows + column profiles ──
function extractSheetKpis(
  table:   TableInfo,
  headers: string[],
  rows:    unknown[][],
): SheetKpi {
  const kpiLines: string[]    = [];
  const detailLines: string[] = [];
  const step = rows.length > SAMPLE_CAP ? Math.ceil(rows.length / SAMPLE_CAP) : 1;
  const scale = rows.length / Math.max(1, Math.ceil(rows.length / step)); // correct sampled sums back up

  // Always: record count
  kpiLines.push(`${rows.length.toLocaleString()} rows`);

  // ── Entity counts (distinct keys) — answers "how many customers/products" ──
  const keyCols = table.columns.filter(c => c.role === "key");
  for (const kc of keyCols) {
    // Heuristic: a key whose distinct count is close to row count is the PK (entity id)
    const isEntityPk = kc.uniquePct >= 80;
    const label = kc.name.replace(/key$|id$|_id$|sk$/i, "").trim() || kc.name;
    if (isEntityPk && table.role !== "fact") {
      kpiLines.push(`${kc.unique.toLocaleString()} distinct ${label || kc.name}`);
    } else if (table.role === "fact") {
      // In a fact table, low-uniqueness keys = how many distinct entities transacted
      kpiLines.push(`${kc.unique.toLocaleString()} distinct ${label || kc.name}`);
    }
  }

  // ── Money / measure totals ──
  const measureCols = table.columns.filter(c => c.role === "measure");
  const moneyCols   = measureCols.filter(c => MONEY_RE.test(c.name));
  const headlineMeasures = (moneyCols.length ? moneyCols : measureCols).slice(0, 4);

  let revenueCol: ColumnInfo | undefined;
  let costCol: ColumnInfo | undefined;

  for (const mc of headlineMeasures) {
    let sum = 0, cnt = 0, neg = 0;
    for (let i = 0; i < rows.length; i += step) {
      const v = rows[i][mc.index];
      if (isNumericValue(v)) { const n = toNumber(v); sum += n; cnt++; if (n < 0) neg++; }
    }
    const total = sum * scale;
    const avg   = cnt ? sum / cnt : 0;
    const isMoney = MONEY_RE.test(mc.name);
    kpiLines.push(`Total ${mc.name}: ${isMoney ? "$" : ""}${fmtNum(total)}`);
    detailLines.push(`${mc.name}: total ${isMoney?"$":""}${fmtNum(total)}, avg ${isMoney?"$":""}${fmtNum(avg)}${mc.min!==undefined?`, range ${fmtNum(mc.min)}..${fmtNum(mc.max!)}`:""}${neg>0?`, ${Math.round(neg*scale)} negative`:""}`);
    if (/revenue|sales amount|sales$|amount$|total$/i.test(mc.name) && !revenueCol) revenueCol = mc;
    if (/cost|expense/i.test(mc.name) && !costCol) costCol = mc;
  }

  // ── Margin if revenue + cost both present ──
  if (revenueCol && costCol) {
    let rev = 0, cost = 0;
    for (let i = 0; i < rows.length; i += step) {
      const rv = rows[i][revenueCol.index], cv = rows[i][costCol.index];
      if (isNumericValue(rv)) rev += toNumber(rv);
      if (isNumericValue(cv)) cost += toNumber(cv);
    }
    if (rev > 0) {
      const marginPct = ((rev - cost) / rev) * 100;
      kpiLines.push(`Gross margin: ${marginPct.toFixed(1)}% ($${fmtNum((rev-cost)*scale)})`);
    }
  }

  // ── Date span ──
  const dateCol = table.columns.find(c => c.role === "date");
  if (dateCol) {
    let minD = "", maxD = "";
    for (let i = 0; i < rows.length; i += step) {
      const d = parseDateValue(rows[i][dateCol.index]);
      if (!d) continue;
      const iso = d.toISOString().slice(0,10);
      if (!minD || iso < minD) minD = iso;
      if (!maxD || iso > maxD) maxD = iso;
    }
    if (minD) kpiLines.push(`${dateCol.name}: ${minD} → ${maxD}`);
  }

  // ── Top categorical breakdown (best dimension column) ──
  const dimCols = table.columns.filter(c => c.role === "dimension");
  const bestDim = dimCols.sort((a,b) => a.unique - b.unique)[0];
  if (bestDim && bestDim.unique <= 50) {
    const freq = new Map<string, number>();
    for (let i = 0; i < rows.length; i += step) {
      const v = rows[i][bestDim.index];
      if (v === null || v === undefined || v === "") continue;
      const k = String(v).trim();
      freq.set(k, (freq.get(k) || 0) + 1);
    }
    const top = [...freq.entries()].sort((a,b) => b[1]-a[1]).slice(0, TOP_N);
    const total = [...freq.values()].reduce((s,n)=>s+n, 0) || 1;
    if (top.length) {
      const breakdown = top.map(([k,n]) => `${k} ${((n/total)*100).toFixed(0)}%`).join(", ");
      kpiLines.push(`By ${bestDim.name}: ${breakdown}`);
    }
    // Detail: all dimension columns with their cardinality
    for (const dc of dimCols.slice(0, 4)) {
      detailLines.push(`${dc.name}: ${dc.unique} distinct values`);
    }
  }

  // ── Data quality headline ──
  const qualityIssues = table.columns.flatMap(c => c.quality.map(q => `${c.name}: ${q}`));
  if (qualityIssues.length) {
    kpiLines.push(`⚠ ${qualityIssues.length} data quality flag${qualityIssues.length!==1?"s":""}`);
    detailLines.push(...qualityIssues.slice(0, 6).map(q => `⚠ ${q}`));
  }

  // ── Importance score ──
  let importance = 0;
  if (table.role === "fact")      importance += 100;
  if (table.role === "flat")      importance += 80;
  if (table.role === "dimension") importance += 40;
  if (table.role === "bridge")    importance += 20;
  if (table.role === "reference") importance += 25;
  if (moneyCols.length)           importance += 30;
  if (dateCol)                    importance += 25;
  importance += Math.min(20, Math.log10(rows.length + 1) * 5);
  importance += measureCols.length * 3;

  return {
    sheet: table.name, role: table.role, rowCount: rows.length,
    importance, kpiLines, detailLines,
  };
}

// ── Build the full multi-sheet smart summary (budget-aware) ──
export function buildSmartSummary(
  fileName: string,
  schema:   SchemaModel,
  sheets:   { name: string; headers: string[]; rows: unknown[][] }[],
  charBudget = 60_000,
): string {
  // Extract KPIs for every sheet
  const kpis: SheetKpi[] = [];
  for (const t of schema.tables) {
    const sheet = sheets.find(s => s.name === t.name);
    if (!sheet) continue;
    kpis.push(extractSheetKpis(t, sheet.headers, sheet.rows));
  }
  // Rank by importance (desc)
  kpis.sort((a,b) => b.importance - a.importance);

  const lines: string[] = [];
  lines.push(`FILE: ${fileName} — ${schema.shape.toUpperCase()} schema, ${schema.tables.length} tables, ${schema.totalRows.toLocaleString()} total rows`);
  if (schema.factTables.length)      lines.push(`Fact tables: ${schema.factTables.join(", ")}`);
  if (schema.dimensionTables.length) lines.push(`Dimension tables: ${schema.dimensionTables.join(", ")}`);
  lines.push("");

  // Pass 1 — every sheet gets its KPI headline block (guaranteed inclusion)
  for (const k of kpis) {
    lines.push(`■ ${k.sheet} [${k.role}] — ${k.rowCount.toLocaleString()} rows`);
    for (const line of k.kpiLines) lines.push(`   • ${line}`);
    lines.push("");
  }

  // Pass 2 — fill remaining budget with detail, highest-importance first
  let used = lines.join("\n").length;
  if (used < charBudget) {
    lines.push("── Detailed breakdown (top tables) ──");
    for (const k of kpis) {
      if (used >= charBudget) break;
      if (!k.detailLines.length) continue;
      const block = [`▸ ${k.sheet} detail:`, ...k.detailLines.map(d => `   ${d}`), ""];
      const blockText = block.join("\n");
      if (used + blockText.length > charBudget) continue; // skip if it would overflow; try next
      lines.push(...block);
      used += blockText.length;
    }
  }

  // Relationships (compact)
  if (schema.relationships.length) {
    lines.push("── Join graph ──");
    for (const r of schema.relationships.slice(0, 20)) {
      lines.push(`   ${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn} [${r.cardinality}, ${r.matchPct}% match]`);
    }
  }

  return lines.join("\n");
}
