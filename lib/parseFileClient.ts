// lib/parseFileClient.ts
// Client-side parser + smart summarizer + data cube builder.
// Runs entirely in the browser — zero API cost, no server request.
// Outputs: (1) compact summary text for Claude, (2) DataCube for the
// interactive dashboard, (3) SchemaModel for the Developer tab.
//
// All tabular formats (CSV, Excel, delimited TXT, tabular JSON, PDF tables)
// flow through ONE pipeline — materializeSheet → buildTabularResult — so the
// schema model, smart summary and interactive cube are produced consistently.

import { buildDataCube, DataCube, buildJoinLookups, enrichFactRows, SheetData } from "@/lib/dataCube";
import { buildSchemaModel, SchemaModel } from "@/lib/schemaProfiler";
import { buildSmartSummary } from "@/lib/kpiSummary";

export type ParseResult = {
  content:    string;     // smart summary text sent to Claude / stored in Firestore
  sheets:     string[];
  rowCount:   number;
  fileType:   string;
  fileName:   string;
  chars:      number;
  truncated:  boolean;
  summarized: boolean;
  cube:       DataCube | null;     // powers the interactive dashboard (null = static only)
  schema:     SchemaModel | null;  // powers the Developer tab + richer analysis (Option B)
};

const RAW_ROW_LIMIT     = 500;
const MAX_CONTENT_CHARS = 800_000;
const TOP_N             = 15;
const MAX_SHEETS        = 20;

