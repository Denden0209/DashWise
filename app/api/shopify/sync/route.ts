import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { userId, folderId, daysBack = 90 } = await req.json();
    if (!userId || !folderId) return NextResponse.json({ error: "userId and folderId required" }, { status: 400 });

    const { getShopifyConnection, fetchOrders, fetchProducts, buildShopifyAnalytics, analyticsToText } = await import("@/lib/integrations/shopify");
    const connection = await getShopifyConnection(userId);
    if (!connection) return NextResponse.json({ error: "Shopify not connected" }, { status: 400 });

    const { shopDomain, accessToken, shopName } = connection;
    const [orders, products] = await Promise.all([
      fetchOrders(shopDomain, accessToken, daysBack),
      fetchProducts(shopDomain, accessToken),
    ]);

    const analytics = buildShopifyAnalytics(orders, products, daysBack);
    const content   = analyticsToText(analytics, shopName);

    const { addFileToFolder } = await import("@/lib/db");
    await addFileToFolder(userId, folderId, {
      name:          `Shopify — ${analytics.period}.txt`,
      size:          content.length,
      type:          "txt",
      storagePath:   "",
      downloadURL:   "",
      parsedContent: content,
      sheets:        [],
      rowCount:      analytics.totalOrders,
      status:        "ready",
    });

    return NextResponse.json({
      success:     true,
      shopName,
      ordersCount: analytics.totalOrders,
      revenue:     analytics.totalRevenue,
      period:      analytics.period,
    });
  } catch (err: unknown) {
    console.error("[shopify/sync]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
