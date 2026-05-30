// app/api/chat/route.ts
// HYBRID: OpenAI embeddings for RAG retrieval + Claude Sonnet for answers.
//
// Flow:
//   1. User sends message
//   2. OpenAI embeds the question (cheap — $0.000001)
//   3. Firestore semantic search finds top 8 relevant chunks
//   4. Claude Sonnet answers using only those chunks as context
//   5. Falls back to full context stuffing if no embeddings exist yet

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { semanticSearch, buildContextFromResults } from "@/lib/rag/vectorStore";

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

// Smart fallback: score folders by relevance to question
function scoredFallback(businessData: BusinessData, question: string): string {
  const q       = question.toLowerCase();
  const folders = businessData.folderSummaries.filter(f => f.readyCount > 0);

  const scored = folders.map(f => {
    const haystack = `${f.folderName} ${f.fileNames.join(" ")} ${f.lastAnalysis}`.toLowerCase();
    const score    = q.split(/\s+/).filter(w => w.length > 3).reduce((s, w) => s + (haystack.includes(w) ? 1 : 0), 0);
    return { folder: f, score };
  }).sort((a, b) => b.score - a.score);

  let context   = "";
  let usedChars = 0;
  const MAX     = 100_000;

  for (const { folder } of scored) {
    if (usedChars >= MAX) break;
    const content = folder.parsedContent.slice(0, Math.min(MAX - usedChars, 40_000));
    context += `\n\n╔══ FOLDER: ${folder.folderName} ══\n║ Files: ${folder.fileNames.join(", ")}\n${folder.lastAnalysis ? `║ Last analysis: ${folder.lastAnalysis}\n` : ""}╚══\n\n${content}`;
    usedChars += content.length;
  }

  return context;
}

export async function POST(req: NextRequest) {
  try {
    const { message, profile, businessData, chatHistory } = await req.json();
    if (!message) return NextResponse.json({ error: "No message" }, { status: 400 });

    const uid     = profile?.uid        || "";
    const bizName = profile?.bizName    || "this business";
    const bizType = profile?.bizType    || "small business";
    const goals   = profile?.goals      || [];
    const tone    = profile?.advisorTone || "balanced";
    const name    = profile?.name       || "there";

    const bizLabels: Record<string, string> = {
      retail:     "retail store",
      restaurant: "restaurant",
      ecommerce:  "ecommerce store",
      service:    "service business",
      clinic:     "clinic",
      salon:      "salon",
    };

    const toneMap: Record<string, string> = {
      direct:   "Be direct. Lead with the key number or action. No pleasantries.",
      balanced: "Balance insight with encouragement. Be specific but approachable.",
      coaching: "End with one guiding question to help the user think through next steps.",
    };

    // ── Step 1: Try RAG retrieval ──────────────────────────
    let context      = "";
    let ragUsed      = false;
    let sourceCount  = 0;
    let strategy     = "none";

    if (uid && process.env.OPENAI_API_KEY) {
      try {
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

    // ── Step 2: Fallback to smart context stuffing ─────────
    if (!ragUsed) {
      const bd = businessData as BusinessData | null;
      if (bd && bd.folderCount > 0) {
        context  = scoredFallback(bd, message);
        strategy = "fullcontext";
      }
    }

    // ── Step 3: Build system prompt ────────────────────────
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
- If data is missing for the question, say exactly what file would help
- Never invent or estimate numbers — only cite figures from the data above`;

    // ── Step 4: Claude Sonnet generates the answer ─────────
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

    return NextResponse.json({
      success: true,
      reply,
      meta: { strategy, ragUsed, sourceCount },
    });

  } catch (err: unknown) {
    console.error("[chat]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 }
    );
  }
}
