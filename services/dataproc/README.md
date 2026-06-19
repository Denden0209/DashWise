# DashWise data-processing service (`dataproc`)

A FastAPI microservice that parses **large / complex files** (500k+ row CSVs,
multi-sheet Excel, PDFs) and returns the **exact same JSON shapes** the browser
parser produces — `DataCube` and `SchemaModel`. Because the contract is
identical, the existing Next.js dashboard, Developer tab, and AI work unchanged
whether a file was parsed in the browser or here.

This is the **Phase 2** backend from the project plan. The browser still handles
small files instantly (zero cost); the app routes big/complex ones here.

## Why a separate service?
- pandas / openpyxl / pdfplumber handle scale and real PDF tables far better
  than in-browser JS, and without the ~50k-row ceiling.
- Vercel can't run heavy/long Python — deploy this on **Cloud Run / Railway /
  Render** (any container host).

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/health`  | liveness probe |
| `POST` | `/parse`   | `multipart/form-data` `file` → `{ content, sheets, rowCount, fileType, fileName, chars, truncated, cube, schema }` |
| `POST` | `/profile` | `multipart/form-data` `file` → deep per-column profiling + correlations |

All non-health routes require the `X-Service-Token` header **when `SERVICE_TOKEN`
is set** (leave it unset locally to skip auth).

## Run locally
```bash
cd services/dataproc
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080

# smoke test
curl localhost:8080/health
curl -F "file=@/path/to/data.csv" localhost:8080/parse | python -m json.tool
```

## Docker
```bash
docker build -t dashwise-dataproc services/dataproc
docker run -p 8080:8080 -e SERVICE_TOKEN=dev-secret dashwise-dataproc
```

## Deploy (Cloud Run example)
```bash
gcloud run deploy dashwise-dataproc \
  --source services/dataproc \
  --region us-central1 --allow-unauthenticated \
  --set-env-vars SERVICE_TOKEN=$(openssl rand -hex 24),ALLOWED_ORIGINS=https://your-app.vercel.app
```
Then set in the Next.js app's env: `DATAPROC_URL` and `DATAPROC_TOKEN`
(see `app/api/parse-proxy/route.ts`).

## Architecture notes
- `app/typeutils.py`, `app/tabular.py`, `app/datacube.py`, `app/schema.py` are
  **line-by-line ports** of `lib/dataCube.ts`, `lib/schemaProfiler.ts`, and the
  improved header/materialize helpers in `lib/parseFileClient.ts`. Keep them in
  sync if the TS evolves — the JSON contract is what makes the frontend agnostic
  to which engine ran.
- `app/parsing.py` does robust file reading (pandas / openpyxl / pdfplumber).
- The cube is **aggregated** (week/month grain), so input can be millions of
  rows while the returned cube stays small (≤ 50k cube rows, same cap as the
  browser; beyond that it rolls week→month exactly like the TS engine).

## Roadmap (Phase 3 — not yet implemented here)
- `POST /ingest` + `POST /query`: LlamaIndex ingestion into a vector DB
  (pgvector / Qdrant) and a DuckDB/pandas query engine so the AI **computes**
  over the full dataset (NL→SQL), not just retrieves text.
- DuckDB-backed cube builder for 10M+ row inputs.
- Multi-sheet join enrichment (port of `buildJoinLookups`/`enrichFactRows`).
