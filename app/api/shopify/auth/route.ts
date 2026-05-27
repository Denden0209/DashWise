import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { shopDomain, userId } = await req.json();
    if (!shopDomain) return NextResponse.json({ error: "Shop domain required" }, { status: 400 });

    const shop       = shopDomain.replace(/https?:\/\//,"").replace(/\//,"").trim();
    const fullDomain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
    const state      = `${userId}_${randomBytes(16).toString("hex")}`;

    const scopes = "read_orders,read_products,read_customers,read_inventory,read_analytics";
    const params = new URLSearchParams({
      client_id:    process.env.SHOPIFY_CLIENT_ID!,
      scope:        scopes,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/shopify/callback`,
      state,
    });
    const authURL = `https://${fullDomain}/admin/oauth/authorize?${params.toString()}`;
    return NextResponse.json({ authURL, state });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Auth failed" }, { status: 500 });
  }
}
