export const dynamic     = "force-dynamic";
export const runtime     = "nodejs";
export const maxDuration = 30;

// Dashboard Copilot: receives the cube SCHEMA (never the data) and the user's
// question, returns a VIEW SPEC. The browser computes every number locally —
// Claude designs the view, it never invents figures. Cost: ~$0.005 per ask.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Schema = {
  fileName:   string;
  dateField:  string;
  dateRange:  { min: string; max: string };
  grains:     string[];
  multiYear:  boolean;
  dimensions: { name: string; values: string[] }[];
  measures:   string[];
};

const VALID_GRAINS = ["week", "month", "quarter", "year"];
const VALID_CHARTS = ["bar", "line", "donut"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeMeasure(m: any, measures: string[]): any | null {
  if (!m || typeof m !== "object") return null;
  if (m.kind === "count") return { kind: "count" };
  if (m.kind === "field" && measures.includes(m.field)) return { kind: "field", field: m.field };
  if (m.kind === "avg" && measures.includes(m.field)) return { kind: "avg", field: m.field };
  if (m.kind === "ratio" && measures.includes(m.num) && measures.includes(m.den))
    return { kind: "ratio", num: m.num, den: m.den, pct: !!m.pct };
  if (m.kind === "marginPct" && measures.includes(m.revenue) && measures.includes(m.cost))
    return { kind: "marginPct", revenue: m.revenue, cost: m.cost };
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { question, schema } = await req.json() as { question: string; schema: Schema };
    if (!question?.trim()) return NextResponse.json({ error: "No question provided" }, { status: 400 });
    if (!schema?.measures?.length) return NextResponse.json({ error: "No schema provided" }, { status: 400 });

    const dimDesc = schema.dimensions.map(d =>
      `  - "${d.name}": [${d.values.slice(0, 25).map(v => `"${v}"`).join(", ")}]`
    ).join("\n");

    const systemPrompt = `You are a dashboard view designer. The user has a business dataset and wants a custom dashboard view. You design the view; the user's browser computes all numbers from their local data. You NEVER invent numbers.

DATASET SCHEMA:
File: ${schema.fileName}
Date field: ${schema.dateField} (range ${schema.dateRange.min} to ${schema.dateRange.max})
Available grains: ${schema.grains.join(", ")}${schema.multiYear ? " — multi-year data, YoY comparison available" : ""}
Dimensions (filterable fields and their values):
${dimDesc}
Measures (numeric fields, aggregated by sum):
${schema.measures.map(m => `  - "${m}"`).join("\n")}

Respond with ONLY a valid JSON object — no markdown, no backticks, no commentary:
{
  "filters": { "<DimensionName>": ["value1","value2"] },          // omit or {} for no filters; values MUST come from the lists above
  "grain": "week|month|quarter|year",                              // pick from available grains
  "yoy": false,                                                    // true only if the user asks for year comparison AND multi-year
  "dateWindow": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },     // optional; omit for all time; must be inside the date range
  "kpis": [ { "label": "Total Sales", "measure": {"kind":"field","field":"<measure>"} } ],   // 2-4 items
  "charts": [                                                      // 2-4 items
    { "type": "line", "title": "...", "dimension": "_date", "measure": {"kind":"field","field":"<measure>"} },
    { "type": "bar",  "title": "...", "dimension": "<DimensionName>", "measure": {...}, "topN": 10 },
    { "type": "donut","title": "...", "dimension": "<DimensionName>", "measure": {...} }
  ],
  "note": "One sentence explaining the view you built."
}

Measure spec kinds:
- {"kind":"field","field":"<measure name>"} — SUM of that field (use for revenue, quantity, totals, counts of things)
- {"kind":"avg","field":"<measure name>"} — AVERAGE per row (use for prices, rates, percentages, scores, ages — anything where a total would be meaningless)
- {"kind":"count"} — row count
- {"kind":"ratio","num":"<measure>","den":"<measure>","pct":true} — sum(num)/sum(den)
- {"kind":"marginPct","revenue":"<measure>","cost":"<measure>"} — (rev-cost)/rev as %

Rules:
- Choose sum vs avg intelligently: a "unit price" or "rate" should be avg, "revenue" or "units sold" should be sum.
- "dimension":"_date" means a time series at the chosen grain (use type "line")
- Use ONLY field names exactly as listed in the schema
- If the question can't be answered from this schema (e.g. needs a specific customer ID or fields not listed), return {"unsupported": true, "note": "explain briefly and suggest asking the Advisor chat instead"}`;

    const response = await claude.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1200,
      system:     systemPrompt,
      messages:   [{ role: "user", content: question.slice(0, 1000) }],
    });

    const raw   = response.content[0].type === "text" ? response.content[0].text : "{}";
    const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let spec: any;
    try { spec = JSON.parse(clean); }
    catch { return NextResponse.json({ error: "The agent returned an invalid view. Try rephrasing your question." }, { status: 422 }); }

    if (spec.unsupported) {
      return NextResponse.json({ success: true, unsupported: true, note: String(spec.note || "This question needs the Advisor chat.") });
    }

    // ── Server-side validation: never trust raw model output ──
    const dimNames = new Set(schema.dimensions.map(d => d.name));
    const dimValues: Record<string, Set<string>> = {};
    schema.dimensions.forEach(d => { dimValues[d.name] = new Set(d.values); });

    const filters: Record<string, string[]> = {};
    if (spec.filters && typeof spec.filters === "object") {
      for (const [k, v] of Object.entries(spec.filters)) {
        if (dimNames.has(k) && Array.isArray(v)) {
          const valid = (v as string[]).filter(x => dimValues[k].has(String(x)));
          if (valid.length) filters[k] = valid;
        }
      }
    }

    const grain = VALID_GRAINS.includes(spec.grain) && schema.grains.includes(spec.grain)
      ? spec.grain : (schema.grains.includes("month") ? "month" : schema.grains[0]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpis = (Array.isArray(spec.kpis) ? spec.kpis : []).map((k: any) => {
      const m = sanitizeMeasure(k?.measure, schema.measures);
      return m ? { label: String(k.label || "KPI").slice(0, 40), measure: m } : null;
    }).filter(Boolean).slice(0, 4);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const charts = (Array.isArray(spec.charts) ? spec.charts : []).map((c: any) => {
      const m = sanitizeMeasure(c?.measure, schema.measures);
      if (!m) return null;
      if (!VALID_CHARTS.includes(c?.type)) return null;
      const dim = c?.dimension === "_date" || dimNames.has(c?.dimension) ? c.dimension : null;
      if (!dim) return null;
      return {
        type: c.type, title: String(c.title || "Chart").slice(0, 60),
        dimension: dim, measure: m,
        topN: Math.min(Math.max(Number(c.topN) || 10, 3), 15),
      };
    }).filter(Boolean).slice(0, 4);

    if (charts.length === 0 && kpis.length === 0) {
      return NextResponse.json({ error: "The agent couldn't build a valid view for that question. Try being more specific about which fields you want to see." }, { status: 422 });
    }

    let dateWindow: { from?: string; to?: string } | undefined;
    if (spec.dateWindow && typeof spec.dateWindow === "object") {
      const f = spec.dateWindow.from, t = spec.dateWindow.to;
      dateWindow = {};
      if (typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f)) dateWindow.from = f;
      if (typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t)) dateWindow.to = t;
      if (!dateWindow.from && !dateWindow.to) dateWindow = undefined;
    }

    return NextResponse.json({
      success: true,
      // NOTE: the client reads `spec` — keep this key in sync with dashboard-view/page.tsx
      spec: {
        filters, grain,
        yoy: !!spec.yoy && schema.multiYear,
        dateWindow,
        kpis, charts,
        note: String(spec.note || "Custom view").slice(0, 200),
      },
    });

  } catch (err: unknown) {
    console.error("[dashboard-agent]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent failed" },
      { status: 500 }
    );
  }
}
