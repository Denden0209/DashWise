export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { uid, query, topK = 8, filterFolder } = await req.json();
    if (!uid || !query) return NextResponse.json({ error: "uid and query required" }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

    const { semanticSearch, buildContextFromResults } = await import("@/lib/rag/vectorStore");
    const results = await semanticSearch(uid, query, topK, 0.3, filterFolder);
    const context = buildContextFromResults(results);

    return NextResponse.json({ success:true, results:results.map(r=>({ source:r.chunk.source, text:r.chunk.text, similarity:r.similarity, folderId:r.chunk.folderId, fileId:r.chunk.fileId })), context, count:results.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Search failed" }, { status: 500 });
  }
}
