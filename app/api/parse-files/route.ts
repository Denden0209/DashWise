// app/api/parse-files/route.ts
// Receives a file via FormData, parses it, returns extracted text.
// Always returns JSON — never crashes with an HTML error page.

import { NextRequest, NextResponse } from "next/server";
import { parseFile } from "@/lib/fileParser";

export const runtime = "nodejs"; // required for file parsing — not Edge

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file     = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    // Size limit — 10MB
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Convert File → Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    // Parse based on file type
    const parsed = await parseFile(buffer, file.name);

    return NextResponse.json({
      success:  true,
      fileName: parsed.fileName,
      fileType: parsed.fileType,
      content:  parsed.content,
      sheets:   parsed.sheets?.map(s => s.name) ?? [],
      rowCount: parsed.rowCount ?? 0,
      error:    parsed.error ?? null,
    });

  } catch (err: unknown) {
    console.error("[parse-files] Error:", err);
    // Always return JSON even on crash — never let HTML bleed through
    return NextResponse.json(
      {
        success: false,
        error:   err instanceof Error ? err.message : "Parsing failed",
      },
      { status: 500 }
    );
  }
}
