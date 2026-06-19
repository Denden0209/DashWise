export const dynamic     = "force-dynamic";
export const runtime     = "nodejs";
export const maxDuration = 60;

// Thin proxy to the Python data-processing service (Phase 2). Keeps the service
// URL + shared secret server-side and verifies the caller's Firebase ID token so
// this is not an open relay. If the service is not configured or errors, returns
// a status the client treats as "fall back to browser parsing".
//
// Required env: DATAPROC_URL (e.g. https://dashwise-dataproc-xxxx.run.app)
//               DATAPROC_TOKEN (matches SERVICE_TOKEN on the service)
//
// NOTE: serverless platforms cap request bodies (~4.5MB on Vercel). For very
// large files the production path is: upload to Firebase Storage from the
// browser, then pass a signed URL here / to the service. See services/dataproc.

import { NextRequest, NextResponse } from "next/server";

async function verifyUser(req: NextRequest): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const idToken = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!apiKey || !idToken) return false;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return false;
    const data = await res.json() as { users?: unknown[] };
    return Array.isArray(data.users) && data.users.length > 0;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const serviceUrl = process.env.DATAPROC_URL;
  // 503 → client falls back to in-browser parsing (graceful when unset).
  if (!serviceUrl) {
    return NextResponse.json({ error: "Data service not configured", fallback: true }, { status: 503 });
  }

  if (!(await verifyUser(req))) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const inForm  = await req.formData();
    const file    = inForm.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const outForm = new FormData();
    outForm.set("file", file, file.name);
    outForm.set("fileName", (inForm.get("fileName") as string) || file.name);

    const res = await fetch(`${serviceUrl.replace(/\/$/, "")}/parse`, {
      method: "POST",
      headers: { "X-Service-Token": process.env.DATAPROC_TOKEN || "" },
      body: outForm,
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = JSON.parse(text); } catch { data = null; }

    if (!res.ok || !data) {
      return NextResponse.json(
        { error: (data as { detail?: string })?.detail || `Data service error (${res.status})`, fallback: true },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proxy failed", fallback: true },
      { status: 502 }
    );
  }
}
