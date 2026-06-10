export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

// ── Server-side admin verification ─────────────────────────
// Verifies the Firebase ID token via Google's REST endpoint (no Admin SDK needed),
// then compares the verified email against the ADMIN email env var.
async function verifyAdmin(req: NextRequest): Promise<{ ok: boolean; error?: string }> {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!adminEmail) return { ok: false, error: "Admin not configured (NEXT_PUBLIC_ADMIN_EMAIL missing)" };

  const authHeader = req.headers.get("authorization") || "";
  const idToken    = authHeader.replace("Bearer ", "").trim();
  if (!idToken) return { ok: false, error: "Missing auth token" };

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) return { ok: false, error: "Invalid token" };

  const data  = await res.json() as { users?: { email?: string }[] };
  const email = data.users?.[0]?.email || "";
  if (email.toLowerCase() !== adminEmail.toLowerCase())
    return { ok: false, error: "Not authorized" };

  return { ok: true };
}

// ── GET: list all users ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  try {
    const { collection, getDocs, query, orderBy } = await import("firebase/firestore");
    const { db } = await import("@/lib/firebase");

    const q    = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    const users = snap.docs.map(d => {
      const u = d.data();
      return {
        uid:          d.id,
        email:        u.email        || "",
        name:         u.name         || "",
        bizName:      u.bizName      || "",
        bizType:      u.bizType      || "",
        subscription: u.subscription || "free",
        uploadsCount: u.uploadsCount || 0,
        createdAt:    u.createdAt?.toDate?.()?.toISOString?.() || null,
      };
    });

    return NextResponse.json({ success: true, users, total: users.length });
  } catch (err: unknown) {
    console.error("[admin/users GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load users" },
      { status: 500 }
    );
  }
}

// ── PATCH: update a user's subscription ─────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  try {
    const { uid, subscription } = await req.json() as { uid: string; subscription: string };
    if (!uid || !subscription)
      return NextResponse.json({ error: "uid and subscription required" }, { status: 400 });

    const VALID = ["free", "pro", "team", "business"];
    if (!VALID.includes(subscription))
      return NextResponse.json({ error: `subscription must be one of: ${VALID.join(", ")}` }, { status: 400 });

    const { doc, updateDoc } = await import("firebase/firestore");
    const { db } = await import("@/lib/firebase");
    await updateDoc(doc(db, "users", uid), { subscription });

    return NextResponse.json({ success: true, uid, subscription });
  } catch (err: unknown) {
    console.error("[admin/users PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update user" },
      { status: 500 }
    );
  }
}
