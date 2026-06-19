"""Low-level value helpers — faithful ports of lib/dataCube.ts so the Python
service classifies and parses values identically to the browser parser."""
from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

_ISO_RE = re.compile(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}")
_DMY_RE = re.compile(r"^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}")
_NUM_STRIP = re.compile(r"[$,%\s]")


def parse_date_value(v: Any) -> Optional[date]:
    """Port of parseDateValue: Date, Excel serial, yyyymmdd int/str, ISO/common."""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        if isinstance(v, float) and math.isnan(v):
            return None
        n = float(v)
        # Excel serial date
        if 25569 < n < 80000:
            try:
                return (datetime(1970, 1, 1, tzinfo=timezone.utc)
                        + timedelta(days=n - 25569)).date()
            except (OverflowError, ValueError):
                return None
        # yyyymmdd integer key (e.g. 20130715)
        if 19000101 <= n <= 21001231:
            s = str(int(n))
            yy, mm, dd = int(s[0:4]), int(s[4:6]), int(s[6:8])
            if 1 <= mm <= 12 and 1 <= dd <= 31:
                try:
                    return date(yy, mm, dd)
                except ValueError:
                    return None
        return None

    s = str(v).strip()
    if not s:
        return None
    if re.fullmatch(r"\d{8}", s):
        return parse_date_value(int(s))
    if _ISO_RE.match(s) or _DMY_RE.match(s):
        try:
            from dateutil import parser as _dp
            return _dp.parse(s, dayfirst=False).date()
        except (ValueError, OverflowError, TypeError):
            return None
    return None


def is_numeric_value(v: Any) -> bool:
    if v is None or v == "":
        return False
    if isinstance(v, bool):
        return False
    if isinstance(v, (int, float)):
        return not (isinstance(v, float) and math.isnan(v))
    s = _NUM_STRIP.sub("", str(v))
    if s == "":
        return False
    try:
        float(s)
        return True
    except ValueError:
        return False


def to_number(v: Any) -> float:
    if isinstance(v, bool):
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(_NUM_STRIP.sub("", str(v)))
    except ValueError:
        return 0.0


def is_blank(v: Any) -> bool:
    if v is None or v == "":
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    return False


def is_integer_number(n: float) -> bool:
    return float(n).is_integer()


def week_start_iso(d: date) -> str:
    """Monday of the week containing d."""
    monday = d - timedelta(days=d.weekday())  # Monday == 0
    return monday.isoformat()


def month_start_iso(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}-01"


def month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"
