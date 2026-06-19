"""Faithful port of buildDataCube (lib/dataCube.ts).

Operates on the same array-of-arrays the browser uses and emits a DataCube dict
with EXACTLY the same JSON shape, so the existing dashboard renders a
Python-built cube unchanged. Input may be millions of rows; the output cube
stays compact (it is aggregated to week/month grain)."""
from __future__ import annotations

import math
import re
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from .typeutils import (is_blank, is_integer_number, is_numeric_value,
                        month_key, month_start_iso, parse_date_value,
                        to_number, week_start_iso)

MAX_DIMENSIONS = 4
MAX_DIM_VALUES = 25
DIM_CARDINALITY_MAX = 50
MAX_CUBE_ROWS = 50_000          # if exceeded at week grain -> rebuild at month grain
OTHER_LABEL = "Other"
SAMPLE_CAP = 20_000

_DIM_HINT = re.compile(
    r"territory|region|channel|category|type|status|segment|store|location|"
    r"department|product line|class|group|country|state", re.I)
_ID_NAME = re.compile(r"key$|id$|number$|^id|sk$", re.I)
_MONEY_RE = re.compile(
    r"amount|price|cost|revenue|sales|total|profit|margin|fee|tax|pay|wage|"
    r"salary|spend|income|expense", re.I)
_DATE_HINT = re.compile(r"date|day|time|period", re.I)


class ColProfile:
    __slots__ = ("name", "index", "non_blank", "numeric_pct", "int_pct",
                 "date_pct", "unique", "top_values")

    def __init__(self, name, index, non_blank, numeric_pct, int_pct,
                 date_pct, unique, top_values):
        self.name = name
        self.index = index
        self.non_blank = non_blank
        self.numeric_pct = numeric_pct
        self.int_pct = int_pct
        self.date_pct = date_pct
        self.unique = unique
        self.top_values = top_values   # list[(value, count)] desc


def _profile_columns(headers: List[str], rows: List[List[Any]]) -> List[ColProfile]:
    step = math.ceil(len(rows) / SAMPLE_CAP) if len(rows) > SAMPLE_CAP else 1
    profiles: List[ColProfile] = []
    for index, name in enumerate(headers):
        non_blank = numeric = ints = dates = 0
        freq: Dict[str, int] = defaultdict(int)
        for i in range(0, len(rows), step):
            row = rows[i]
            v = row[index] if index < len(row) else None
            if is_blank(v):
                continue
            non_blank += 1
            if is_numeric_value(v):
                numeric += 1
                if is_integer_number(to_number(v)):
                    ints += 1
            if parse_date_value(v):
                dates += 1
            if len(freq) <= 5000:
                freq[str(v).strip()] += 1
        top = sorted(freq.items(), key=lambda kv: kv[1], reverse=True)
        profiles.append(ColProfile(
            name=name, index=index, non_blank=non_blank,
            numeric_pct=(numeric / non_blank) if non_blank else 0.0,
            int_pct=(ints / numeric) if numeric else 0.0,
            date_pct=(dates / non_blank) if non_blank else 0.0,
            unique=len(freq), top_values=top,
        ))
    return profiles


def _pick_date_column(profiles: List[ColProfile]) -> Optional[ColProfile]:
    cands = []
    for p in profiles:
        if p.date_pct >= 0.7 and p.non_blank > 0:
            hint = 1 if _DATE_HINT.search(p.name) else 0
            cands.append((p.date_pct + hint, p))
    cands.sort(key=lambda x: x[0], reverse=True)
    return cands[0][1] if cands else None


def _pick_dimensions(profiles, date_name, row_count) -> List[ColProfile]:
    scored = []
    for p in profiles:
        if (p.name != date_name and 2 <= p.unique <= DIM_CARDINALITY_MAX
                and p.non_blank >= row_count * 0.3 and p.date_pct < 0.7):
            hint = 2 if _DIM_HINT.search(p.name) else 0
            card = 1 if 2 <= p.unique <= 25 else 0
            penalty = 1.5 if (p.numeric_pct > 0.9 and hint == 0) else 0
            score = hint + card + p.non_blank / max(row_count, 1) - penalty
            scored.append((score, p))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:MAX_DIMENSIONS]]


