// lib/schemaProfiler.ts
// Profiles a multi-sheet workbook into a structured schema model:
//   - per-table column profiles (type, cardinality, null %, quality flags)
//   - fact vs dimension classification
//   - foreign-key relationship detection (the join graph)
//   - schema-shape verdict (star / snowflake / flat / disconnected)
//   - developer recommendations (modeling, slicing, cleaning, questions)
// Pure TypeScript — runs in the browser at upload time, zero API cost.
// Shared by: cube join enrichment (A), all-sheet analysis (B), Developer tab.

import { parseDateValue, isNumericValue, toNumber } from "@/lib/dataCube";

// ── Types ──────────────────────────────────────────────────
export type ColRole = "key" | "date" | "measure" | "dimension" | "text" | "flag";

export type ColumnInfo = {
  name:        string;
  index:       number;
  role:        ColRole;
  dataType:    "integer" | "decimal" | "date" | "text" | "boolean" | "mixed" | "empty";
  rows:        number;
  nonBlank:    number;
  nullPct:     number;        // 0-100
  unique:      number;
  uniquePct:   number;        // 0-100 of nonBlank
  sample:      string[];      // up to 5 example values
  min?:        number;
  max?:        number;
  negatives?:  number;
  zeros?:      number;
  quality:     string[];      // human-readable quality flags
};

export type TableInfo = {
  name:        string;        // sheet name
  rowCount:    number;
  colCount:    number;
  columns:     ColumnInfo[];
  role:        "fact" | "dimension" | "bridge" | "flat" | "reference" | "unknown";
  grain:       string;        // human description of one row
  dateField?:  string;
  measureCount: number;
  keyColumns:  string[];
  qualityScore: number;       // 0-100
};

export type Relationship = {
  fromTable:  string;
  fromColumn: string;
  toTable:    string;
  toColumn:   string;
  matchPct:   number;         // % of fact keys found in dimension
  cardinality: "many-to-one" | "one-to-one" | "one-to-many" | "many-to-many";
  orphans:    number;         // keys in fact with no dim match
};

export type SchemaShape = "star" | "snowflake" | "flat" | "multi-fact" | "disconnected" | "single-table";

export type SchemaModel = {
  fileName:        string;
  tables:          TableInfo[];
  relationships:   Relationship[];
  shape:           SchemaShape;
  factTables:      string[];
  dimensionTables: string[];
  totalRows:       number;
  builtAt:         string;
};

// ── Config ─────────────────────────────────────────────────
const KEY_RE     = /(^|_|\s)(key|id|code|no|nbr|number|sk)$/i;
const KEY_LOOSE  = /key$|id$|code$|sk$|_no$|number$/i;
const MONEY_RE   = /amount|price|cost|revenue|sales|total|profit|margin|fee|tax|pay|wage|salary|spend|income|expense|balance|value/i;
const DIM_HINT   = /territory|region|channel|category|subcategory|type|status|segment|store|location|department|product|class|group|country|state|city|brand|color|size|gender|name|title|description|method|source/i;
const SAMPLE_CAP = 20_000;

