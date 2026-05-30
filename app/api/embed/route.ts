export const dynamic    = "force-dynamic";
export const runtime    = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { uid, fileId, folderId, fileName, content, forceReembed } = await req.json();
    if (!uid || !fileId || !folderId || !content)
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    if (!process.env.OPENAI_API_KEY)
      return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

    const { chunkText, embedBatch } = await import("@/lib/rag/embeddings");
    const { storeChunks, fileHasEmbeddings, deleteFileChunks } = await import("@/lib/rag/vectorStore");

    if (!forceReembed) {
      const already = await fileHasEmbeddings(uid, fileId);
      if (already) return NextResponse.json({ success: true, skipped: true });
    } else {
      await deleteFileChunks(uid, fileId);
    }

    const chunks = chunkText(content, fileName, fileId, folderId, uid);
    if (chunks.length === 0) return NextResponse.json({ success: true, chunks: 0 });

    const embeddings = await embedBatch(chunks.map(c => c.text));
    await storeChunks(uid, chunks, embeddings);

    return NextResponse.json({ success: true, chunks: chunks.length, fileId, fileName });
  } catch (err: unknown) {
    console.error("[embed]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Embedding failed" }, { status: 500 });
  }
}
