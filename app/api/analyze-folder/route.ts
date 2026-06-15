export const dynamic     = "force-dynamic";
export const runtime     = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { files, businessType, bizName, mode, goals } = await req.json();
    if (!files || files.length === 0)
      return NextResponse.json({ error: "No files provided" }, { status: 400 });

    const modeInstructions: Record<string, string> = {
      explain: "Give a comprehensive business analysis. Identify key metrics, trends, and insights.",
      meeting: "Produce bullet-point talking points with specific numbers for a management meeting.",
      anomaly: "Find problems, anomalies, outliers, data quality issues, and risks.",
      action:  "Give 5 specific, actionable next steps ranked by business impact.",
    };

    const fileContext = files.map((f: { fileName: string; fileType: string; content: string; sheets?: string[] }) =>
      `FILE: ${f.fileName} (${f.fileType.toUpperCase()}${f.sheets?.length ? `, ${f.sheets.length} sheets` : ""})\n${f.content.slice(0, 40000)}`
    ).join("\n\n---\n\n");

    const systemPrompt = `You are an expert business analyst. Analyze the uploaded business data for ${bizName || "this business"}.
Business type: ${businessType || "small business"}
Goals: ${goals?.join(", ") || "improve performance"}
Mode: ${modeInstructions[mode] || modeInstructions.explain}

Return ONLY a valid JSON object — no markdown, no backticks, no text outside the JSON.

Exact structure:
{
  "summary": "2-3 sentence executive summary",
  "analysis": "Full markdown analysis with **bold** key numbers. Use ** section headers **.",
  "kpis": [
    { "label": "metric name", "value": "formatted value", "trend": "up|down|neutral", "color": "#hex" }
  ],
  "insights": ["insight 1", "insight 2", "insight 3"],
  "warnings": ["warning 1"],
  "actions": ["action 1", "action 2", "action 3"],
  "charts": [
    { "type": "bar|line|pie|donut", "title": "chart title", "data": [{ "label": "string", "value": 123, "color": "#hex" }] }
  ]
}

Rules: extract REAL numbers from the data. 4-6 kpis. 2-4 charts with real data. Chart values must be plain numbers (no $ or commas). Use #34c759 for positive, #ff3b30 for problems, #0071e3 for neutral, #af52de and #ff9f0a for variety.`;

    const response = await claude.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 4000,
      system:     systemPrompt,
      messages:   [{ role: "user", content: `Analyze this business data:\n\n${fileContext}` }],
    });

    const raw   = response.content[0].type === "text" ? response.content[0].text : "{}";
    const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let dd: Record<string, unknown>;
    try {
      dd = JSON.parse(clean);
    } catch {
      return NextResponse.json({
        success:  true,
        analysis: raw,
        dashboardData: { summary: "", kpis: [], insights: [], warnings: [], actions: [], charts: [] },
      });
    }

    return NextResponse.json({
      success:  true,
      analysis: (dd.analysis as string) || raw,
      dashboardData: {
        summary:  dd.summary  || "",
        kpis:     dd.kpis     || [],
        insights: dd.insights || [],
        warnings: dd.warnings || [],
        actions:  dd.actions  || [],
        charts:   dd.charts   || [],
      },
    });

  } catch (err: unknown) {
    console.error("[analyze-folder]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
