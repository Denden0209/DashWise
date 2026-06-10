export const dynamic     = "force-dynamic";
export const runtime     = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type FolderInput = {
  name:       string;
  bizType:    string;
  fileCount:  number;
  summary:    string;
  kpis:       { label:string; value:string; trend:string }[];
  warnings:   string[];
  analyzedAt: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const { question, ownerName, folders } = await req.json() as {
      question: string; ownerName: string; folders: FolderInput[];
    };

    if (!folders || folders.length === 0)
      return NextResponse.json({ error: "No business data provided" }, { status: 400 });

    const portfolioContext = folders.map((f, i) => [
      `═══ BUSINESS ${i+1}: ${f.name} ═══`,
      f.bizType   ? `Type: ${f.bizType}` : "",
      `Files: ${f.fileCount}`,
      f.analyzedAt ? `Last analyzed: ${new Date(f.analyzedAt).toLocaleDateString()}` : "⚠ Never analyzed — no metrics available",
      f.summary   ? `Summary: ${f.summary}` : "",
      f.kpis?.length ? `Key metrics:\n${f.kpis.map(k => `  - ${k.label}: ${k.value} (${k.trend})`).join("\n")}` : "",
      f.warnings?.length ? `Warnings:\n${f.warnings.map(w => `  ⚠ ${w}`).join("\n")}` : "",
    ].filter(Boolean).join("\n")).join("\n\n");

    const systemPrompt = `You are the portfolio-level AI advisor for ${ownerName}, who owns/manages multiple businesses tracked in DashWise.

You are looking at their ENTIRE portfolio. Each business may be a completely different type — a hospital, a restaurant, a watch shop, tax documents — do NOT force-combine unrelated metrics into a single number unless the user explicitly asks for totals.

Your job:
- Answer at the ACCOUNT level, referencing each business by name
- Compare businesses where comparison makes sense (margins, growth, health)
- Flag which businesses need attention and why
- Call out businesses that were never analyzed (no data available for them)
- Be specific with numbers from the metrics provided
- Use **bold** for business names and key numbers
- 3-6 paragraphs maximum. No preamble.

PORTFOLIO DATA:
${portfolioContext}`;

    const response = await claude.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1500,
      system:     systemPrompt,
      messages:   [{ role: "user", content: question || "Give me a complete portfolio overview." }],
    });

    const insight = response.content[0].type === "text"
      ? response.content[0].text
      : "Could not generate insight. Please try again.";

    return NextResponse.json({ success: true, insight });

  } catch (err: unknown) {
    console.error("[portfolio]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Portfolio analysis failed" },
      { status: 500 }
    );
  }
}