// ── Profile one column ─────────────────────────────────────
function profileColumn(name: string, index: number, rows: unknown[][]): ColumnInfo {
  const step = rows.length > SAMPLE_CAP ? Math.ceil(rows.length / SAMPLE_CAP) : 1;
  let nonBlank = 0, numeric = 0, ints = 0, dates = 0, bools = 0, negatives = 0, zeros = 0;
  let min = Infinity, max = -Infinity;
  const freq = new Map<string, number>();
  const sample: string[] = [];

  for (let i = 0; i < rows.length; i += step) {
    const v = rows[i][index];
    if (v === null || v === undefined || v === "") continue;
    nonBlank++;
    const s = String(v).trim();
    if (sample.length < 5 && !sample.includes(s)) sample.push(s);
    if (freq.size <= 5000) freq.set(s, (freq.get(s) || 0) + 1);

    if (isNumericValue(v)) {
      numeric++;
      const n = toNumber(v);
      if (Number.isInteger(n)) ints++;
      if (n < 0) negatives++;
      if (n === 0) zeros++;
      if (n < min) min = n;
      if (n > max) max = n;
    }
    if (parseDateValue(v)) dates++;
    if (/^(true|false|yes|no|y|n|0|1)$/i.test(s)) bools++;
  }

  const sampledRows = Math.ceil(rows.length / step);
  const nullPct   = sampledRows ? ((sampledRows - nonBlank) / sampledRows) * 100 : 100;
  const numericPct = nonBlank ? numeric / nonBlank : 0;
  const datePct    = nonBlank ? dates / nonBlank : 0;
  const intPct     = numeric ? ints / numeric : 0;
  const boolPct    = nonBlank ? bools / nonBlank : 0;
  const unique     = freq.size;
  const uniquePct  = nonBlank ? (unique / nonBlank) * 100 : 0;

  // Data type
  let dataType: ColumnInfo["dataType"] = "text";
  if (nonBlank === 0) dataType = "empty";
  else if (datePct >= 0.7) dataType = "date";
  else if (boolPct >= 0.95 && unique <= 2) dataType = "boolean";
  else if (numericPct >= 0.95) dataType = intPct > 0.99 ? "integer" : "decimal";
  else if (numericPct >= 0.5) dataType = "mixed";

  // Role
  let role: ColRole = "text";
  const looksKey = KEY_LOOSE.test(name.trim());
  if (dataType === "date") role = "date";
  else if (dataType === "boolean") role = "flag";
  // A *Key / *Id / *Code named integer or text column is a key (PK or FK).
  // FKs in a fact table have LOW uniqueness (many rows share a key), so we must
  // NOT gate on uniquePct here — the name is the signal.
  else if (looksKey && (dataType === "integer" || dataType === "text" || dataType === "mixed")) role = "key";
  else if ((dataType === "decimal" || dataType === "integer") && !looksKey) {
    // Unnamed high-cardinality integer = surrogate key, else a measure
    role = (dataType === "integer" && uniquePct >= 90 && rows.length > 100) ? "key" : "measure";
  }
  else if (unique >= 2 && unique <= 50) role = "dimension";
  else role = "text";

  // Quality flags
  const quality: string[] = [];
  if (nullPct >= 50) quality.push(`${nullPct.toFixed(0)}% missing values`);
  else if (nullPct >= 15) quality.push(`${nullPct.toFixed(0)}% nulls`);
  if (dataType === "mixed") quality.push("mixed text/number — needs type cleanup");
  if (role === "measure" && negatives > 0) quality.push(`${negatives} negative values (refunds? errors?)`);
  if (role === "measure" && zeros > sampledRows * 0.2) quality.push(`${((zeros/sampledRows)*100).toFixed(0)}% zeros`);
  if (role === "dimension" || role === "text") {
    // Detect case/whitespace dupes
    const lowered = new Map<string, Set<string>>();
    for (const [k] of freq) {
      const norm = k.toLowerCase().trim();
      if (!lowered.has(norm)) lowered.set(norm, new Set());
      lowered.get(norm)!.add(k);
    }
    const dupes = [...lowered.values()].filter(s => s.size > 1).length;
    if (dupes > 0) quality.push(`${dupes} values differ only by case/spacing — dedupe candidates`);
  }
  if (unique === 1 && nonBlank > 0) quality.push("single constant value — low analytical use");

  return {
    name, index, role, dataType,
    rows: rows.length, nonBlank,
    nullPct: +nullPct.toFixed(1),
    unique, uniquePct: +uniquePct.toFixed(1),
    sample,
    min: min === Infinity ? undefined : min,
    max: max === -Infinity ? undefined : max,
    negatives: role === "measure" ? negatives : undefined,
    zeros: role === "measure" ? zeros : undefined,
    quality,
  };
}