def _pick_measures(profiles, date_name, dims, row_count) -> List[ColProfile]:
    dim_names = {d.name for d in dims}
    out = []
    for p in profiles:
        if p.name == date_name or p.name in dim_names:
            continue
        if p.numeric_pct < 0.7:
            continue
        id_name = bool(_ID_NAME.search(p.name.strip()))
        if id_name and p.unique > DIM_CARDINALITY_MAX:
            continue
        if p.unique >= row_count * 0.9 and row_count > 100 and p.int_pct > 0.99:
            continue
        if p.date_pct >= 0.7:
            continue
        out.append(p)
    return out[:8]


def build_data_cube(file_name: str, sheet_name: str,
                    headers: List[str], rows: List[List[Any]]) -> Optional[dict]:
    if len(rows) < 10 or len(headers) < 2:
        return None

    profiles = _profile_columns(headers, rows)
    date_col = _pick_date_column(profiles)
    if not date_col:
        return None

    dims = _pick_dimensions(profiles, date_col.name, len(rows))
    measures = _pick_measures(profiles, date_col.name, dims, len(rows))
    if not measures:
        return None

    dim_value_sets = [{v for v, _ in d.top_values[:MAX_DIM_VALUES]} for d in dims]

    def aggregate_at(grain_base: str):
        cube_map: Dict[str, dict] = {}
        min_d = max_d = ""
        skipped = 0
        for row in rows:
            raw = row[date_col.index] if date_col.index < len(row) else None
            d = parse_date_value(raw)
            if not d:
                skipped += 1
                continue
            wk = week_start_iso(d) if grain_base == "week" else month_start_iso(d)
            mo = month_key(d)
            day_iso = d.isoformat()
            if not min_d or day_iso < min_d:
                min_d = day_iso
            if not max_d or day_iso > max_d:
                max_d = day_iso

            dvals = {}
            for i, dim in enumerate(dims):
                rv = row[dim.index] if dim.index < len(row) else None
                v = "(blank)" if is_blank(rv) else str(rv).strip()
                dvals[dim.name] = v if v in dim_value_sets[i] else OTHER_LABEL

            key = wk + "|" + mo + "|" + "|".join(dvals[d.name] for d in dims)
            cr = cube_map.get(key)
            if cr is None:
                cr = {"w": wk, "mo": mo, "d": dvals,
                      "m": {ms.name: 0.0 for ms in measures}, "n": 0}
                cube_map[key] = cr
            cr["n"] += 1
            for ms in measures:
                mv = row[ms.index] if ms.index < len(row) else None
                if is_numeric_value(mv):
                    cr["m"][ms.name] += to_number(mv)
        return cube_map, min_d, max_d, skipped

    grain_base = "week"
    cube_map, min_d, max_d, skipped = aggregate_at("week")
    if len(cube_map) > MAX_CUBE_ROWS:
        grain_base = "month"
        cube_map, min_d, max_d, skipped = aggregate_at("month")
    if len(cube_map) == 0:
        return None

    span_days = (datetime.fromisoformat(max_d) - datetime.fromisoformat(min_d)).days

    dimensions = []
    for d in dims:
        vals = [v for v, _ in d.top_values[:MAX_DIM_VALUES]]
        if d.unique > MAX_DIM_VALUES:
            vals = vals + [OTHER_LABEL]
        dimensions.append({"name": d.name, "values": vals})

    return {
        "version": 1,
        "fileName": file_name,
        "sheetName": sheet_name,
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "dateField": date_col.name,
        "dateRange": {"min": min_d, "max": max_d},
        "spanDays": span_days,
        "grainBase": grain_base,
        "dimensions": dimensions,
        "measures": [m.name for m in measures],
        "moneyMeasures": [m.name for m in measures if _MONEY_RE.search(m.name)],
        "rows": list(cube_map.values()),
        "sourceRowCount": len(rows),
        "skippedRows": skipped,
    }


def pick_best_cube(file_name: str, sheets: List[dict]) -> Optional[dict]:
    """sheets: list of materialized { name, headers, rows }. Picks the largest
    sheet that yields a cube (fact tables tend to be the biggest)."""
    candidates = sorted(sheets, key=lambda s: len(s["rows"]), reverse=True)
    for s in candidates:
        try:
            cube = build_data_cube(file_name, s["name"], s["headers"], s["rows"])
            if cube:
                return cube
        except Exception:  # noqa: BLE001  (best-effort, mirrors TS try/catch)
            continue
    return None
