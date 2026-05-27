// app/api/analyze-folder/route.ts
// Returns structured dashboard data + narrative.
// Dashboard data includes rich metrics for filtering and charting.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export const runtime = "nodejs";

const NARRATIVE_PROMPTS: Record<string, string> = {
  explain: `**What Your Data Shows** (3-4 sentences overall picture)
**What's Working** (specific positives with numbers)
**What's Concerning** (problems needing attention)
**Cross-File Connections** (insights from comparing files)`,
  meeting: `**Executive Summary** (3 sentences)
**Top 5 Talking Points** (with specific numbers)
**Likely Questions & Answers**
**The One Number That Matters Most**`,
  anomaly: `**🚨 Critical Issues** (immediate action needed)
**⚠️ Warnings** (trending wrong)
**✅ Looks Normal**
**❓ Needs Investigation**`,
  action: `**Do This Week** (urgent, with numbers)
**Do This Month** (strategic moves)
**Fix These Numbers** (specific metrics to change)
**Watch These Metrics** (leading indicators)`,
};

export async function POST(req: NextRequest) {
  try {
    const { files, businessType, bizName, mode, goals } = await req.json();
    if (!files || files.length === 0)
      return NextResponse.json({ error: "No files provided" }, { status: 400 });

    const fileContext = files
      .map((f: { fileName: string; fileType: string; content: string; sheets?: string[] }, i: number) =>
        `═══ FILE ${i + 1}: ${f.fileName} (${f.fileType.toUpperCase()}) ═══\n${f.content}`)
      .join("\n\n");

    const bizContext: Record<string, string> = {
      retail:     "retail store — sales, margins, inventory, product performance",
      restaurant: "restaurant — covers, food cost %, labor %, average ticket",
      ecommerce:  "ecommerce — orders, AOV, CAC, ROAS, returns",
      service:    "service — billable hours, revenue, client retention",
      clinic:     "clinic — appointments, utilization, revenue per provider",
      salon:      "salon — bookings, service revenue, stylist performance",
    };

    const systemPrompt = `You are DashWise, an expert AI business analyst for ${bizName || "this business"} — a ${bizContext[businessType] || "small business"}.
${goals?.length ? `Owner goals: ${goals.join(", ")}.` : ""}

OUTPUT TWO SECTIONS:

SECTION 1 — Between ===JSON_START=== and ===JSON_END===, output ONLY raw JSON (no markdown, no backticks, no code fences):
{
  "summary": "2-3 sentence executive summary",
  "kpis": [
    {
      "id": "unique_key",
      "label": "Metric Name",
      "value": "formatted display value",
      "raw": 12345,
      "unit": "$|%|#|x",
      "trend": "up|down|flat|unknown",
      "trendPct": "+12.5%",
      "category": "revenue|cost|efficiency|growth|other",
      "period": "period label if known"
    }
  ],
  "series": [
    {
      "id": "unique_key",
      "name": "Series Name",
      "type": "bar|line|pie|area",
      "category": "revenue|cost|efficiency|growth|other",
      "xAxis": ["label1", "label2", "label3"],
      "datasets": [
        { "name": "Series A", "data": [100, 200, 300], "color": "#2563ff" }
      ]
    }
  ],
  "tables": [
    {
      "id": "unique_key",
      "title": "Table Title",
      "category": "revenue|cost|efficiency|growth|other",
      "headers": ["Column1", "Column2", "Column3"],
      "rows": [["val1", "val2", "val3"]],
      "sortable": true
    }
  ],
  "alerts": [
    { "level": "critical|warning|info|success", "title": "Title", "message": "Detail with specific number" }
  ],
  "availableFilters": {
    "categories": ["revenue", "cost", "efficiency"],
    "periods": ["period1", "period2"],
    "metrics": ["metric1", "metric2"]
  }
}

RULES for JSON:
- Extract ONLY real numbers from the actual files — never invent data
- Build 4-8 KPIs from the most important metrics found
- Build 3-5 chart series appropriate to the data type and time periods found
- For time-series data (weekly/monthly) use line charts
- For comparisons (products, categories) use bar charts
- For composition (% breakdown) use pie charts
- Build 1-3 tables with key breakdowns
- Flag 2-5 alerts based on what you actually see in the data
- availableFilters should list what categories and periods exist in THIS data

SECTION 2 — After the JSON block, write the narrative:
${NARRATIVE_PROMPTS[mode] || NARRATIVE_PROMPTS.explain}
Reference actual file names and numbers. Be specific.`;

    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 4000,
      system:     systemPrompt,
      messages: [{ role: "user", content: `Analyze these ${files.length} file(s):\n\n${fileContext.slice(0, 40000)}` }],
    });

    const fullText = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON block
    let dashboardData = null;
    const jsonMatch = fullText.match(/===JSON_START===([\s\S]*?)===JSON_END===/);
    if (jsonMatch) {
      try {
        // Strip markdown code fences Claude sometimes adds despite instructions
        const raw = jsonMatch[1]
          .trim()
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        dashboardData = JSON.parse(raw);
      } catch (e) { console.error("JSON parse error:", e); }
    }

    // Also try extracting JSON directly if the delimiters weren't used
    if (!dashboardData) {
      const directMatch = fullText.match(/```json\s*([\s\S]*?)```/i)
        || fullText.match(/(\{[\s\S]*"kpis"[\s\S]*\})/);
      if (directMatch) {
        try { dashboardData = JSON.parse(directMatch[1].trim()); }
        catch (e) { /* silently fail — narrative still returned */ }
      }
    }

    const narrative = fullText.replace(/===JSON_START===[\s\S]*?===JSON_END===/g, "").trim();

    return NextResponse.json({ success: true, dashboardData, analysis: narrative, filesAnalyzed: files.length });

  } catch (err: unknown) {
    console.error("Analyze error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