// ── Profile one table ──────────────────────────────────────
export function profileTable(name: string, headers: string[], rows: unknown[][]): TableInfo {
  const columns = headers.map((h, i) => profileColumn(h || `Column_${i+1}`, i, rows));
  const keyColumns = columns.filter(c => c.role === "key").map(c => c.name);
  const measures   = columns.filter(c => c.role === "measure");
  const dateField  = columns.find(c => c.role === "date")?.name;
  const dims       = columns.filter(c => c.role === "dimension");

  // Role heuristic
  let role: TableInfo["role"] = "unknown";
  const hasDate = !!dateField;
  const manyKeys = keyColumns.length >= 2;
  const hasMeasures = measures.length >= 1;
  if (manyKeys && hasMeasures && (hasDate || rows.length > 1000)) role = "fact";
  else if (keyColumns.length >= 1 && (dims.length >= 1 || columns.filter(c=>c.role==="text").length >= 1) && rows.length <= 50_000 && measures.length <= 2) role = "dimension";
  else if (keyColumns.length >= 2 && measures.length === 0 && columns.length <= 4) role = "bridge";
  else if (hasMeasures && hasDate) role = "flat";
  else if (rows.length <= 1000 && keyColumns.length >= 1) role = "reference";

  // Grain description
  let grain = "one row per record";
  if (role === "fact")      grain = dateField ? `one row per transaction/event (dated by ${dateField})` : "one row per transaction line";
  if (role === "dimension") grain = `one row per ${name.replace(/_data$|_dim$|s$/i, "").toLowerCase() || "entity"}`;
  if (role === "bridge")    grain = "one row per relationship link (junction table)";

  // Quality score: penalize nulls, mixed types, dupes
  let penalty = 0;
  for (const c of columns) {
    penalty += Math.min(c.nullPct / 5, 12);
    if (c.dataType === "mixed") penalty += 8;
    penalty += c.quality.filter(q => /dedupe|case\/spacing/.test(q)).length * 5;
  }
  const qualityScore = Math.max(0, Math.round(100 - penalty / Math.max(columns.length, 1) * 2));

  return {
    name, rowCount: rows.length, colCount: headers.length,
    columns, role, grain, dateField,
    measureCount: measures.length, keyColumns, qualityScore,
  };
}

// ── Detect relationships across tables ─────────────────────
export function detectRelationships(
  tables: TableInfo[],
  keyValueSets: Record<string, Record<string, Set<string>>>,  // table -> column -> value set
): Relationship[] {
  const rels: Relationship[] = [];
  for (const t1 of tables) {
    for (const t2 of tables) {
      if (t1.name === t2.name) continue;
      for (const c1 of t1.keyColumns) {
        // find a key in t2 with matching/similar name
        const c2 = t2.keyColumns.find(k => k.toLowerCase() === c1.toLowerCase());
        if (!c2) continue;
        const set1 = keyValueSets[t1.name]?.[c1];
        const set2 = keyValueSets[t2.name]?.[c2];
        if (!set1 || !set2 || set1.size === 0 || set2.size === 0) continue;

        let overlap = 0;
        set1.forEach(v => { if (set2.has(v)) overlap++; });
        if (overlap === 0) continue;
        const matchPct = (overlap / set1.size) * 100;
        if (matchPct < 60) continue;

        // cardinality: is c2 unique in t2? (dimension PK) → many-to-one
        const t2unique = t2.columns.find(c => c.name === c2)?.uniquePct || 0;
        const t1unique = t1.columns.find(c => c.name === c1)?.uniquePct || 0;
        let cardinality: Relationship["cardinality"] = "many-to-many";
        if (t2unique >= 98 && t1unique < 98) cardinality = "many-to-one";
        else if (t2unique >= 98 && t1unique >= 98) cardinality = "one-to-one";
        else if (t2unique < 98 && t1unique >= 98) cardinality = "one-to-many";

        // only record fact→dim direction (many-to-one) or one-to-one to avoid dupes
        if (cardinality === "many-to-one" || cardinality === "one-to-one") {
          rels.push({
            fromTable: t1.name, fromColumn: c1,
            toTable: t2.name, toColumn: c2,
            matchPct: +matchPct.toFixed(1),
            cardinality,
            orphans: set1.size - overlap,
          });
        }
      }
    }
  }
  return rels;
}

