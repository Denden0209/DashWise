export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { userId, folderId, daysBack = 90 } = await req.json();
    if (!userId || !folderId) return NextResponse.json({ error: "userId and folderId required" }, { status: 400 });

    const { getCloverConnection, fetchCloverOrders, fetchCloverItems, buildCloverAnalytics, cloverAnalyticsToText } = await import("@/lib/integrations/clover");
    const conn = await getCloverConnection(userId);
    if (!conn) return NextResponse.json({ error: "Clover not connected" }, { status: 400 });

    const [orders] = await Promise.all([
      fetchCloverOrders(conn.merchantId, conn.accessToken, daysBack, conn.environment),
      fetchCloverItems(conn.merchantId, conn.accessToken, conn.environment),
    ]);
    const analytics = buildCloverAnalytics(orders, daysBack);
    const content   = cloverAnalyticsToText(analytics, conn.merchantName);

    const { addFileToFolder } = await import("@/lib/db");
    await addFileToFolder(userId, folderId, { name:`Clover POS — ${analytics.period}.txt`, size:content.length, type:"txt", storagePath:"", downloadURL:"", parsedContent:content, sheets:[], rowCount:analytics.totalOrders, status:"ready" });

    return NextResponse.json({ success:true, merchantName:conn.merchantName, ordersCount:analytics.totalOrders, revenue:analytics.totalRevenue, period:analytics.period });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
