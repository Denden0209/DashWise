export const dynamic     = "force-dynamic";
export const runtime     = "nodejs";
export const maxDuration = 45;

// Developer guidance generator. Receives the SCHEMA MODEL (table/column
// metadata + relationships — never raw data) and returns structured
// recommendations: target schema design, slicing strategy for big tables,
// star vs snowflake rationale, analytical questions, and a cleaning checklist.
// Cost: ~$0.01 per call (schema in, structured guidance out).

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { schemaText, fileName, shape } = await req.json() as { schemaText: string; fileName: string; shape: string };
    if (!schemaText) return NextResponse.json({ error: "No schema provided" }, { status: 400 });

    const systemPrompt = `You are a senior analytics engineer and data architect writing build guidance for ANOTHER developer who will manually build a dashboard / data model from this dataset. Be concrete and technical. Assume the reader knows SQL and dimensional modeling but has never seen this data.

You are given a profiled schema (tables, columns, types, cardinality, null %, quality flags, and detected foreign-key relationships). Detected shape: ${shape}.

Return ONLY valid JSON — no markdown fences, no prose outside JSON:
{
  "verdict": "1-2 sentence summary of what this dataset is and the recommended modeling approach",
  "targetSchema": {
    "approach": "star | snowflake | flat | one-big-table",
    "rationale": "why THIS approach fits THIS data — reference the actual table names",
    "factTables": [ { "table": "name", "grain": "what one row represents", "measures": ["..."], "foreignKeys": ["..."] } ],
    "dimensionTables": [ { "table": "name", "key": "pk column", "attributes": ["useful descriptive columns"], "scd": "type 1 or 2 recommendation if relevant" } ]
  },
  "slicing": [ { "table": "large table name", "why": "why it should be partitioned/sliced", "strategy": "e.g. partition by year on OrderDate, or split cold vs hot data" } ],
  "snowflakeNotes": "if any dimension could be normalized further (snowflaked) OR denormalized, explain the tradeoff for this data; else empty string",
  "questions": [ "5-8 concrete analytical questions this dataset can answer once modeled — be specific to the columns present" ],
  "cleaning": [ { "table": "name", "column": "name", "issue": "what's wrong", "fix": "specific remediation step" } ],
  "joins": [ { "join": "FactTable.FK = DimTable.PK", "cardinality": "many-to-one", "note": "orphan keys or integrity caveats to handle" } ],
  "buildSteps": [ "ordered, numbered build steps a developer can follow start to finish" ]
}

Rules:
- Reference ACTUAL table and column names from the schema, never generic placeholders
- For slicing, only include tables that are genuinely large (>100K rows) or have a clear cold/hot split; empty array if none
- For cleaning, pull directly from the quality flags in the schema and add any modeling-level issues you infer
- buildSteps should be 6-10 concrete steps
- Be honest about integrity issues (orphan keys, mixed types, high null %)`;

    const response = await claude.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 3500,
      system:     systemPrompt,
      messages:   [{ role: "user", content: `Dataset file: ${fileName}\n\n${schemaText.slice(0, 16000)}` }],
    });

    const raw   = response.content[0].type === "text" ? response.content[0].text : "{}";
    const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let guide: unknown;
    try { guide = JSON.parse(clean); }
    catch { return NextResponse.json({ error: "The guide could not be generated. Try again." }, { status: 422 }); }

    return NextResponse.json({ success: true, guide });
  } catch (err: unknown) {
    console.error("[dev-guide]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate developer guide" },
      { status: 500 }
    );
  }
}
