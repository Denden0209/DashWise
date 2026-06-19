"""Builds the compact `content` text sent to Claude — the Python equivalent of
buildSmartSummary. It does not need to byte-match the TS output; it just needs
to give the model a faithful, importance-ranked picture of the data."""
from __future__ import annotations

from typing import List

_ROLE_RANK = {"fact": 0, "flat": 1, "dimension": 2, "bridge": 3, "reference": 4, "unknown": 5}


def _fmt(n) -> str:
    try:
        n = float(n)
    except (TypeError, ValueError):
        return str(n)
    a = abs(n)
    if a >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if a >= 10_000:
        return f"{n / 1_000:.1f}K"
    return f"{int(n):,}" if n == int(n) else f"{n:.2f}"


def build_summary(file_name: str, schema: dict, char_budget: int = 60_000) -> str:
    lines: List[str] = []
    lines.append(
        f"FILE: {file_name} — shape: {schema['shape'].upper()} — "
        f"{len(schema['tables'])} table(s), {schema['totalRows']:,} total rows")

    tables = sorted(schema["tables"], key=lambda t: (_ROLE_RANK.get(t["role"], 5), -t["rowCount"]))
    for t in tables:
        lines.append(
            f"\n■ {t['name']}  [{t['role']}]  {t['rowCount']:,} rows × {t['colCount']} cols "
            f"(quality {t['qualityScore']}/100)")
        lines.append(f"  grain: {t['grain']}")
        for c in t["columns"]:
            bits = [c["role"], c["dataType"]]
            if c["role"] in ("key", "dimension"):
                bits.append(f"{c['unique']} distinct")
            if c["role"] == "measure" and c.get("min") is not None:
                bits.append(f"range {_fmt(c['min'])}..{_fmt(c['max'])}")
            if c["nullPct"] >= 5:
                bits.append(f"{c['nullPct']}% null")
            q = f"  ⚠ {'; '.join(c['quality'])}" if c["quality"] else ""
            lines.append(f"    - {c['name']} ({', '.join(str(b) for b in bits)}){q}")
            if len("\n".join(lines)) > char_budget:
                lines.append("    … (truncated for length)")
                break
        if len("\n".join(lines)) > char_budget:
            break

    if schema["relationships"]:
        lines.append("\nRELATIONSHIPS (join graph):")
        for r in schema["relationships"]:
            orph = f", {r['orphans']} orphan keys" if r["orphans"] else ""
            lines.append(
                f"  {r['fromTable']}.{r['fromColumn']} → {r['toTable']}.{r['toColumn']} "
                f"[{r['cardinality']}, {r['matchPct']}% match{orph}]")
    else:
        lines.append("\nRELATIONSHIPS: none detected — tables appear independent")

    return "\n".join(lines)