// ── Determine overall schema shape ─────────────────────────
export function determineShape(tables: TableInfo[], rels: Relationship[]): SchemaShape {
  if (tables.length === 1) return "single-table";
  const facts = tables.filter(t => t.role === "fact");
  const dims  = tables.filter(t => t.role === "dimension" || t.role === "reference");

  if (facts.length === 0 && rels.length === 0) {
    return tables.length === 1 ? "single-table" : "disconnected";
  }
  if (facts.length > 1) return "multi-fact";

  // snowflake = a dimension joins to another dimension (dim→dim relationship)
  const dimNames = new Set(dims.map(d => d.name));
  const dimToDim = rels.some(r => dimNames.has(r.fromTable) && dimNames.has(r.toTable));
  if (facts.length === 1 && dimToDim) return "snowflake";
  if (facts.length === 1 && dims.length >= 1) return "star";
  if (facts.length === 0 && tables.every(t => t.role === "flat")) return "flat";
  return rels.length > 0 ? "star" : "disconnected";
}

// ── Build the full schema model ────────────────────────────
export function buildSchemaModel(
  fileName: string,
  sheets: { name: string; headers: string[]; rows: unknown[][] }[],
): SchemaModel {
  const tables: TableInfo[] = [];
  const keyValueSets: Record<string, Record<string, Set<string>>> = {};

  for (const s of sheets) {
    if (s.rows.length === 0 || s.headers.length === 0) continue;
    const t = profileTable(s.name, s.headers, s.rows);
    tables.push(t);
    // capture key value sets for relationship detection
    keyValueSets[s.name] = {};
    for (const kc of t.keyColumns) {
      const idx = s.headers.indexOf(kc);
      if (idx < 0) continue;
      const set = new Set<string>();
      const step = s.rows.length > SAMPLE_CAP ? Math.ceil(s.rows.length / SAMPLE_CAP) : 1;
      for (let i = 0; i < s.rows.length; i += step) {
        const v = s.rows[i][idx];
        if (v !== null && v !== undefined && v !== "") set.add(String(v).trim());
      }
      keyValueSets[s.name][kc] = set;
    }
  }

  const relationships = detectRelationships(tables, keyValueSets);
  const shape = determineShape(tables, relationships);

  return {
    fileName,
    tables,
    relationships,
    shape,
    factTables:      tables.filter(t => t.role === "fact").map(t => t.name),
    dimensionTables: tables.filter(t => t.role === "dimension" || t.role === "reference").map(t => t.name),
    totalRows:       tables.reduce((s, t) => s + t.rowCount, 0),
    builtAt:         new Date().toISOString(),
  };
}

// ── Compact schema for sending to Claude (Option B + Dev tab) ──
export function schemaToText(model: SchemaModel): string {
  const lines: string[] = [];
  lines.push(`SCHEMA: ${model.fileName} — shape: ${model.shape.toUpperCase()} — ${model.tables.length} tables, ${model.totalRows.toLocaleString()} total rows`);

  for (const t of model.tables) {
    lines.push(`\n■ TABLE: ${t.name}  [${t.role}]  ${t.rowCount.toLocaleString()} rows × ${t.colCount} cols  (quality ${t.qualityScore}/100)`);
    lines.push(`  grain: ${t.grain}`);
    for (const c of t.columns) {
      const extra: string[] = [`${c.role}`, c.dataType];
      if (c.role === "key" || c.role === "dimension") extra.push(`${c.unique} distinct`);
      if (c.role === "measure" && c.min !== undefined) extra.push(`range ${c.min}..${c.max}`);
      if (c.nullPct >= 5) extra.push(`${c.nullPct}% null`);
      const q = c.quality.length ? `  ⚠ ${c.quality.join("; ")}` : "";
      lines.push(`    - ${c.name} (${extra.join(", ")})${q}`);
    }
  }

  if (model.relationships.length) {
    lines.push(`\nRELATIONSHIPS (join graph):`);
    for (const r of model.relationships) {
      lines.push(`  ${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn}  [${r.cardinality}, ${r.matchPct}% match${r.orphans ? `, ${r.orphans} orphan keys` : ""}]`);
    }
  } else {
    lines.push(`\nRELATIONSHIPS: none detected — tables appear independent`);
  }
  return lines.join("\n");
}
