// app/api/analyze/route.ts — AI ANALYSIS ENDPOINT
// ─────────────────────────────────────────────────────────
// This runs SERVER-SIDE (never in the browser).
// Receives raw data from the upload page,
// sends it to Claude, returns structured JSON analysis.
// Server-side means your API key stays secret.
// ─────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { rawData, businessType, mode, fileName } = await req.json();

    if (!rawData) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    // ── Build the system prompt based on analysis mode ──
    const modePrompts: Record<string, string> = {
      explain: `Explain the dashboard data in plain English. Structure as:
**What's Happening** (2-3 sentences, big picture)
**The Details That Matter** (3-4 bullet points)
**What's Working** (1-2 positives)
**What's Concerning** (1-2 problems)
Keep under 250 words. Use $ and % naturally. No jargon.`,

      meeting: `Prepare this manager for their next meeting. Structure as:
**Your 3-Minute Opening** (what to say to open)
**3 Key Talking Points** (bullet points they can speak to)
**Likely Questions You'll Get** (2-3 questions and suggested answers)
**The One Number To Remember** (single most important metric)
Write like you're coaching a colleague before a meeting.`,

      anomaly: `Flag what's unusual or concerning. Structure as:
**🚨 Red Flags** (needs immediate attention)
**⚠️ Watch List** (trending in a bad direction)
**✅ Stable** (holding steady — reassurance)
**❓ Questions To Investigate** (things to dig into)
Reference actual numbers. Don't sugarcoat real problems.`,

      action: `Tell this manager exactly what to do next. Structure as:
**This Week** (1-2 immediate actions)
**This Month** (2-3 medium-term moves)
**Who To Talk To** (which team or person to loop in and why)
**What To Monitor** (2 metrics to watch as leading indicators)
Be decisive. Pick the best path.`,

      parse: `You are a data parser. Extract structured information from this data.
Respond ONLY in valid JSON (no markdown, no backticks):
{
  "dataType": "what kind of data this is",
  "period": "time period if detectable",
  "recordCount": "approximate records",
  "fieldsDetected": ["field1", "field2"],
  "quality": "good|fair|poor",
  "qualityNote": "one sentence on data quality",
  "insights": [{"title":"","finding":"","action":"","priority":"high|medium|low"}],
  "topMetrics": [{"label":"","value":"","trend":"up|down|flat|unknown"}],
  "warnings": ["issue1"]
}`,
    };

    const bizContext: Record<string, string> = {
      retail:     "Focus on sales, inventory, foot traffic, margins, and product performance.",
      restaurant: "Focus on covers, average ticket, food cost %, labor %, and table turns.",
      ecommerce:  "Focus on orders, AOV, CAC, ROAS, conversion rate, and returns.",
      service:    "Focus on billable hours, project revenue, client retention, and pipeline.",
      clinic:     "Focus on appointments, no-shows, revenue per provider, and utilization.",
      salon:      "Focus on bookings, service revenue, retail sales, and stylist performance.",
    };

    const systemPrompt = `You are DashWise, an AI business advisor for ${businessType || "small business"} owners. 
${bizContext[businessType] || "Focus on revenue, costs, and profitability."}
${modePrompts[mode] || modePrompts.explain}
Speak in plain business language — never use analytics jargon.`;

    // ── Call Claude ────────────────────────────────────────
    const response = await client.messages.create({
      model:      "claude-haiku-4-5", // Haiku for parsing — cheaper, fast
      max_tokens: 1000,
      system:     systemPrompt,
      messages: [{
        role:    "user",
        content: `File: ${fileName || "data"}\n\nData:\n${rawData.slice(0, 4000)}`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // ── For parse mode, return structured JSON ─────────────
    if (mode === "parse") {
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        return NextResponse.json({ success: true, mode, result: parsed });
      } catch {
        return NextResponse.json({ success: true, mode, result: { raw: text } });
      }
    }

    // ── For all other modes, return the text directly ──────
    return NextResponse.json({ success: true, mode, result: text });

  } catch (err: unknown) {
    console.error("Analyze API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
