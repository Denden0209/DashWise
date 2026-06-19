"""Deep data profiling for the /profile endpoint — richer than the schema model:
per-column distributions, missingness, outliers and numeric correlations.
Powers the 'smarter than ever' data-quality view."""
from __future__ import annotations

from typing import Any, Dict, List


def profile_dataframe(df, max_cols: int = 60) -> Dict[str, Any]:
    import pandas as pd  # noqa: F401

    cols = list(df.columns)[:max_cols]
    n = len(df)
    columns: List[Dict[str, Any]] = []

    for col in cols:
        s = df[col]
        non_null = int(s.notna().sum())
        null_pct = round((1 - non_null / n) * 100, 1) if n else 0.0
        nunique = int(s.nunique(dropna=True))
        info: Dict[str, Any] = {
            "name": str(col),
            "dtype": str(s.dtype),
            "nonNull": non_null,
            "nullPct": null_pct,
            "distinct": nunique,
        }
        numeric = None
        try:
            numeric = pd_to_numeric(s)
        except Exception:   # noqa: BLE001
            numeric = None

        if numeric is not None and numeric.notna().sum() >= max(10, 0.5 * non_null):
            desc = numeric.describe()
            mean = float(desc.get("mean", 0) or 0)
            std = float(desc.get("std", 0) or 0)
            info["kind"] = "numeric"
            info["stats"] = {
                "min": _f(desc.get("min")), "max": _f(desc.get("max")),
                "mean": _f(mean), "median": _f(numeric.median()),
                "std": _f(std),
                "p25": _f(desc.get("25%")), "p75": _f(desc.get("75%")),
                "negatives": int((numeric < 0).sum()),
                "zeros": int((numeric == 0).sum()),
            }
            if std > 0:
                outliers = int((abs(numeric - mean) > 3 * std).sum())
                info["stats"]["outliers3sigma"] = outliers
        else:
            info["kind"] = "categorical"
            top = s.dropna().astype(str).value_counts().head(10)
            info["top"] = [{"value": str(k), "count": int(v)} for k, v in top.items()]

        columns.append(info)

    # Correlations among numeric columns (helps surface drivers)
    correlations: List[Dict[str, Any]] = []
    try:
        num_df = df[cols].apply(pd_to_numeric).dropna(axis=1, how="all")
        if num_df.shape[1] >= 2:
            corr = num_df.corr(numeric_only=True)
            seen = set()
            for a in corr.columns:
                for b in corr.columns:
                    if a == b or (b, a) in seen:
                        continue
                    seen.add((a, b))
                    val = corr.loc[a, b]
                    if val == val and abs(val) >= 0.5:   # not NaN, meaningful
                        correlations.append({"a": str(a), "b": str(b), "r": round(float(val), 2)})
            correlations.sort(key=lambda x: abs(x["r"]), reverse=True)
            correlations = correlations[:15]
    except Exception:   # noqa: BLE001
        correlations = []

    return {"rowCount": n, "columnCount": len(df.columns),
            "columns": columns, "correlations": correlations}


def pd_to_numeric(s):
    import pandas as pd
    return pd.to_numeric(s.astype(str).str.replace(r"[$,%\s]", "", regex=True), errors="coerce")


def _f(v):
    try:
        f = float(v)
        return None if f != f else round(f, 4)
    except (TypeError, ValueError):
        return None
