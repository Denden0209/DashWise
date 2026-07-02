export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";

// Verifies the caller's Firebase ID token and returns their uid — server
// routes have no client auth context, so without this anyone could sync (and
// read the analytics of) any userId they pass in the body.
async function verifyUser(req: NextRequest): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const idToken = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!apiKey || !idToken) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { users?: { localId?: string }[] };
    return data.users?.[0]?.localId || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, folderId, daysBack = 90 } = await req.json();
    if (!userId || !folderId) return NextResponse.json({ error: "userId and folderId required" }, { status: 400 });

    const authedUid = await verifyUser(req);
    if (!authedUid || authedUid !== userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = adminDb();
    const connSnap = await db.doc(`users/${userId}/integrations/shopify`).get();
    if (!connSnap.exists) return NextResponse.json({ error: "Shopify not connected" }, { status: 400 });
    const conn = connSnap.data() as { shopDomain:string; accessToken:string; shopName:string };

    const { fetchOrders, fetchProducts, buildShopifyAnalytics, analyticsToText } = await import("@/lib/integrations/shopify");
    const [orders, products] = await Promise.all([
      fetchOrders(conn.shopDomain, conn.accessToken, daysBack),
      fetchProducts(conn.shopDomain, conn.accessToken),
    ]);
    const analytics = buildShopifyAnalytics(orders, products, daysBack);
    const content   = analyticsToText(analytics, conn.shopName);

    const folderRef = db.doc(`users/${userId}/folders/${folderId}`);
    await folderRef.collection("files").add({
      name:`Shopify — ${analytics.period}.txt`, size:content.length, type:"txt",
      storagePath:"", downloadURL:"", parsedContent:content, sheets:[],
      rowCount:analytics.totalOrders, status:"ready",
      uploadedAt: FieldValue.serverTimestamp(),
    });
    await folderRef.update({ fileCount: FieldValue.increment(1) });

    await db.doc(`users/${userId}/integrations/shopify`).set({ lastSyncAt: FieldValue.serverTimestamp() }, { merge: true });

    return NextResponse.json({ success:true, shopName:conn.shopName, ordersCount:analytics.totalOrders, revenue:analytics.totalRevenue, period:analytics.period });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
