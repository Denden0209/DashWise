// lib/parseFileClient.ts
// Client-side file parser + smart summarizer.
// Runs entirely in the browser — zero API cost, no server request.
// For large files: computes statistics instead of dumping raw rows.
// Output: a compact ~5-10KB summary Claude can fully understand.

export type ParseResult = {
  content:   string;   // smart summary text sent to Claude
  sheets:    string[];
  rowCount:  number;
  fileType:  string;
  fileName:  string;
  chars:     number;
  truncated: boolean;
  summarized: boolean; // true = statistics mode, false = raw text mode
};

// ── Thresholds ─────────────────────────────────────────────
const RAW_ROW_LIMIT    = 500;    // sheets with fewer rows → raw text
const MAX_CONTENT_CHARS = 800_000;
const TOP_N            = 15;     // top N values to show per categorical column
const MAX_SHEETS       = 20;     // max sheets to process

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
  if (typeof val === "number" && val > 40000 && val < 60000) return true; // Excel serial
  const s = String(val);
  return /^\d{4}[-/]\d{2}[-/]\d{2}/.test(s) ||
         /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s);
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
  // Row where most cells are empty
  const nonEmpty = row.filter(c => c !== null && c !== undefined && c !== "").length;
  if (nonEmpty <= 1 && headers.length > 3) return true;
  return false;
}

function detectHeaderRow(aoa: unknown[][]): number {
  // Find the row that looks most like a header
  // Headers: mostly strings, followed by rows with numbers
  for (let i = 0; i < Math.min(5, aoa.length); i++) {
    const row      = aoa[i];
    const strCount = row.filter(c => typeof c === "string" && c.trim()).length;
    const numCount = row.filter(c => isNumeric(c)).length;
    if (strCount > numCount && strCount >= row.length * 0.5) return i;
  }
  return 0;
}

