"""DashWise data-processing service.

Hybrid backend for large / complex files (500k+ rows, multi-sheet Excel,
scanned PDFs). Emits the SAME JSON shapes the browser parser does — DataCube and
SchemaModel — so the existing dashboard renders the output unchanged.

Endpoints:
  GET  /health        liveness
  POST /parse         file -> { content, sheets, rowCount, cube, schema, ... }
  POST /profile       file -> deep per-column profiling + correlations
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import parsing
from .datacube import pick_best_cube
from .schema import build_schema_model
from .summary import build_summary
from .tabular import materialize_sheet

MAX_CONTENT_CHARS = 800_000
SERVICE_TOKEN = os.environ.get("SERVICE_TOKEN", "")
ALLOWED_EXT = {"csv", "xlsx", "xls", "xlsm", "xlsb", "pdf", "txt", "json"}

app = FastAPI(title="DashWise dataproc", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o],
    allow_methods=["*"], allow_headers=["*"],
)


# ── Auth ───────────────────────────────────────────────────
def require_token(x_service_token: Optional[str] = Header(default=None)) -> None:
    """Shared-secret gate. If SERVICE_TOKEN is unset (local dev) auth is skipped.
    In production set SERVICE_TOKEN and send it as the X-Service-Token header."""
    if not SERVICE_TOKEN:
        return
    if x_service_token != SERVICE_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid or missing service token")


def _ext(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def _truncate(content: str) -> tuple[str, bool]:
    if len(content) > MAX_CONTENT_CHARS:
        return content[:MAX_CONTENT_CHARS] + "\n\n[Truncated — full data indexed for AI search]", True
    return content, False


# ── Shared tabular assembly (mirrors buildTabularResult in the browser) ─────
def assemble_tabular(file_name: str, file_type: str,
                     sheet_aoas: List[Dict[str, Any]],
                     sheet_names: Optional[List[str]] = None) -> Dict[str, Any]:
    materialized = [materialize_sheet(s["name"], s["aoa"]) for s in sheet_aoas]
    total_rows = sum(len(m["rows"]) for m in materialized)

    schema = None
    try:
        schema = build_schema_model(file_name, materialized)
    except Exception:   # noqa: BLE001
        schema = None

    cube = pick_best_cube(file_name, materialized)

    if schema:
        content = build_summary(file_name, schema)
    else:
        content = f"FILE: {file_name}\n(Could not profile structure.)"

    if cube:
        content += (f"\n[INTERACTIVE DASHBOARD: enabled from sheet \"{cube['sheetName']}\" — "
                    f"{cube['sourceRowCount']:,} rows, {cube['dateRange']['min']} to "
                    f"{cube['dateRange']['max']}, dimensions: "
                    f"{', '.join(d['name'] for d in cube['dimensions'])}]")

    content, truncated = _truncate(content)
    sheets = sheet_names if sheet_names is not None else (
        [s["name"] for s in sheet_aoas] if len(sheet_aoas) > 1 else [])
    return {
        "success": True, "content": content, "sheets": sheets,
        "rowCount": total_rows, "fileType": file_type, "fileName": file_name,
        "chars": len(content), "truncated": truncated, "cube": cube, "schema": schema,
    }


def _text_result(file_name: str, file_type: str, content: str, row_count: int) -> Dict[str, Any]:
    content, truncated = _truncate(content)
    return {
        "success": True, "content": content, "sheets": [], "rowCount": row_count,
        "fileType": file_type, "fileName": file_name, "chars": len(content),
        "truncated": truncated, "cube": None, "schema": None,
    }


# ── Routes ─────────────────────────────────────────────────
@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "service": "dataproc", "version": "1.0.0"}


@app.post("/parse", dependencies=[Depends(require_token)])
async def parse(file: UploadFile = File(...),
                fileName: Optional[str] = Form(default=None)) -> Dict[str, Any]:
    name = fileName or file.filename or "upload"
    ext = _ext(name)
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400,
                            detail=f'".{ext}" is not supported. Use CSV, Excel, PDF, TXT, or JSON.')
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file received.")

    try:
        if ext == "csv":
            aoa = parsing.read_csv(data)
            return assemble_tabular(name, "csv", [{"name": name, "aoa": aoa}])

        if ext in ("xlsx", "xls", "xlsm", "xlsb"):
            sheets, visible = parsing.read_excel(data)
            if not sheets:
                raise HTTPException(status_code=400, detail="This Excel file has no readable sheets.")
            return assemble_tabular(name, ext, sheets, sheet_names=visible[:parsing.MAX_SHEETS])

        if ext == "pdf":
            pdf = parsing.read_pdf(data)
            if pdf["scanned"]:
                msg = ("This PDF appears to be scanned or image-only — no extractable text was "
                       "found. Try uploading a text-based PDF, or an OCR'd version of this document.")
                return _text_result(name, "pdf", msg, 0)
            if pdf["table"]:
                aoa = [pdf["table"]["headers"], *pdf["table"]["rows"]]
                res = assemble_tabular(name, "pdf", [{"name": name, "aoa": aoa}])
                header = f"--- Document: {pdf['title'] or name} ({pdf['num_pages']} pages) ---"
                res["content"] = (header + "\n\n" + pdf["text"] + "\n\n" + res["content"])[:MAX_CONTENT_CHARS]
                res["chars"] = len(res["content"])
                return res
            header = f"--- Document: {pdf['title'] or name} ({pdf['num_pages']} pages) ---"
            body = f"{header}\n\n{pdf['text']}"
            return _text_result(name, "pdf", body, len([l for l in pdf["text"].splitlines() if l.strip()]))

        if ext == "txt":
            txt = parsing.read_txt(data)
            if txt["aoa"]:
                return assemble_tabular(name, "txt", [{"name": name, "aoa": txt["aoa"]}])
            return _text_result(name, "txt", txt["text"],
                                len([l for l in txt["text"].splitlines() if l.strip()]))

        if ext == "json":
            js = parsing.read_json(data)
            records = js["records"]
            if records and len(records) >= 3:
                aoa = parsing.records_to_aoa(records)
                if len(aoa) and len(aoa[0]) >= 2:
                    return assemble_tabular(name, "json", [{"name": name, "aoa": aoa}])
            import json as _json
            pretty = _json.dumps(js["parsed"], indent=2, default=str)
            row_count = len(js["parsed"]) if isinstance(js["parsed"], list) else len(js["parsed"] or {})
            return _text_result(name, "json", pretty, row_count)

    except HTTPException:
        raise
    except Exception as e:   # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to parse file: {e}") from e

    raise HTTPException(status_code=400, detail="Unhandled file type.")


@app.post("/profile", dependencies=[Depends(require_token)])
async def profile(file: UploadFile = File(...),
                  fileName: Optional[str] = Form(default=None)) -> Dict[str, Any]:
    import io
    import pandas as pd
    from .profiling import profile_dataframe

    name = fileName or file.filename or "upload"
    ext = _ext(name)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file received.")

    try:
        if ext == "csv":
            df = pd.read_csv(io.BytesIO(data), sep=None, engine="python", on_bad_lines="skip")
        elif ext in ("xlsx", "xls", "xlsm", "xlsb"):
            df = pd.read_excel(io.BytesIO(data))   # first sheet
        elif ext == "json":
            js = parsing.read_json(data)
            if not js["records"]:
                raise HTTPException(status_code=400, detail="JSON is not tabular — cannot profile.")
            df = pd.json_normalize(js["records"])
        else:
            raise HTTPException(status_code=400, detail="Profiling supports CSV, Excel, and tabular JSON.")
    except HTTPException:
        raise
    except Exception as e:   # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}") from e

    return {"success": True, "fileName": name, "profile": profile_dataframe(df)}
