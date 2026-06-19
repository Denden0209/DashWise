"""Faithful port of lib/schemaProfiler.ts — emits a SchemaModel dict with the
exact field names the Developer tab and analysis consume."""
from __future__ import annotations

import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .typeutils import (is_blank, is_integer_number, is_numeric_value,
                        parse_date_value, to_number)

KEY_LOOSE = re.compile(r"key$|id$|code$|sk$|_no$|number$", re.I)
SAMPLE_CAP = 20_000
_BOOL_RE = re.compile(r"^(true|false|yes|no|y|n|0|1)$", re.I)


def _num_or_none(s: str):
    try:
        return float(s)
    except ValueError:
        return None


def profile_column(name: str, index: int, rows: List[List[Any]]) -> dict:
    step = math.ceil(len(rows) / SAMPLE_CAP) if len(rows) > SAMPLE_CAP else 1
    non_blank = numeric = ints = dates = bools = negatives = zeros = 0
    cmin, cmax = float("inf"), float("-inf")
    freq: Dict[str, int] = defaultdict(int)
    sample: List[str] = []

    for i in range(0, len(rows), step):
        row = rows[i]
        v = row[index] if index < len(row) else None
        if is_blank(v):
            continue
        non_blank += 1
        s = str(v).strip()
        if len(sample) < 5 and s not in sample:
            sample.append(s)
        if len(freq) <= 5000:
            freq[s] += 1
        if is_numeric_value(v):
            numeric += 1
            n = to_number(v)
            if is_integer_number(n):
                ints += 1
            if n < 0:
                negatives += 1
            if n == 0:
                zeros += 1
            cmin = min(cmin, n)
            cmax = max(cmax, n)
        if parse_date_value(v):
            dates += 1
        if _BOOL_RE.match(s):
            bools += 1

    sampled_rows = math.ceil(len(rows) / step)
    null_pct = ((sampled_rows - non_blank) / sampled_rows) * 100 if sampled_rows else 100
    numeric_pct = numeric / non_blank if non_blank else 0
    date_pct = dates / non_blank if non_blank else 0
    int_pct = ints / numeric if numeric else 0
    bool_pct = bools / non_blank if non_blank else 0
    unique = len(freq)
    unique_pct = (unique / non_blank) * 100 if non_blank else 0

    # data type
    if non_blank == 0:
        data_type = "empty"
    elif date_pct >= 0.7:
        data_type = "date"
    elif bool_pct >= 0.95 and unique <= 2:
        data_type = "boolean"
    elif numeric_pct >= 0.95:
        data_type = "integer" if int_pct > 0.99 else "decimal"
    elif numeric_pct >= 0.5:
        data_type = "mixed"
    else:
        data_type = "text"

    # role
    looks_key = bool(KEY_LOOSE.search(name.strip()))
    if data_type == "date":
        role = "date"
    elif data_type == "boolean":
        role = "flag"
    elif looks_key and data_type in ("integer", "text", "mixed"):
        role = "key"
    elif data_type in ("decimal", "integer") and not looks_key:
        role = "key" if (data_type == "integer" and unique_pct >= 90 and len(rows) > 100) else "measure"
    elif 2 <= unique <= 50:
        role = "dimension"
    else:
        role = "text"

    # quality flags
    quality: List[str] = []
    if null_pct >= 50:
        quality.append(f"{null_pct:.0f}% missing values")
    elif null_pct >= 15:
        quality.append(f"{null_pct:.0f}% nulls")
    if data_type == "mixed":
        quality.append("mixed text/number — needs type cleanup")
    if role == "measure" and negatives > 0:
        quality.append(f"{negatives} negative values (refunds? errors?)")
    if role == "measure" and zeros > sampled_rows * 0.2:
        quality.append(f"{(zeros / sampled_rows) * 100:.0f}% zeros")
    if role in ("dimension", "text"):
        lowered: Dict[str, set] = defaultdict(set)
        for k in freq:
            lowered[k.lower().strip()].add(k)
        dupes = sum(1 for s in lowered.values() if len(s) > 1)
        if dupes > 0:
            quality.append(f"{dupes} values differ only by case/spacing — dedupe candidates")
    if unique == 1 and non_blank > 0:
        quality.append("single constant value — low analytical use")

    return {
        "name": name, "index": index, "role": role, "dataType": data_type,
        "rows": len(rows), "nonBlank": non_blank,
        "nullPct": round(null_pct, 1),
        "unique": unique, "uniquePct": round(unique_pct, 1),
        "sample": sample,
        "min": None if cmin == float("inf") else cmin,
        "max": None if cmax == float("-inf") else cmax,
        "negatives": negatives if role == "measure" else None,
        "zeros": zeros if role == "measure" else None,
        "quality": quality,
    }