// ── Core: summarize one sheet ──────────────────────────────
function summarizeSheet(
  sheetName: string,
  aoa:       unknown[][],
): string {
  if (aoa.length === 0) return `=== SHEET: ${sheetName} ===\n(empty)\n`;

  // Detect header row
  const headerIdx = detectHeaderRow(aoa);
  const headers   = (aoa[headerIdx] as unknown[]).map(h => String(h || "").trim());
  const dataRows  = aoa.slice(headerIdx + 1).filter(row => {
    if (row.every(c => c === null || c === undefined || c === "")) return false;
    if (isSummaryRow(row, headers)) return false;
    return true;
  });

  const totalRows = dataRows.length;

  // Small sheets — just use raw text
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

  // Large sheets — compute statistics
  const lines: string[] = [];
  lines.push(`=== SHEET: ${sheetName} (${totalRows.toLocaleString()} rows) ===`);

  // Per-column analysis
  const numericSummaries: string[] = [];
  const categoricalSummaries: string[] = [];
  const dateSummaries: string[] = [];
  const qualityFlags: string[] = [];

  for (let col = 0; col < headers.length; col++) {
    const header = headers[col] || `Column_${col + 1}`;
    const values = dataRows.map(r => r[col]);

    const blank   = values.filter(v => v === null || v === undefined || v === "").length;
    const nonBlank = values.filter(v => v !== null && v !== undefined && v !== "");
    const blankPct = ((blank / totalRows) * 100).toFixed(1);

    if (blank > totalRows * 0.5) {
      qualityFlags.push(`⚠ "${header}": ${blankPct}% missing values`);
    }

    // Detect column type
    const numericVals = nonBlank.filter(v => isNumeric(v)).map(v => toNumber(v));
    const dateVals    = nonBlank.filter(v => isDateLike(v));
    const numericPct  = nonBlank.length > 0 ? numericVals.length / nonBlank.length : 0;
    const datePct     = nonBlank.length > 0 ? dateVals.length / nonBlank.length : 0;

    // ── Numeric column ──
    if (numericPct >= 0.7 && numericVals.length >= 10) {
      const sorted = [...numericVals].sort((a, b) => a - b);
      const sum    = numericVals.reduce((s, v) => s + v, 0);
      const avg    = sum / numericVals.length;
      const min    = sorted[0];
      const max    = sorted[sorted.length - 1];
      const median = sorted[Math.floor(sorted.length / 2)];
      const negCount = numericVals.filter(v => v < 0).length;
      const zeroCount = numericVals.filter(v => v === 0).length;

      // Standard deviation
      const variance = numericVals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / numericVals.length;
      const stdDev   = Math.sqrt(variance);

      let summary = `  ${header}:\n`;
      summary += `    Sum=${formatNumber(sum)} | Avg=${formatNumber(avg)} | Median=${formatNumber(median)}\n`;
      summary += `    Min=${formatNumber(min)} | Max=${formatNumber(max)} | StdDev=${formatNumber(stdDev)}\n`;
      if (blank > 0)     summary += `    Missing: ${blank.toLocaleString()} rows (${blankPct}%)\n`;
      if (negCount > 0)  summary += `    Negative values: ${negCount.toLocaleString()} (possible refunds/returns)\n`;
      if (zeroCount > totalRows * 0.1) summary += `    Zero values: ${zeroCount.toLocaleString()} (${((zeroCount/totalRows)*100).toFixed(1)}%)\n`;

      // Detect outliers (> 3 std devs from mean)
      const outliers = numericVals.filter(v => Math.abs(v - avg) > 3 * stdDev);
      if (outliers.length > 0 && outliers.length < totalRows * 0.01) {
        summary += `    ⚠ ${outliers.length} potential outliers (>3σ from mean)\n`;
      }

      numericSummaries.push(summary);
    }

    // ── Date column ──
    else if (datePct >= 0.7 || header.toLowerCase().includes("date") || header.toLowerCase().includes("time")) {
      const parsedDates: Date[] = [];
      nonBlank.forEach(v => {
        if (v instanceof Date) { parsedDates.push(v); return; }
        if (typeof v === "number" && v > 40000) {
          // Excel serial date
          const d = new Date((v - 25569) * 86400 * 1000);
          parsedDates.push(d);
          return;
        }
        const d = new Date(String(v));
        if (!isNaN(d.getTime())) parsedDates.push(d);
      });

      if (parsedDates.length > 0) {
        const sorted  = parsedDates.sort((a, b) => a.getTime() - b.getTime());
        const minDate = sorted[0].toISOString().split("T")[0];
        const maxDate = sorted[sorted.length - 1].toISOString().split("T")[0];

        // Group by month
        const byMonth: Record<string, number> = {};
        parsedDates.forEach(d => {
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
          byMonth[key] = (byMonth[key] || 0) + 1;
        });
        const months  = Object.entries(byMonth).sort(([a],[b]) => a.localeCompare(b));
        const peakMonth = months.reduce((a, b) => b[1] > a[1] ? b : a, months[0]);

        let summary = `  ${header}:\n`;
        summary += `    Range: ${minDate} to ${maxDate}\n`;
        summary += `    Parsed: ${parsedDates.length.toLocaleString()} of ${nonBlank.length.toLocaleString()} dates\n`;
        summary += `    Peak month: ${peakMonth[0]} (${peakMonth[1].toLocaleString()} records)\n`;
        if (months.length <= 24) {
          summary += `    Monthly breakdown:\n`;
          months.forEach(([m, cnt]) => { summary += `      ${m}: ${cnt.toLocaleString()} records\n`; });
        }
        dateSummaries.push(summary);
      }
    }

    // ── Categorical column ──
    else {
      const strVals = nonBlank.map(v => String(v).trim()).filter(v => v);
      const unique  = new Set(strVals);

      if (unique.size === totalRows || unique.size > totalRows * 0.95) {
        // Likely an ID column — just report cardinality
        categoricalSummaries.push(`  ${header}: ${unique.size.toLocaleString()} unique values (ID/key column)`);
      } else {
        // Value frequency
        const freq: Record<string, number> = {};
        strVals.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
        const sorted = Object.entries(freq).sort(([,a],[,b]) => b - a);
        const topN   = sorted.slice(0, TOP_N);

        let summary = `  ${header} (${unique.size} unique values):\n`;
        topN.forEach(([val, cnt]) => {
          const pct = ((cnt / totalRows) * 100).toFixed(1);
          summary += `    "${val}": ${cnt.toLocaleString()} (${pct}%)\n`;
        });
        if (sorted.length > TOP_N) {
          summary += `    ... and ${sorted.length - TOP_N} more values\n`;
        }
        if (blank > 0) summary += `    Missing: ${blank.toLocaleString()} (${blankPct}%)\n`;
        categoricalSummaries.push(summary);
      }
    }
  }

  // Assemble sheet summary
  if (numericSummaries.length > 0) {
    lines.push("\nNUMERIC COLUMNS:");
    lines.push(...numericSummaries);
  }
  if (dateSummaries.length > 0) {
    lines.push("\nDATE COLUMNS:");
    lines.push(...dateSummaries);
  }
  if (categoricalSummaries.length > 0) {
    lines.push("\nCATEGORICAL COLUMNS:");
    lines.push(...categoricalSummaries);
  }
  if (qualityFlags.length > 0) {
    lines.push("\nDATA QUALITY FLAGS:");
    qualityFlags.forEach(f => lines.push(`  ${f}`));
  }

  return lines.join("\n") + "\n";
}

