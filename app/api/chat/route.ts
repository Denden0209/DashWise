// app/api/chat/route.ts
// Receives full business context from client — all folders, all files.
// No Firestore reads server-side.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { message, profile, businessData, chatHistory } = await req.json();
    if (!message) return NextResponse.json({ error: "No message" }, { status: 400 });

    const name    = profile?.name     || "there";
    const bizName = profile?.bizName  || "this business";
    const bizType = profile?.bizType  || "small business";
    const goals   = profile?.goals    || [];
    const tone    = profile?.advisorTone || "balanced";

    const bizContext: Record<string, string> = {
      retail:     "retail store — focus on sales, margins, inventory, top products",
      restaurant: "restaurant — focus on covers, food cost %, labor %, average ticket",
      ecommerce:  "ecommerce — focus on orders, AOV, CAC, ROAS, returns",
      service:    "service business — focus on billable hours, revenue, retention",
      clinic:     "clinic — focus on appointments, utilization, revenue per provider",
      salon:      "salon — focus on bookings, service revenue, stylist performance",
    };

    // Build full business context from all folders/files
    let businessContext = "No data uploaded yet.";
    if (businessData && businessData.folderCount > 0) {
      businessContext = businessData.folderSummaries
        .map((folder: {
          folderName:    string;
          fileNames:     string[];
          fileTypes:     string[];
          parsedContent: string;
          lastAnalysis:  string;
        }) => {
          let ctx = `\n═══ FOLDER: "${folder.folderName}" ═══\n`;
          ctx += `Files: ${folder.fileNames.join(", ")}\n`;
          if (folder.lastAnalysis) {
            ctx += `Previous analysis: ${folder.lastAnalysis}\n`;
          }
          if (folder.parsedContent) {
            ctx += `\nData:\n${folder.parsedContent.slice(0, 4000)}\n`;
          }
          return ctx;
        })
        .join("\n");
    }

    const systemPrompt = `You are the dedicated AI business advisor for ${bizName}, a ${bizContext[bizType] || bizType}.
Owner: ${name}
Goals: ${goals.length ? goals.join(", ") : "not set yet"}
Communication style: ${tone === "direct" ? "Be blunt and direct." : tone === "coaching" ? "Ask guiding questions." : "Balance insight with encouragement."}

FULL BUSINESS DATA — ALL FOLDERS AND FILES:
${businessContext}

YOUR ROLE:
You have access to ALL uploaded data across ALL folders. You can see patterns, trends, and connections across the entire business.
When answering:
- Reference specific folder names and file names when relevant
- Compare data across folders when useful
- Spot cross-folder trends the owner might miss
- Always tie advice to actual numbers from the data
- Be specific — never give generic business advice
- Use **bold** for key numbers and action items
- Keep responses focused — 2-4 paragraphs max

If data is limited, say so and ask for the specific upload that would help answer the question.`;

    const messages = [
      ...(chatHistory || []).map((m: { role: string; content: string }) => ({
        role:    m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1000,
      system:     systemPrompt,
      messages,
    });

    const reply = response.content[0].type === "text"
      ? response.content[0].text
      : "I had trouble responding. Please try again.";

    return NextResponse.json({ success: true, reply });

  } catch (err: unknown) {
    console.error("[chat] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 }
    );
  }
}