def profile_table(name: str, headers: List[str], rows: List[List[Any]]) -> dict:
    columns = [profile_column(h or f"Column_{i + 1}", i, rows) for i, h in enumerate(headers)]
    key_columns = [c["name"] for c in columns if c["role"] == "key"]
    measures = [c for c in columns if c["role"] == "measure"]
    date_field = next((c["name"] for c in columns if c["role"] == "date"), None)
    dims = [c for c in columns if c["role"] == "dimension"]

    role = "unknown"
    has_date = date_field is not None
    many_keys = len(key_columns) >= 2
    has_measures = len(measures) >= 1
    text_cols = sum(1 for c in columns if c["role"] == "text")
    if many_keys and has_measures and (has_date or len(rows) > 1000):
        role = "fact"
    elif len(key_columns) >= 1 and (len(dims) >= 1 or text_cols >= 1) and len(rows) <= 50_000 and len(measures) <= 2:
        role = "dimension"
    elif len(key_columns) >= 2 and len(measures) == 0 and len(columns) <= 4:
        role = "bridge"
    elif has_measures and has_date:
        role = "flat"
    elif len(rows) <= 1000 and len(key_columns) >= 1:
        role = "reference"

    grain = "one row per record"
    if role == "fact":
        grain = (f"one row per transaction/event (dated by {date_field})"
                 if date_field else "one row per transaction line")
    elif role == "dimension":
        base = re.sub(r"_data$|_dim$|s$", "", name, flags=re.I).lower() or "entity"
        grain = f"one row per {base}"
    elif role == "bridge":
        grain = "one row per relationship link (junction table)"

    penalty = 0.0
    for c in columns:
        penalty += min(c["nullPct"] / 5, 12)
        if c["dataType"] == "mixed":
            penalty += 8
        penalty += sum(1 for q in c["quality"] if re.search(r"dedupe|case/spacing", q)) * 5
    quality_score = max(0, round(100 - penalty / max(len(columns), 1) * 2))

    return {
        "name": name, "rowCount": len(rows), "colCount": len(headers),
        "columns": columns, "role": role, "grain": grain, "dateField": date_field,
        "measureCount": len(measures), "keyColumns": key_columns,
        "qualityScore": quality_score,
    }


def detect_relationships(tables: List[dict],
                         key_value_sets: Dict[str, Dict[str, set]]) -> List[dict]:
    rels: List[dict] = []
    by_name = {t["name"]: t for t in tables}
    for t1 in tables:
        for t2 in tables:
            if t1["name"] == t2["name"]:
                continue
            for c1 in t1["keyColumns"]:
                c2 = next((k for k in t2["keyColumns"] if k.lower() == c1.lower()), None)
                if not c2:
                    continue
                set1 = key_value_sets.get(t1["name"], {}).get(c1)
                set2 = key_value_sets.get(t2["name"], {}).get(c2)
                if not set1 or not set2:
                    continue
                overlap = sum(1 for v in set1 if v in set2)
                if overlap == 0:
                    continue
                match_pct = (overlap / len(set1)) * 100
                if match_pct < 60:
                    continue
                t2_unique = next((c["uniquePct"] for c in by_name[t2["name"]]["columns"] if c["name"] == c2), 0)
                t1_unique = next((c["uniquePct"] for c in by_name[t1["name"]]["columns"] if c["name"] == c1), 0)
                cardinality = "many-to-many"
                if t2_unique >= 98 and t1_unique < 98:
                    cardinality = "many-to-one"
                elif t2_unique >= 98 and t1_unique >= 98:
                    cardinality = "one-to-one"
                elif t2_unique < 98 and t1_unique >= 98:
                    cardinality = "one-to-many"
                if cardinality in ("many-to-one", "one-to-one"):
                    rels.append({
                        "fromTable": t1["name"], "fromColumn": c1,
                        "toTable": t2["name"], "toColumn": c2,
                        "matchPct": round(match_pct, 1),
                        "cardinality": cardinality,
                        "orphans": len(set1) - overlap,
                    })
    return rels


def determine_shape(tables: List[dict], rels: List[dict]) -> str:
    if len(tables) == 1:
        return "single-table"
    facts = [t for t in tables if t["role"] == "fact"]
    dims = [t for t in tables if t["role"] in ("dimension", "reference")]
    if len(facts) == 0 and len(rels) == 0:
        return "single-table" if len(tables) == 1 else "disconnected"
    if len(facts) > 1:
        return "multi-fact"
    dim_names = {d["name"] for d in dims}
    dim_to_dim = any(r["fromTable"] in dim_names and r["toTable"] in dim_names for r in rels)
    if len(facts) == 1 and dim_to_dim:
        return "snowflake"
    if len(facts) == 1 and len(dims) >= 1:
        return "star"
    if len(facts) == 0 and all(t["role"] == "flat" for t in tables):
        return "flat"
    return "star" if rels else "disconnected"


def build_schema_model(file_name: str, sheets: List[dict]) -> dict:
    tables: List[dict] = []
    key_value_sets: Dict[str, Dict[str, set]] = {}
    for s in sheets:
        if len(s["rows"]) == 0 or len(s["headers"]) == 0:
            continue
        t = profile_table(s["name"], s["headers"], s["rows"])
        tables.append(t)
        key_value_sets[s["name"]] = {}
        for kc in t["keyColumns"]:
            try:
                idx = s["headers"].index(kc)
            except ValueError:
                continue
            vals = set()
            step = math.ceil(len(s["rows"]) / SAMPLE_CAP) if len(s["rows"]) > SAMPLE_CAP else 1
            for i in range(0, len(s["rows"]), step):
                v = s["rows"][i][idx] if idx < len(s["rows"][i]) else None
                if not is_blank(v):
                    vals.add(str(v).strip())
            key_value_sets[s["name"]][kc] = vals

    relationships = detect_relationships(tables, key_value_sets)
    shape = determine_shape(tables, relationships)

    return {
        "fileName": file_name,
        "tables": tables,
        "relationships": relationships,
        "shape": shape,
        "factTables": [t["name"] for t in tables if t["role"] == "fact"],
        "dimensionTables": [t["name"] for t in tables if t["role"] in ("dimension", "reference")],
        "totalRows": sum(t["rowCount"] for t in tables),
        "builtAt": datetime.now(timezone.utc).isoformat(),
    }