// ── Detect cross-sheet relationships ──────────────────────
function detectRelationships(
  sheetData: Record<string, { headers: string[]; uniqueKeys: Record<string, Set<unknown>> }>
): string {
  const relationships: string[] = [];
  const sheetNames = Object.keys(sheetData);

  for (let i = 0; i < sheetNames.length; i++) {
    for (let j = i + 1; j < sheetNames.length; j++) {
      const s1 = sheetNames[i];
      const s2 = sheetNames[j];
      const h1 = sheetData[s1].headers;
      const h2 = sheetData[s2].headers;

      // Find common column names
      h1.forEach(col1 => {
        const col2 = h2.find(c => c.toLowerCase() === col1.toLowerCase() &&
          col1.toLowerCase().includes("key") || col1.toLowerCase().includes("id"));
        if (!col2) return;

        const keys1 = sheetData[s1].uniqueKeys[col1];
        const keys2 = sheetData[s2].uniqueKeys[col2];
        if (!keys1 || !keys2 || keys1.size === 0 || keys2.size === 0) return;

        // Check overlap
        let overlap = 0;
        keys1.forEach(k => { if (keys2.has(k)) overlap++; });
        const pct1 = ((overlap / keys1.size) * 100).toFixed(0);
        const pct2 = ((overlap / keys2.size) * 100).toFixed(0);

        if (overlap > 0 && parseInt(pct1) >= 70) {
          relationships.push(`  ${s1}.${col1} → ${s2}.${col2} (${pct1}% match — joinable)`);
          if (parseInt(pct1) < 100) {
            relationships.push(`    ⚠ ${keys1.size - overlap} keys in ${s1} have no match in ${s2}`);
          }
        }
      });
    }
  }
  return relationships.length > 0
    ? "\nDETECTED RELATIONSHIPS (joinable columns):\n" + relationships.join("\n")
    : "";
}

