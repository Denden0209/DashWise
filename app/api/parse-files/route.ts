// app/api/parse-files/route.ts
// Parses uploaded files. Accepts both formData and base64 JSON body.
// Client sends small files as formData, large files as base64 JSON chunks.

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime     = "nodejs";
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

async function parseBuffer(buffer: Buffer, fileName: string): Promise<{
  content: string; sheets: string[]; rowCount: number; fileType: string;
}> {
  const fileType = fileName.split(".").pop()?.toLowerCase() || "";
  let content  = "";
  let sheets:  string[] = [];
  let rowCount = 0;

  if (fileType === "csv") {
    content  = buffer.toString("utf-8");
    rowCount = content.split("\n").filter(l => l.trim()).length - 1;
  }

  else if (["xlsx", "xls", "xlsm", "xlsb"].includes(fileType)) {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    sheets   = wb.SheetNames;
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws  = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      if (aoa.length <= 1) continue;
      rowCount += aoa.length - 1;
      const lines = aoa.map(row =>
        (row as unknown[]).map(cell => {
          if (cell === null || cell === undefined) return "";
          if (cell instanceof Date) return cell.toISOString().split("T")[0];
          return String(cell).replace(/,/g, ";");
        }).join(",")
      );
      parts.push(`=== SHEET: ${sheetName} ===\n${lines.join("\n")}`);
    }
    content = parts.join("\n\n");
  }

  else if (fileType === "pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      const result   = await pdfParse(buffer);
      content        = result.text || "";
      rowCount       = content.split("\n").filter(l => l.trim()).length;
    } catch {
      content  = buffer.toString("latin1").replace(/[^\x20-\x7E\n\t]/g, " ").replace(/\s{3,}/g, " ").trim();
      rowCount = content.split("\n").filter(l => l.trim()).length;
      if (!content || content.length < 50)
        throw new Error("Could not read this PDF. Make sure it is text-based, not a scanned image.");
    }
  }

  else if (fileType === "txt") {
    content  = buffer.toString("utf-8");
    rowCount = content.split("\n").filter(l => l.trim()).length;
  }

  else if (fileType === "json") {
    const parsed = JSON.parse(buffer.toString("utf-8"));
    content  = JSON.stringify(parsed, null, 2);
    rowCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
  }

  else {
    throw new Error(`".${fileType}" is not supported. Use CSV, Excel, PDF, TXT, or JSON.`);
  }

  content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  return { content, sheets, rowCount, fileType };
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let buffer: Buffer;
    let fileName: string;

    // ── Path A: JSON with base64 (for larger files) ────────
    if (contentType.includes("application/json")) {
      const body = await req.json() as { fileName: string; base64: string };
      fileName = body.fileName;
      buffer   = Buffer.from(body.base64, "base64");
    }

    // ── Path B: FormData (for small files) ────────────────
    else {
      const formData = await req.formData();
      const file     = formData.get("file") as File | null;
      if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
      fileName = file.name;
      buffer   = Buffer.from(await file.arrayBuffer());
    }

    const { content, sheets, rowCount, fileType } = await parseBuffer(buffer, fileName);

    if (!content) {
      return NextResponse.json({ error: "File appears to be empty or could not be read." }, { status: 400 });
    }

    const MAX_CHARS = 800_000;
    const truncated = content.length > MAX_CHARS;

    return NextResponse.json({
      success: true, content, sheets, rowCount, fileType, fileName,
      size: buffer.length, chars: content.length, truncated,
    });

  } catch (err: unknown) {
    console.error("[parse-files]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse file." },
      { status: 500 }
    );
  }
}
