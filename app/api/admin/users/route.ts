export const dynamic     = "force-dynamic";
export const runtime     = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";

// ── Server-side admin verification ─────────────────────────
async function verifyAdmin(req: NextRequest): Promise<{ ok: boolean; error?: string }> {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!adminEmail) return { ok: false, error: "Admin not configured (NEXT_PUBLIC_ADMIN_EMAIL missing)" };

  const authHeader = req.headers.get("authorization") || "";
  const idToken    = authHeader.replace("Bearer ", "").trim();
  if (!idToken) return { ok: false, error: "Missing auth token" };

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ idToken }) }
  );
  if (!res.ok) return { ok: false, error: "Invalid token" };

  const data  = await res.json() as { users?: { email?: string }[] };
  const email = data.users?.[0]?.email || "";
  if (email.toLowerCase() !== adminEmail.toLowerCase())
    return { ok: false, error: "Not authorized" };
  return { ok: true };
}

// ── GET: list all users with enriched stats ─────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  try {
    const { collection, getDocs, query, orderBy } = await import("firebase/firestore");
    const { db } = await import("@/lib/firebase");

    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));

    const users = await Promise.all(snap.docs.map(async d => {
      const u = d.data();

      // Folder count + per-folder file/analysis stats
      let folderCount = 0, fileCount = 0, analysisCount = 0, totalRows = 0;
      try {
        const fSnap = await getDocs(collection(db, "users", d.id, "folders"));
        folderCount = fSnap.size;
        for (const fd of fSnap.docs) {
          const fData = fd.data();
          if (fData.lastAnalysisSummary) analysisCount++;
          try {
            const fiSnap = await getDocs(collection(db, "users", d.id, "folders", fd.id, "files"));
            fileCount += fiSnap.size;
            for (const fi of fiSnap.docs) totalRows += fi.data().rowCount || 0;
          } catch {}
        }
      } catch {}

      return {
        uid:           d.id,
        email:         u.email         || "",
        name:          u.name          || "",
        bizName:       u.bizName       || "",
        bizType:       u.bizType       || "",
        goals:         u.goals         || [],
        advisorTone:   u.advisorTone   || "",
        subscription:  u.subscription  || "free",
        uploadsCount:  u.uploadsCount  || 0,
        folderCount,
        fileCount,
        analysisCount,
        totalRows,
        createdAt:     u.createdAt?.toDate?.()?.toISOString?.()    || null,
        lastAnalyzedAt: u.lastAnalyzedAt?.toDate?.()?.toISOString?.() || null,
      };
    }));

    // Compute aggregate metrics for the dashboard
    const planCounts: Record<string, number> = { free:0, pro:0, team:0, business:0 };
    let totalUploads = 0, totalAnalyses = 0, totalFilesAll = 0;
    for (const u of users) {
      planCounts[u.subscription] = (planCounts[u.subscription] || 0) + 1;
      totalUploads  += u.uploadsCount;
      totalAnalyses += u.analysisCount;
      totalFilesAll += u.fileCount;
    }

    const estMonthlyRevenue =
      (planCounts.pro || 0) * 29 + (planCounts.team || 0) * 199 + (planCounts.business || 0) * 799;

    return NextResponse.json({
      success: true, users, total: users.length,
      metrics: { planCounts, totalUploads, totalAnalyses, totalFilesAll, estMonthlyRevenue },
    });
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
    const { uid, subscription, name, notes } = await req.json() as {
      uid: string; subscription?: string; name?: string; notes?: string;
    };
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

    const VALID = ["free", "pro", "team", "business"];
    if (subscription && !VALID.includes(subscription))
      return NextResponse.json({ error: `subscription must be one of: ${VALID.join(", ")}` }, { status: 400 });

    const { doc, updateDoc } = await import("firebase/firestore");
    const { db } = await import("@/lib/firebase");

    const updates: Record<string, unknown> = {};
    if (subscription) updates.subscription = subscription;
    if (name !== undefined) updates.name = name;
    if (notes !== undefined) updates.adminNotes = notes;

    await updateDoc(doc(db, "users", uid), updates);
    return NextResponse.json({ success: true, uid, ...updates });
  } catch (err: unknown) {
    console.error("[admin/users PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update user" },
      { status: 500 }
    );
  }
}

// ── DELETE: disable/flag a user account ─────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  try {
    const { uid } = await req.json() as { uid: string };
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

    const { doc, updateDoc } = await import("firebase/firestore");
    const { db } = await import("@/lib/firebase");
    // We flag rather than hard-delete — preserve data, block access
    await updateDoc(doc(db, "users", uid), { disabled: true, disabledAt: new Date().toISOString() });
    return NextResponse.json({ success: true, uid, disabled: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disable user" },
      { status: 500 }
    );
  }
}
