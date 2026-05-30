// app/api/chat/route.ts
// HYBRID: OpenAI embeddings for RAG + Claude Sonnet for answers.
// Lazily imports vector store to avoid Firebase init at build time.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export const runtime = "nodejs";

type FolderSummary = {
  folderId:      string;
  folderName:    string;
  fileNames:     string[];
  readyCount:    number;
  parsedContent: string;
  lastAnalysis:  string;
};

type BusinessData = {
  folderCount:     number;
  fileCount:       number;
  totalDataSize:   number;
  folderSummaries: FolderSummary[];
};

function scoredFallback(bd: BusinessData, question: string): string {
  const q       = question.toLowerCase();
  const folders = bd.folderSummaries.filter(f => f.readyCount > 0);
  const scored  = folders.map(f => {
    const hay   = `${f.folderName} ${f.fileNames.join(" ")} ${f.lastAnalysis}`.toLowerCase();
    const score = q.split(/\s+/).filter(w => w.length > 3).reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    return { folder: f, score };
  }).sort((a, b) => b.score - a.score);

  let ctx = "", used = 0;
  const MAX = 100_000;
  for (const { folder } of scored) {
    if (used >= MAX) break;
    const slice = folder.parsedContent.slice(0, Math.min(MAX - used, 40_000));
    ctx  += `\n\n╔══ FOLDER: ${folder.folderName} ══\n║ Files: ${folder.fileNames.join(", ")}\n${folder.lastAnalysis ? `║ Last analysis: ${folder.lastAnalysis}\n` : ""}╚══\n\n${slice}`;
    used += slice.length;
  }
  return ctx;
}

export async function POST(req: NextRequest) {
  try {
    const { message, profile, businessData, chatHistory } = await req.json();
    if (!message) return NextResponse.json({ error: "No message" }, { status: 400 });

    const uid     = profile?.uid         || "";
    const bizName = profile?.bizName     || "this business";
    const bizType = profile?.bizType     || "small business";
    const goals   = profile?.goals       || [];
    const tone    = profile?.advisorTone || "balanced";
    const name    = profile?.name        || "there";

    const bizLabels: Record<string,string> = {
      retail:"retail store", restaurant:"restaurant", ecommerce:"ecommerce store",
      service:"service business", clinic:"clinic", salon:"salon",
    };
    const toneMap: Record<string,string> = {
      direct:   "Be direct. Lead with the key number or action. No pleasantries.",
      balanced: "Balance insight with encouragement. Be specific but approachable.",
      coaching: "End with one guiding question to help the user think.",
    };

    // ── Try RAG (lazy import avoids Firebase build-time init) ─
    let context     = "";
    let ragUsed     = false;
    let sourceCount = 0;
    let strategy    = "none";

    if (uid && process.env.OPENAI_API_KEY) {
      try {
        const { semanticSearch, buildContextFromResults } = await import("@/lib/rag/vectorStore");
        const results = await semanticSearch(uid, message, 8, 0.25);
        if (results.length > 0) {
          context     = buildContextFromResults(results);
          ragUsed     = true;
          sourceCount = results.length;
          strategy    = "rag";
        }
      } catch (ragErr) {
        console.warn("[chat] RAG failed, using fallback:", ragErr);
      }
    }

    // ── Fallback: smart context stuffing ─────────────────────
    if (!ragUsed) {
      const bd = businessData as BusinessData | null;
      if (bd && bd.folderCount > 0) {
        context  = scoredFallback(bd, message);
        strategy = "fullcontext";
      }
    }

    const folderCount = (businessData as BusinessData)?.folderCount || 0;
    const fileCount   = (businessData as BusinessData)?.fileCount   || 0;

    const systemPrompt = `You are the dedicated AI business advisor for ${bizName}, a ${bizLabels[bizType] || bizType}.
Owner: ${name}
Goals: ${goals.length ? goals.join(", ") : "not set"}
Tone: ${toneMap[tone] || toneMap.balanced}
Data: ${folderCount} folder${folderCount !== 1 ? "s" : ""}, ${fileCount} file${fileCount !== 1 ? "s" : ""}
Method: ${strategy === "rag" ? `Semantic RAG — ${sourceCount} relevant chunks retrieved` : "Full context loaded"}

════════════════════════════════════
BUSINESS DATA
════════════════════════════════════
${context || "No data uploaded yet. Ask the user to upload files or connect their POS."}
════════════════════════════════════

RULES:
- Reference specific file names, folder names, and exact numbers from the data
- Identify patterns across multiple folders when relevant  
- Use **bold** for key numbers and action items
- 2-4 paragraphs maximum
- If data is missing, say exactly what file would help
- Never invent or estimate numbers — only cite figures from the data above`;

    const response = await claude.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1200,
      system:     systemPrompt,
      messages: [
        ...(chatHistory || []).slice(-20).map((m: { role: string; content: string }) => ({
          role:    m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: message },
      ],
    });

    const reply = response.content[0].type === "text"
      ? response.content[0].text
      : "I had trouble responding. Please try again.";

    return NextResponse.json({ success: true, reply, meta: { strategy, ragUsed, sourceCount } });

  } catch (err: unknown) {
    console.error("[chat]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 }
    );
  }
}
