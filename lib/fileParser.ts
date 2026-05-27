// lib/fileParser.ts — SERVER SIDE ONLY
// Parses uploaded files into plain text for Claude.
// Uses static imports to avoid Next.js dynamic import issues.

import * as XLSX from "xlsx";

export type ParsedFile = {
  fileName:  string;
  fileType:  string;
  sheets?:   { name: string; data: string }[];
  content:   string;
  rowCount?: number;
  error?:    string;
};

// ── CSV ────────────────────────────────────────────────────
export function parseCSV(buffer: Buffer, fileName: string): ParsedFile {
  const text     = buffer.toString("utf-8");
  const lines    = text.split("\n").filter(l => l.trim());
  const headers  = lines[0] || "";
  const rowCount = Math.max(0, lines.length - 1);
  return {
    fileName,
    fileType: "csv",
    content:  `CSV File: ${fileName}\nColumns: ${headers}\nTotal rows: ${rowCount}\n\nData:\n${text.slice(0, 8000)}`,
    rowCount,
  };
}

// ── Excel — reads every sheet ──────────────────────────────
export function parseExcel(buffer: Buffer, fileName: string): ParsedFile {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetNames = workbook.SheetNames;

    const sheets: { name: string; data: string }[] = [];
    let fullContent = `Excel File: ${fileName}\nSheets: ${sheetNames.join(", ")}\n\n`;

    for (const sheetName of sheetNames) {
      const ws       = workbook.Sheets[sheetName];
      const csvData  = XLSX.utils.sheet_to_csv(ws);
      const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const rowCount = jsonRows.length;

      const sheetText = `--- Sheet: "${sheetName}" (${rowCount} rows) ---\n${csvData.slice(0, 3500)}\n`;
      sheets.push({ name: sheetName, data: sheetText });
      fullContent += sheetText + "\n";
    }

    return {
      fileName,
      fileType: "excel",
      sheets,
      content:  fullContent.slice(0, 12000),
      rowCount: sheets.length,
    };
  } catch (err) {
    return {
      fileName,
      fileType: "excel",
      content:  `Excel File: ${fileName}\n[Error reading file: ${err instanceof Error ? err.message : "unknown error"}]`,
      error:    "Excel parse failed",
    };
  }
}

// ── PDF ────────────────────────────────────────────────────
// pdf-parse is loaded conditionally to avoid Next.js test-file issue
export async function parsePDF(buffer: Buffer, fileName: string): Promise<ParsedFile> {
  try {
    // Inline require avoids the pdf-parse test file crash in Next.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data     = await pdfParse(buffer);
    const text     = (data.text || "").trim();

    return {
      fileName,
      fileType: "pdf",
      content:  `PDF File: ${fileName}\nPages: ${data.numpages}\n\nExtracted Text:\n${text.slice(0, 8000)}`,
      rowCount: data.numpages,
    };
  } catch {
    return {
      fileName,
      fileType: "pdf",
      content:  `PDF File: ${fileName}\n[Could not extract text — this may be a scanned or image-based PDF. Try exporting as CSV or Excel instead.]`,
      error:    "PDF parse failed",
    };
  }
}

// ── TXT ────────────────────────────────────────────────────
export function parseTXT(buffer: Buffer, fileName: string): ParsedFile {
  const text = buffer.toString("utf-8");
  return {
    fileName,
    fileType: "txt",
    content:  `Text File: ${fileName}\n\nContent:\n${text.slice(0, 8000)}`,
  };
}

// ── JSON ───────────────────────────────────────────────────
export function parseJSON(buffer: Buffer, fileName: string): ParsedFile {
  try {
    const raw    = buffer.toString("utf-8");
    const parsed = JSON.parse(raw);
    return {
      fileName,
      fileType: "json",
      content:  `JSON File: ${fileName}\n\nData:\n${JSON.stringify(parsed, null, 2).slice(0, 8000)}`,
    };
  } catch {
    return {
      fileName,
      fileType: "json",
      content:  `JSON File: ${fileName}\n[Invalid JSON — could not parse]`,
      error:    "Invalid JSON",
    };
  }
}

// ── Main entry point ───────────────────────────────────────
export async function parseFile(buffer: Buffer, fileName: string): Promise<ParsedFile> {
  const ext = (fileName.split(".").pop() || "").toLowerCase();

  switch (ext) {
    case "csv":
    case "tsv":
      return parseCSV(buffer, fileName);

    case "xlsx":
    case "xls":
    case "xlsm":
    case "xlsb":
      return parseExcel(buffer, fileName);

    case "pdf":
      return await parsePDF(buffer, fileName);

    case "json":
      return parseJSON(buffer, fileName);

    case "txt":
    case "text":
    case "md":
    default:
      return parseTXT(buffer, fileName);
  }
}
