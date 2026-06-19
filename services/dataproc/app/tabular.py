"""Header detection + sheet materialization — ports of the improved helpers in
lib/parseFileClient.ts so Python picks the same header row and drops the same
summary rows as the browser parser."""
from __future__ import annotations

from typing import Any, List

from .typeutils import is_blank, is_numeric_value

_SUMMARY_WORDS = ("total", "sum", "grand", "subtotal", "average", "avg",
                  "count", "overall", "summary")


def _num_or_none(s: str):
    try:
        return float(s)
    except ValueError:
        return None


def detect_header_row(aoa: List[List[Any]]) -> int:
    """Scan the first ~15 rows, score each on how header-like it is."""
    scan = min(15, len(aoa))
    best, best_score = 0, float("-inf")
    for i in range(scan):
        raw = aoa[i] or []
        cells = [("" if is_blank(c) else str(c).strip()) for c in raw]
        non_empty = sum(1 for c in cells if c)
        if non_empty < 2:
            continue
        str_count = sum(1 for c in cells if c and _num_or_none(c) is None)
        num_count = sum(1 for c in raw if is_numeric_value(c))
        distinct = len({c for c in cells if c})
        uniq_pct = distinct / max(non_empty, 1)
        density = non_empty / max(len(raw), 1)
        score = str_count - num_count + uniq_pct * 3 + density * 2
        if score > best_score:
            best_score, best = score, i
    return best


def is_summary_row(row: List[Any], headers: List[str]) -> bool:
    first = ("" if is_blank(row[0]) else str(row[0])).lower().strip() if row else ""
    if any(w in first for w in _SUMMARY_WORDS):
        return True
    non_empty = sum(1 for c in row if not is_blank(c))
    if non_empty <= 1 and len(headers) > 3:
        return True
    return False


def materialize_sheet(name: str, aoa: List[List[Any]]) -> dict:
    """aoa -> { name, headers, rows } matching SheetData in lib/dataCube.ts."""
    if not aoa:
        return {"name": name, "headers": [], "rows": []}
    header_idx = detect_header_row(aoa)
    headers = [("" if is_blank(h) else str(h).strip()) for h in (aoa[header_idx] or [])]
    rows: List[List[Any]] = []
    for row in aoa[header_idx + 1:]:
        if all(is_blank(c) for c in row):
            continue
        if is_summary_row(row, headers):
            continue
        rows.append(row)
    return {"name": name, "headers": headers, "rows": rows}
