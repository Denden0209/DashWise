export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { userId, folderId, daysBack = 90 } = await req.json();
    if (!userId || !folderId) return NextResponse.json({ error: "userId and folderId required" }, { status: 400 });

    const { getShopifyConnection, fetchOrders, fetchProducts, buildShopifyAnalytics, analyticsToText } = await import("@/lib/integrations/shopify");
    const conn = await getShopifyConnection(userId);
    if (!conn) return NextResponse.json({ error: "Shopify not connected" }, { status: 400 });

    const [orders, products] = await Promise.all([
      fetchOrders(conn.shopDomain, conn.accessToken, daysBack),
      fetchProducts(conn.shopDomain, conn.accessToken),
    ]);
    const analytics = buildShopifyAnalytics(orders, products, daysBack);
    const content   = analyticsToText(analytics, conn.shopName);

    const { addFileToFolder } = await import("@/lib/db");
    await addFileToFolder(userId, folderId, { name:`Shopify — ${analytics.period}.txt`, size:content.length, type:"txt", storagePath:"", downloadURL:"", parsedContent:content, sheets:[], rowCount:analytics.totalOrders, status:"ready" });

    return NextResponse.json({ success:true, shopName:conn.shopName, ordersCount:analytics.totalOrders, revenue:analytics.totalRevenue, period:analytics.period });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