// ── Excel parser + summarizer ──────────────────────────────
async function parseExcel(file: File): Promise<ParseResult> {
  const XLSX   = await import("xlsx");
  const ab     = await file.arrayBuffer();
  const wb     = XLSX.read(ab, { type:"array", cellDates:true });
  const sheets = wb.SheetNames.slice(0, MAX_SHEETS);

  const parts:    string[] = [];
  let   totalRows = 0;
  const sheetMeta: Record<string, { headers: string[]; uniqueKeys: Record<string, Set<unknown>> }> = {};

  // File header
  parts.push(`FILE: ${file.name}`);
  parts.push(`Sheets: ${sheets.join(", ")}`);
  parts.push(`Total sheets: ${wb.SheetNames.length}${wb.SheetNames.length > MAX_SHEETS ? ` (showing first ${MAX_SHEETS})` : ""}\n`);

  for (const sheetName of sheets) {
    const ws  = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header:1, defval:"", raw:false });

    if (aoa.length === 0) {
      parts.push(`=== SHEET: ${sheetName} ===\n(empty)\n`);
      continue;
    }

    const headerIdx = detectHeaderRow(aoa);
    const headers   = (aoa[headerIdx] as unknown[]).map(h => String(h || "").trim()).filter(Boolean);
    const dataRows  = aoa.slice(headerIdx + 1).filter(row =>
      !row.every(c => c === null || c === undefined || c === "") &&
      !isSummaryRow(row, headers)
    );

    totalRows += dataRows.length;

    // Build unique key sets for relationship detection
    const uniqueKeys: Record<string, Set<unknown>> = {};
    headers.forEach((h, col) => {
      if (h.toLowerCase().includes("key") || h.toLowerCase().includes("id")) {
        uniqueKeys[h] = new Set(dataRows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== ""));
      }
    });
    sheetMeta[sheetName] = { headers, uniqueKeys };

    // Summarize this sheet
    parts.push(summarizeSheet(sheetName, aoa));
  }

  // Cross-sheet relationships
  const relationships = detectRelationships(sheetMeta);
  if (relationships) parts.push(relationships);

  const content = parts.join("\n").trim();
  const fileType = file.name.split(".").pop()?.toLowerCase() || "xlsx";

  return {
    content,
    sheets:     sheets,
    rowCount:   totalRows,
    fileType,
    fileName:   file.name,
    chars:      content.length,
    truncated:  content.length > MAX_CONTENT_CHARS,
    summarized: true,
  };
}

// ── CSV parser + summarizer ────────────────────────────────
async function parseCSV(file: File): Promise<ParseResult> {
  const text = await file.text();
  const lines = text.split("\n").filter(l => l.trim());

  if (lines.length <= RAW_ROW_LIMIT + 1) {
    return { content:text, sheets:[], rowCount:lines.length-1, fileType:"csv", fileName:file.name, chars:text.length, truncated:false, summarized:false };
  }

  // Parse CSV into AOA for summarization
  const aoa = lines.map(line => {
    const result: string[] = [];
    let current = "", inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  });

  const summary = summarizeSheet(file.name, aoa);
  return { content:summary, sheets:[], rowCount:lines.length-1, fileType:"csv", fileName:file.name, chars:summary.length, truncated:false, summarized:true };
}

// ── PDF ────────────────────────────────────────────────────
async function parsePDF(file: File): Promise<ParseResult> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const ab    = await file.arrayBuffer();
  const pdf   = await pdfjsLib.getDocument({ data: ab }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text    = content.items.map((item: unknown) => (item as { str:string }).str).join(" ");
    if (text.trim()) pages.push(`--- Page ${i} ---\n${text}`);
  }

  const content  = pages.join("\n\n").trim();
  const rowCount = content.split("\n").filter(l => l.trim()).length;
  return { content, sheets:[], rowCount, fileType:"pdf", fileName:file.name, chars:content.length, truncated:content.length > MAX_CONTENT_CHARS, summarized:false };
}

// ── TXT / JSON ─────────────────────────────────────────────
async function parseTXT(file: File): Promise<ParseResult> {
  const text = await file.text();
  return { content:text, sheets:[], rowCount:text.split("\n").filter(l=>l.trim()).length, fileType:"txt", fileName:file.name, chars:text.length, truncated:text.length>MAX_CONTENT_CHARS, summarized:false };
}

async function parseJSON(file: File): Promise<ParseResult> {
  const text   = await file.text();
  const parsed = JSON.parse(text);
  const content = JSON.stringify(parsed, null, 2);
  return { content, sheets:[], rowCount:Array.isArray(parsed)?parsed.length:Object.keys(parsed).length, fileType:"json", fileName:file.name, chars:content.length, truncated:false, summarized:false };
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

  // Hard truncate if still over limit (rare with summarization)
  if (result.content.length > MAX_CONTENT_CHARS) {
    result.content   = result.content.slice(0, MAX_CONTENT_CHARS) +
      "\n\n[Truncated — full data indexed for AI search]";
    result.truncated = true;
  }

  return result;
}
