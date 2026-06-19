# DashWise — Setup after the latest update

This covers what (if anything) you need to configure after publishing the
smarter-parsing + data-service changes.

## TL;DR

| Part | Setup needed? |
|---|---|
| **Phase 1** — smarter PDF/Excel/CSV/JSON parsing | **None.** Just deploy. |
| **Phase 2** — Python data service for 500k+ row files | Optional. Deploy one container + set 4 env vars. |
| Firebase | **Nothing new.** Reuses your existing config. |

If you do nothing for Phase 2, large files simply keep parsing in the browser
(no breakage). Set it up when you want real large-file scale.

---

## Phase 1 — nothing to do ✅

The parsing improvements are 100% client-side. After your normal
`git push` → Vercel deploy, they're live. `papaparse` was already a dependency;
`@types/papaparse` is build-time only and installs automatically.

---

## Phase 2 — turn on the Python data service (optional)

You deploy **`services/dataproc/`** as a container to **one** host, then point
the Next.js app at it with two env vars.

### Step 1 — generate a shared secret

You'll use the same secret in two places. Generate one:

```bash
# macOS/Linux/Git-Bash
openssl rand -hex 24
```
```powershell
# Windows PowerShell
-join ((48..57)+(97..102) | Get-Random -Count 48 | % {[char]$_})
```
Copy the output — call it `<SECRET>` below.

### Step 2 — deploy the container

Pick ONE host.

#### Option A — Google Cloud Run (recommended)

Prereqs: a Google Cloud account + project, and the `gcloud` CLI
(`gcloud auth login`, `gcloud config set project <PROJECT_ID>`).

```bash
cd "/c/Users/User/Desktop/Working App/dashwise-v1/dashwise"

gcloud run deploy dashwise-dataproc \
  --source services/dataproc \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --set-env-vars "SERVICE_TOKEN=<SECRET>,ALLOWED_ORIGINS=https://YOUR-APP.vercel.app"
```

When it finishes it prints a **Service URL** like
`https://dashwise-dataproc-xxxxxxxx-uc.a.run.app` — that's your `DATAPROC_URL`.

> `--allow-unauthenticated` only means Google won't add its own auth layer; our
> own `SERVICE_TOKEN` check still protects the endpoints.

#### Option B — Railway

1. Create a Railway account → **New Project → Deploy from GitHub repo**.
2. Set **Root Directory** to `services/dataproc` (it auto-detects the Dockerfile).
3. **Variables** tab → add `SERVICE_TOKEN=<SECRET>` and
   `ALLOWED_ORIGINS=https://YOUR-APP.vercel.app`.
4. Copy the generated public URL → that's your `DATAPROC_URL`.

#### Option C — Render

1. Create a Render account → **New → Web Service** → connect the repo.
2. **Root Directory**: `services/dataproc`, **Runtime**: Docker.
3. **Environment** → add `SERVICE_TOKEN=<SECRET>` and
   `ALLOWED_ORIGINS=https://YOUR-APP.vercel.app`.
4. Copy the `onrender.com` URL → that's your `DATAPROC_URL`.

### Step 3 — point Vercel at the service

In the Vercel dashboard → your project → **Settings → Environment Variables**,
add (Production + Preview):

| Name | Value |
|---|---|
| `DATAPROC_URL` | the Service URL from Step 2 |
| `DATAPROC_TOKEN` | the **same** `<SECRET>` from Step 1 |

Then **redeploy** (Deployments → ⋯ → Redeploy, or push a commit).

### Step 4 — verify

```bash
# health (no auth)
curl https://YOUR-SERVICE-URL/health
# → {"status":"ok","service":"dataproc","version":"1.0.0"}

# parse a CSV directly (auth on)
curl -H "X-Service-Token: <SECRET>" \
     -F "file=@/path/to/data.csv" \
     https://YOUR-SERVICE-URL/parse | head -c 400
```

In the app: upload a file **larger than 8MB**. If the service is wired up it's
parsed server-side; otherwise it falls back to the browser (check the browser
console for `[dataproc] falling back…`).

---

## Firebase — nothing new

The proxy (`app/api/parse-proxy/route.ts`) verifies the signed-in user with your
existing `NEXT_PUBLIC_FIREBASE_API_KEY`. No new Firebase project, rules, or
services are required for what's built today.

---

## Local development (optional)

Run the service on your machine to test before deploying:

```bash
cd services/dataproc
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080      # leave SERVICE_TOKEN unset = no auth locally
```
Then set `DATAPROC_URL=http://localhost:8080` in `.env.local` and run `npm run dev`.

---

## Known limitation (and the real fix)

Vercel caps request bodies at ~4.5MB. Because the routing threshold is 8MB,
files big enough to route will exceed that limit *going through Vercel* and fall
back to browser parsing. To make large files truly reach the Python service in
production, the right path is:

**browser → Firebase Storage → signed URL → service**

That bypasses Vercel's body limit. It isn't built yet and would require enabling
**Firebase Storage** (you already have `storage.rules`). Ask and I'll implement
it — that's the piece that unlocks genuine 500k+ row processing in production.

---

## Cost expectations

- Cloud Run / Railway / Render all scale to (near) zero when idle — you pay only
  while parsing. For light use this is typically within free tiers or a few
  dollars/month.
- No new cost from Phase 1 (runs in the user's browser).
