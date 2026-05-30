// app/api/parse-files/route.ts
// Parses uploaded files into readable text for AI analysis.
// Handles CSV, Excel, PDF, TXT, JSON.

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime     = "nodejs";
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file     = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name;
    const fileType = fileName.split(".").pop()?.toLowerCase() || "";
    const arrayBuf = await file.arrayBuffer();
    const buffer   = Buffer.from(arrayBuf);

    let content  = "";
    let sheets:  string[] = [];
    let rowCount = 0;

    // ── CSV ─────────────────────────────────────────────────
    if (fileType === "csv") {
      content  = buffer.toString("utf-8");
      rowCount = content.split("\n").filter(l => l.trim()).length - 1;
    }

    // ── Excel ───────────────────────────────────────────────
    else if (["xlsx", "xls", "xlsm", "xlsb"].includes(fileType)) {
      const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
      sheets   = wb.SheetNames;

      const parts: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const ws  = wb.Sheets[sheetName];
        // Convert to array of arrays first for better control
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
        if (aoa.length <= 1) continue;

        rowCount += aoa.length - 1;
        // Convert to CSV-style text
        const csvLines = aoa.map(row =>
          (row as unknown[]).map(cell => {
            if (cell === null || cell === undefined) return "";
            if (cell instanceof Date) return cell.toISOString().split("T")[0];
            return String(cell).replace(/,/g, ";"); // escape commas
          }).join(",")
        );
        parts.push(`=== SHEET: ${sheetName} ===\n${csvLines.join("\n")}`);
      }
      content = parts.join("\n\n");
    }

    // ── PDF ─────────────────────────────────────────────────
    else if (fileType === "pdf") {
      try {
        // Use require to avoid ESM issues with pdf-parse
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse/lib/pdf-parse.js");
        const result   = await pdfParse(buffer);
        content        = result.text || "";
        rowCount       = content.split("\n").filter(l => l.trim()).length;
      } catch (pdfErr) {
        console.error("PDF parse error:", pdfErr);
        // Fallback: try reading raw text
        content  = buffer.toString("latin1").replace(/[^\x20-\x7E\n\t]/g, " ").replace(/\s{3,}/g, " ").trim();
        rowCount = content.split("\n").filter(l => l.trim()).length;
        if (!content || content.length < 50) {
          throw new Error("Could not extract text from this PDF. Try exporting it as CSV or copying to a text file.");
        }
      }
    }

    // ── TXT ─────────────────────────────────────────────────
    else if (fileType === "txt") {
      content  = buffer.toString("utf-8");
      rowCount = content.split("\n").filter(l => l.trim()).length;
    }

    // ── JSON ────────────────────────────────────────────────
    else if (fileType === "json") {
      try {
        const parsed = JSON.parse(buffer.toString("utf-8"));
        content  = JSON.stringify(parsed, null, 2);
        rowCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
      } catch {
        throw new Error("Invalid JSON file — could not parse.");
      }
    }

    // ── Unsupported ─────────────────────────────────────────
    else {
      return NextResponse.json(
        { error: `".${fileType}" is not supported. Use CSV, Excel (.xlsx/.xls), PDF, TXT, or JSON.` },
        { status: 400 }
      );
    }

    // Clean up whitespace
    content = content
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();

    if (!content) {
      return NextResponse.json(
        { error: "File appears to be empty or could not be read." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success:  true,
      content,
      sheets,
      rowCount,
      fileType,
      fileName,
      size:  buffer.length,
      chars: content.length,
    });

  } catch (err: unknown) {
    console.error("[parse-files]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse file. Check the file format and try again." },
      { status: 500 }
    );
  }
}