// ── Helpers ────────────────────────────────────────────────
function isNumeric(val: unknown): boolean {
  if (val === null || val === undefined || val === "") return false;
  if (typeof val === "number") return !isNaN(val);
  const s = String(val).replace(/[$,%]/g, "").trim();
  return !isNaN(parseFloat(s)) && isFinite(Number(s));
}
function toNumber(val: unknown): number {
  if (typeof val === "number") return val;
  return parseFloat(String(val).replace(/[$,%]/g, "").trim());
}
function isDateLike(val: unknown): boolean {
  if (val instanceof Date) return true;
  if (typeof val === "number" && val > 40000 && val < 60000) return true;
  const s = String(val);
  return /^\d{4}[-/]\d{2}[-/]\d{2}/.test(s) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s) || /^\d{8}$/.test(s);
}
function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n/1_000).toFixed(1)}K`;
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
}
function isSummaryRow(row: unknown[], headers: string[]): boolean {
  const first = String(row[0] || "").toLowerCase().trim();
  const summaryWords = ["total","sum","grand","subtotal","average","avg","count","overall","summary"];
  if (summaryWords.some(w => first.includes(w))) return true;
  const nonEmpty = row.filter(c => c !== null && c !== undefined && c !== "").length;
  if (nonEmpty <= 1 && headers.length > 3) return true;
  return false;
}

// Header detection: scans the first ~15 rows (real spreadsheets often have a
// title/notes block before the header) and scores each candidate on how
// "header-like" it is — mostly text, distinct values, densely filled, and not
// numeric. The highest-scoring row wins. Used by every tabular format.
function detectHeaderRow(aoa: unknown[][]): number {
  const scan = Math.min(15, aoa.length);
  let best = 0, bestScore = -Infinity;
  for (let i = 0; i < scan; i++) {
    const rawRow  = (aoa[i] as unknown[]) || [];
    const cells   = rawRow.map(c => String(c ?? "").trim());
    const nonEmpty = cells.filter(Boolean).length;
    if (nonEmpty < 2) continue;                                   // title/blank rows
    const strCount = cells.filter(c => c && isNaN(Number(c))).length;
    const numCount = rawRow.filter(c => isNumeric(c)).length;
    const uniqPct  = new Set(cells.filter(Boolean)).size / Math.max(nonEmpty, 1);
    const density  = nonEmpty / Math.max(rawRow.length, 1);
    const score    = strCount - numCount + uniqPct * 3 + density * 2;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

// Materialize an array-of-arrays into the universal { name, headers, rows }
// interface consumed by buildSchemaModel + buildDataCube.
function materializeSheet(name: string, aoa: unknown[][]): SheetData {
  const headerIdx = detectHeaderRow(aoa);
  const headers   = ((aoa[headerIdx] as unknown[]) || []).map(h => String(h ?? "").trim());
  const rows      = aoa.slice(headerIdx + 1).filter(row =>
    !row.every(c => c === null || c === undefined || c === "") && !isSummaryRow(row, headers)
  );
  return { name, headers, rows };
}

// ── Summarize one sheet (legacy fallback when schema build fails) ──────────
function summarizeSheet(sheetName: string, aoa: unknown[][]): string {
  if (aoa.length === 0) return `=== SHEET: ${sheetName} ===\n(empty)\n`;

  const headerIdx = detectHeaderRow(aoa);
  const headers   = (aoa[headerIdx] as unknown[]).map(h => String(h || "").trim());
  const dataRows  = aoa.slice(headerIdx + 1).filter(row => {
    if (row.every(c => c === null || c === undefined || c === "")) return false;
    if (isSummaryRow(row, headers)) return false;
    return true;
  });
  const totalRows = dataRows.length;

  if (totalRows <= RAW_ROW_LIMIT) {
    const lines = [headers.join(",")];
    dataRows.forEach(row => {
      lines.push(row.map(c => {
        if (c == null) return "";
        if (c instanceof Date) return c.toISOString().split("T")[0];
        return String(c).replace(/,/g, ";");
      }).join(","));
    });
    return `=== SHEET: ${sheetName} (${totalRows} rows — full data) ===\n${lines.join("\n")}\n`;
  }

  const lines: string[] = [];
  lines.push(`=== SHEET: ${sheetName} (${totalRows.toLocaleString()} rows) ===`);
  const numericSummaries: string[] = [];
  const categoricalSummaries: string[] = [];
  const dateSummaries: string[] = [];
  const qualityFlags: string[] = [];

  for (let col = 0; col < headers.length; col++) {
    const header = headers[col] || `Column_${col + 1}`;
    const values = dataRows.map(r => r[col]);
    const blank    = values.filter(v => v === null || v === undefined || v === "").length;
    const nonBlank = values.filter(v => v !== null && v !== undefined && v !== "");
    const blankPct = ((blank / totalRows) * 100).toFixed(1);
    if (blank > totalRows * 0.5) qualityFlags.push(`⚠ "${header}": ${blankPct}% missing values`);

    const numericVals = nonBlank.filter(v => isNumeric(v)).map(v => toNumber(v));
    const dateVals    = nonBlank.filter(v => isDateLike(v));
    const numericPct  = nonBlank.length > 0 ? numericVals.length / nonBlank.length : 0;
    const datePct     = nonBlank.length > 0 ? dateVals.length / nonBlank.length : 0;

    if (datePct >= 0.7 || /date|time/i.test(header)) {
      const parsedDates: Date[] = [];
      nonBlank.forEach(v => {
        if (v instanceof Date) { parsedDates.push(v); return; }
        if (typeof v === "number" && v > 40000 && v < 60000) {
          parsedDates.push(new Date((v - 25569) * 86400 * 1000)); return;
        }
        if (typeof v === "number" && v >= 19000101 && v <= 21001231) {
          const s = String(Math.trunc(v));
          const d = new Date(Date.UTC(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8)));
          if (!isNaN(d.getTime())) parsedDates.push(d);
          return;
        }
        const d = new Date(String(v));
        if (!isNaN(d.getTime())) parsedDates.push(d);
      });
      if (parsedDates.length > 0) {
        const sorted  = parsedDates.sort((a, b) => a.getTime() - b.getTime());
        const minDate = sorted[0].toISOString().split("T")[0];
        const maxDate = sorted[sorted.length - 1].toISOString().split("T")[0];
        const byMonth: Record<string, number> = {};
        parsedDates.forEach(d => {
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
          byMonth[key] = (byMonth[key] || 0) + 1;
        });
        const months    = Object.entries(byMonth).sort(([a],[b]) => a.localeCompare(b));
        const peakMonth = months.reduce((a, b) => b[1] > a[1] ? b : a, months[0]);
        let summary = `  ${header}:\n    Range: ${minDate} to ${maxDate}\n`;
        summary += `    Parsed: ${parsedDates.length.toLocaleString()} of ${nonBlank.length.toLocaleString()} dates\n`;
        summary += `    Peak month: ${peakMonth[0]} (${peakMonth[1].toLocaleString()} records)\n`;
        if (months.length <= 24) {
          summary += `    Monthly breakdown:\n`;
          months.forEach(([m, cnt]) => { summary += `      ${m}: ${cnt.toLocaleString()} records\n`; });
        }
        dateSummaries.push(summary);
        continue;
      }
    }

    if (numericPct >= 0.7 && numericVals.length >= 10) {
      const sorted = [...numericVals].sort((a, b) => a - b);
      const sum    = numericVals.reduce((s, v) => s + v, 0);
      const avg    = sum / numericVals.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const negCount  = numericVals.filter(v => v < 0).length;
      const zeroCount = numericVals.filter(v => v === 0).length;
      const variance  = numericVals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / numericVals.length;
      const stdDev    = Math.sqrt(variance);
      let summary = `  ${header}:\n`;
      summary += `    Sum=${formatNumber(sum)} | Avg=${formatNumber(avg)} | Median=${formatNumber(median)}\n`;
      summary += `    Min=${formatNumber(sorted[0])} | Max=${formatNumber(sorted[sorted.length-1])} | StdDev=${formatNumber(stdDev)}\n`;
      if (blank > 0)    summary += `    Missing: ${blank.toLocaleString()} rows (${blankPct}%)\n`;
      if (negCount > 0) summary += `    Negative values: ${negCount.toLocaleString()} (possible refunds/returns)\n`;
      if (zeroCount > totalRows * 0.1) summary += `    Zero values: ${zeroCount.toLocaleString()} (${((zeroCount/totalRows)*100).toFixed(1)}%)\n`;
      const outliers = numericVals.filter(v => Math.abs(v - avg) > 3 * stdDev);
      if (outliers.length > 0 && outliers.length < totalRows * 0.01)
        summary += `    ⚠ ${outliers.length} potential outliers (>3σ from mean)\n`;
      numericSummaries.push(summary);
    } else {
      const strVals = nonBlank.map(v => String(v).trim()).filter(v => v);
      const unique  = new Set(strVals);
      if (unique.size === totalRows || unique.size > totalRows * 0.95) {
        categoricalSummaries.push(`  ${header}: ${unique.size.toLocaleString()} unique values (ID/key column)`);
      } else {
        const freq: Record<string, number> = {};
        strVals.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
        const sorted = Object.entries(freq).sort(([,a],[,b]) => b - a);
        let summary = `  ${header} (${unique.size} unique values):\n`;
        sorted.slice(0, TOP_N).forEach(([val, cnt]) => {
          summary += `    "${val}": ${cnt.toLocaleString()} (${((cnt/totalRows)*100).toFixed(1)}%)\n`;
        });
        if (sorted.length > TOP_N) summary += `    ... and ${sorted.length - TOP_N} more values\n`;
        if (blank > 0) summary += `    Missing: ${blank.toLocaleString()} (${blankPct}%)\n`;
        categoricalSummaries.push(summary);
      }
    }
  }

  if (numericSummaries.length)     { lines.push("\nNUMERIC COLUMNS:");     lines.push(...numericSummaries); }
  if (dateSummaries.length)        { lines.push("\nDATE COLUMNS:");        lines.push(...dateSummaries); }
  if (categoricalSummaries.length) { lines.push("\nCATEGORICAL COLUMNS:"); lines.push(...categoricalSummaries); }
  if (qualityFlags.length)         { lines.push("\nDATA QUALITY FLAGS:");  qualityFlags.forEach(f => lines.push(`  ${f}`)); }
  return lines.join("\n") + "\n";
}

// Build cube from the best candidate sheet, ENRICHED with dimension labels
// pulled in via foreign-key joins (Option A). The schema model tells us which
// sheet is the fact table and how it joins to dimension tables.
function buildBestCube(
  fileName: string,
  sheets: { name: string; aoa: unknown[][] }[],
  schema: SchemaModel | null,
): DataCube | null {
  const parsed: SheetData[] = sheets.map(s => materializeSheet(s.name, s.aoa));

  // Candidate fact sheets: prefer schema-identified fact tables, then by row count
  const factNames = new Set(schema?.factTables || []);
  const candidates = [...parsed].sort((a, b) => {
    const af = factNames.has(a.name) ? 1 : 0, bf = factNames.has(b.name) ? 1 : 0;
    if (af !== bf) return bf - af;
    return b.rows.length - a.rows.length;
  });

  for (const fact of candidates) {
    try {
      let useHeaders = fact.headers;
      let useRows    = fact.rows;

      // Apply joins if the schema knows this sheet's relationships
      if (schema) {
        const rels = schema.relationships.filter(r => r.fromTable === fact.name);
        if (rels.length > 0) {
          const others  = parsed.filter(p => p.name !== fact.name);
          const lookups = buildJoinLookups(fact, others, rels);
          if (lookups.length > 0) {
            const enriched = enrichFactRows(fact, lookups);
            useHeaders = enriched.headers;
            useRows    = enriched.rows;
          }
        }
      }

      const cube = buildDataCube(fileName, fact.name, useHeaders, useRows);
      if (cube) return cube;
    } catch (e) {
      console.warn("[cube] build failed for sheet", fact.name, e);
    }
  }
  return null;
}

// ── The shared tabular pipeline ────────────────────────────
// CSV, Excel, delimited TXT, tabular JSON and PDF tables all converge here.
// Produces schema model + smart summary + interactive cube in one place.
function buildTabularResult(
  fileName: string,
  fileType: string,
  sheetAoAs: { name: string; aoa: unknown[][] }[],
  opts: { rawText?: string; rawRowThreshold?: number; sheets?: string[] } = {},
): ParseResult {
  const materialized = sheetAoAs.map(s => materializeSheet(s.name, s.aoa));
  const totalRows    = materialized.reduce((sum, m) => sum + m.rows.length, 0);

  let schema: SchemaModel | null = null;
  try { schema = buildSchemaModel(fileName, materialized); }
  catch (e) { console.warn("[schema] build failed", e); }

  const cube = buildBestCube(fileName, sheetAoAs, schema);

  // Small files: keep the original raw text verbatim (cheaper, lossless).
  let content: string;
  let summarized: boolean;
  if (opts.rawText !== undefined && opts.rawRowThreshold !== undefined && totalRows <= opts.rawRowThreshold) {
    content    = opts.rawText;
    summarized = false;
  } else if (schema) {
    content    = buildSmartSummary(fileName, schema, materialized, 60_000);
    summarized = true;
  } else {
    content    = sheetAoAs.map(s => summarizeSheet(s.name, s.aoa)).join("\n");
    summarized = true;
  }

  if (cube && summarized) {
    content += `\n[INTERACTIVE DASHBOARD: enabled from sheet "${cube.sheetName}" — ` +
      `${cube.sourceRowCount.toLocaleString()} rows, ${cube.dateRange.min} to ${cube.dateRange.max}, ` +
      `dimensions: ${cube.dimensions.map(d => d.name).join(", ")}]`;
  }

  const sheets = opts.sheets ?? (sheetAoAs.length > 1 ? sheetAoAs.map(s => s.name) : []);
  return {
    content, sheets, rowCount: totalRows,
    fileType, fileName, chars: content.length,
    truncated: content.length > MAX_CONTENT_CHARS, summarized, cube, schema,
  };
}

// ── Excel ──────────────────────────────────────────────────
async function parseExcel(file: File): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const ab   = await file.arrayBuffer();
  const wb   = XLSX.read(ab, { type:"array", cellDates:true });

  // Skip hidden / very-hidden sheets (Hidden: 0=visible, 1=hidden, 2=veryHidden)
  const meta         = wb.Workbook?.Sheets;
  const visibleNames = wb.SheetNames.filter((_, i) => ((meta?.[i]?.Hidden ?? 0) === 0));
  const sheetNames   = (visibleNames.length ? visibleNames : wb.SheetNames).slice(0, MAX_SHEETS);

  const sheetAoAs: { name: string; aoa: unknown[][] }[] = [];
  for (const sheetName of sheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header:1, defval:"", raw:true });
    if (aoa.length === 0) continue;

    // Fill merged cells: sheet_to_json only fills the merge's top-left anchor,
    // leaving the rest blank — common in financial reports with merged headers.
    const merges = ws["!merges"] as { s:{r:number;c:number}; e:{r:number;c:number} }[] | undefined;
    if (merges) {
      for (const m of merges) {
        const anchor = (aoa[m.s.r] as unknown[] | undefined)?.[m.s.c];
        if (anchor === undefined || anchor === "" || anchor === null) continue;
        for (let r = m.s.r; r <= m.e.r; r++) {
          const row = aoa[r] as unknown[] | undefined;
          if (!row) continue;
          for (let c = m.s.c; c <= m.e.c; c++) if (row[c] === "" || row[c] == null) row[c] = anchor;
        }
      }
    }
    sheetAoAs.push({ name: sheetName, aoa });
  }

  if (sheetAoAs.length === 0) throw new Error("This Excel file has no readable sheets.");

  const fileType = file.name.split(".").pop()?.toLowerCase() || "xlsx";
  return buildTabularResult(file.name, fileType, sheetAoAs, { sheets: sheetNames });
}

// ── CSV (papaparse: robust quotes/newlines + auto delimiter) ───────────────
async function parseCSV(file: File): Promise<ParseResult> {
  const text = await file.text();
  const Papa = (await import("papaparse")).default;
  const res  = Papa.parse<unknown[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: true,
    delimiter: "",            // "" = auto-detect ',' ';' '\t' '|'
  });
  const aoa = (res.data as unknown[][]) || [];
  return buildTabularResult(file.name, "csv", [{ name: file.name, aoa }],
    { rawText: text, rawRowThreshold: RAW_ROW_LIMIT });
}

// ── Delimiter sniffing for TXT ─────────────────────────────
function modeOf(arr: number[]): number {
  const f = new Map<number, number>(); let best = -1, bestN = -1;
  for (const x of arr) { const c = (f.get(x) || 0) + 1; f.set(x, c); if (c > best) { best = c; bestN = x; } }
  return bestN;
}
function sniffDelimiter(text: string): string | null {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20);
  if (lines.length < 3) return null;
  let bestDelim: string | null = null, bestCols = 1;
  for (const d of ["\t", ",", "|", ";"]) {
    const counts = lines.map(l => l.split(d).length - 1);
    const m      = modeOf(counts);
    if (m < 1) continue;
    const consistent = counts.filter(c => c === m).length;
    if (consistent >= lines.length * 0.8 && m + 1 > bestCols) { bestCols = m + 1; bestDelim = d; }
  }
  return bestDelim;
}

// ── TXT (table if clearly delimited, else plain text) ──────
async function parseTXT(file: File): Promise<ParseResult> {
  const text  = await file.text();
  const delim = sniffDelimiter(text);
  if (delim) {
    const Papa = (await import("papaparse")).default;
    const res  = Papa.parse<unknown[]>(text, {
      header: false, skipEmptyLines: "greedy", dynamicTyping: true, delimiter: delim,
    });
    const aoa  = (res.data as unknown[][]) || [];
    const cols = (aoa[0]?.length) || 0;
    if (cols >= 2 && aoa.length >= 4) {
      return buildTabularResult(file.name, "txt", [{ name: file.name, aoa }]);
    }
  }
  return { content:text, sheets:[], rowCount:text.split("\n").filter(l=>l.trim()).length,
           fileType:"txt", fileName:file.name, chars:text.length,
           truncated:text.length>MAX_CONTENT_CHARS, summarized:false, cube:null, schema:null };
}

// ── JSON (tabular detection: array / wrapped / NDJSON → cube) ───────────────
function extractRecords(parsed: unknown): Record<string, unknown>[] | null {
  const isRecord = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x) && !(x instanceof Date);
  if (Array.isArray(parsed)) return parsed.filter(isRecord);
  if (isRecord(parsed)) {
    for (const k of ["data", "results", "records", "rows", "items"]) {
      const v = parsed[k];
      if (Array.isArray(v)) return v.filter(isRecord);
    }
  }
  return null;
}
function recordsToTable(records: Record<string, unknown>[], cap = 5000): { headers: string[]; rows: unknown[][] } {
  const sample  = records.slice(0, cap);
  const headers: string[] = []; const seen = new Set<string>();
  // Flatten one level deep with dotted keys; stringify anything deeper / arrays.
  const flat = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
          out[`${k}.${k2}`] = (v2 && typeof v2 === "object") ? JSON.stringify(v2) : v2;
        }
      } else {
        out[k] = Array.isArray(v) ? JSON.stringify(v) : v;
      }
    }
    return out;
  };
  const flatRecords = sample.map(flat);
  flatRecords.forEach(fr => Object.keys(fr).forEach(k => { if (!seen.has(k)) { seen.add(k); headers.push(k); } }));
  const rows = flatRecords.map(fr => headers.map(h => fr[h] ?? ""));
  return { headers, rows };
}

async function parseJSON(file: File): Promise<ParseResult> {
  const text = await file.text();
  let parsed: unknown;
  let records: Record<string, unknown>[] | null = null;

  try {
    parsed  = JSON.parse(text);
    records = extractRecords(parsed);
  } catch {
    // NDJSON — one JSON object per line
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const objs: Record<string, unknown>[] = [];
    let ok = lines.length > 0;
    for (const l of lines) {
      try {
        const o = JSON.parse(l);
        if (o && typeof o === "object" && !Array.isArray(o)) objs.push(o as Record<string, unknown>);
      } catch { ok = false; break; }
    }
    if (ok && objs.length) { parsed = objs; records = objs; }
    else throw new Error("This file is not valid JSON.");
  }

  if (records && records.length >= 3) {
    const { headers, rows } = recordsToTable(records);
    if (headers.length >= 2) {
      const aoa: unknown[][] = [headers, ...rows];
      return buildTabularResult(file.name, "json", [{ name: file.name, aoa }]);
    }
  }

  // Non-tabular JSON (config, single object, deeply nested) → pretty-printed text
  const content = JSON.stringify(parsed, null, 2);
  return { content, sheets:[],
           rowCount: Array.isArray(parsed) ? parsed.length : Object.keys((parsed as object) || {}).length,
           fileType:"json", fileName:file.name, chars:content.length,
           truncated:content.length>MAX_CONTENT_CHARS, summarized:false, cube:null, schema:null };
}

// ── PDF (layout-aware text + best-effort table extraction) ─────────────────
type PdfCell = { str: string; x: number; w: number };
type PdfLine = { y: number; cells: PdfCell[] };

// Split a visual line into columns wherever the horizontal gap between adjacent
// text fragments is much larger than the line's typical gap → table cells.
function lineToCells(cells: PdfCell[]): string[] {
  if (cells.length === 0) return [];
  const gaps: number[] = [];
  for (let i = 1; i < cells.length; i++) gaps.push(cells[i].x - (cells[i-1].x + cells[i-1].w));
  const positive = gaps.filter(g => g > 0).sort((a, b) => a - b);
  const median   = positive.length ? positive[Math.floor(positive.length / 2)] : 0;
  const thresh   = Math.max(8, median * 1.8);
  const out: string[] = []; let cur = cells[0].str;
  for (let i = 1; i < cells.length; i++) {
    const gap = cells[i].x - (cells[i-1].x + cells[i-1].w);
    if (gap > thresh) { out.push(cur.trim()); cur = cells[i].str; }
    else cur += " " + cells[i].str;
  }
  out.push(cur.trim());
  return out;
}

// Find the dominant column count across all lines; if a consistent N≥2-column
// table emerges, return it as { headers, rows }. Conservative — only fires when
// the table is the clear majority of multi-column lines.
function detectPdfTable(lines: PdfLine[]): { headers: string[]; rows: unknown[][] } | null {
  const multi = lines.map(l => lineToCells(l.cells)).filter(c => c.length >= 2);
  if (multi.length < 4) return null;
  const freq = new Map<number, number>();
  multi.forEach(r => freq.set(r.length, (freq.get(r.length) || 0) + 1));
  let N = 0, best = 0;
  for (const [n, c] of freq) if (n >= 2 && c > best) { best = c; N = n; }
  const tableRows = multi.filter(r => r.length === N);
  if (N < 2 || tableRows.length < 4 || tableRows.length < multi.length * 0.5) return null;
  const headers = tableRows[0].map((h, i) => h || `Column_${i + 1}`);
  const rows    = tableRows.slice(1) as unknown[][];
  return { headers, rows };
}

async function parsePDF(file: File): Promise<ParseResult> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  const ab  = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;

  let docTitle = "";
  try {
    const md = await pdf.getMetadata();
    docTitle = String((md?.info as { Title?: string } | undefined)?.Title || "").trim();
  } catch { /* metadata optional */ }

  const pageTexts: string[] = [];
  const allLines:  PdfLine[] = [];
  const Y_TOL = 3;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc   = await page.getTextContent();
    // pdfjs items are TextItem | TextMarkedContent; only TextItem has str/transform.
    type RawItem = { str?: string; transform?: number[]; width?: number };
    const items = (tc.items as RawItem[])
      .filter((it): it is { str: string; transform: number[]; width?: number } =>
        typeof it.str === "string" && it.str.length > 0 && Array.isArray(it.transform))
      .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0 }));
    if (items.length === 0) continue;

    // Sort top→bottom (PDF y grows upward), then left→right, group into lines.
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: PdfLine[] = [];
    for (const it of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= Y_TOL) last.cells.push({ str: it.str, x: it.x, w: it.w });
      else lines.push({ y: it.y, cells: [{ str: it.str, x: it.x, w: it.w }] });
    }
    lines.forEach(ln => ln.cells.sort((a, b) => a.x - b.x));
    allLines.push(...lines);

    const text = lines
      .map(ln => ln.cells.map(c => c.str).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean).join("\n");
    if (text) pageTexts.push(`--- Page ${i} ---\n${text}`);
  }

  const body       = pageTexts.join("\n\n").trim();
  const meaningful = body.replace(/[^\w]/g, "").length;

  // Scanned / image-only PDF: no extractable text layer.
  if (meaningful < 20) {
    const msg = `This PDF appears to be scanned or image-only — no extractable text was found. ` +
      `Try uploading a text-based PDF, or an OCR'd version of this document.`;
    return { content: msg, sheets:[], rowCount:0, fileType:"pdf", fileName:file.name,
             chars: msg.length, truncated:false, summarized:false, cube:null, schema:null };
  }

  // Best-effort: if the PDF contains a clean table, unlock the interactive cube.
  let cube: DataCube | null = null;
  let schema: SchemaModel | null = null;
  try {
    const table = detectPdfTable(allLines);
    if (table) {
      const aoa: unknown[][] = [table.headers, ...table.rows];
      try { schema = buildSchemaModel(file.name, [{ name: file.name, headers: table.headers, rows: table.rows }]); }
      catch { schema = null; }
      cube = buildBestCube(file.name, [{ name: file.name, aoa }], schema);
    }
  } catch (e) { console.warn("[pdf] table detection failed", e); }

  const header = `--- Document: ${docTitle || file.name} (${pdf.numPages} page${pdf.numPages > 1 ? "s" : ""}) ---`;
  let content  = `${header}\n\n${body}`;
  if (cube) {
    content += `\n\n[INTERACTIVE DASHBOARD: a table was detected in this PDF — ` +
      `${cube.sourceRowCount.toLocaleString()} rows, dimensions: ${cube.dimensions.map(d => d.name).join(", ")}]`;
  }

  return { content, sheets:[], rowCount: body.split("\n").filter(l => l.trim()).length,
           fileType:"pdf", fileName:file.name, chars:content.length,
           truncated:content.length > MAX_CONTENT_CHARS, summarized:false, cube, schema };
}

// ── Main export ────────────────────────────────────────────
export async function parseFileInBrowser(file: File): Promise<ParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  let result: ParseResult;

  if (ext === "csv")                                   result = await parseCSV(file);
  else if (["xlsx","xls","xlsm","xlsb"].includes(ext)) result = await parseExcel(file);
  else if (ext === "pdf")                              result = await parsePDF(file);
  else if (ext === "txt")                              result = await parseTXT(file);
  else if (ext === "json")                             result = await parseJSON(file);
  else throw new Error(`".${ext}" is not supported. Use CSV, Excel, PDF, TXT, or JSON.`);

  if (result.content.length > MAX_CONTENT_CHARS) {
    result.content   = result.content.slice(0, MAX_CONTENT_CHARS) +
      "\n\n[Truncated — full data indexed for AI search]";
    result.truncated = true;
  }
  return result;
}
