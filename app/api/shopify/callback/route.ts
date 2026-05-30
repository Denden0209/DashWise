export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code  = searchParams.get("code");
    const shop  = searchParams.get("shop");
    const state = searchParams.get("state");
    if (!code || !shop || !state) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=missing_params`);
    const userId = state.split("_")[0];
    if (!userId) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=invalid_state`);

    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ client_id:process.env.SHOPIFY_CLIENT_ID, client_secret:process.env.SHOPIFY_CLIENT_SECRET, code }),
    });
    if (!tokenRes.ok) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=shopify_auth_failed`);
    const { access_token } = await tokenRes.json();

    const shopRes  = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, { headers:{"X-Shopify-Access-Token":access_token} });
    const { shop: shopData } = await shopRes.json();

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}/integrations/shopify`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ fields:{ shopDomain:{stringValue:shop}, accessToken:{stringValue:access_token}, shopName:{stringValue:shopData.name||""}, shopEmail:{stringValue:shopData.email||""}, currency:{stringValue:shopData.currency||"USD"}, connectedAt:{timestampValue:new Date().toISOString()} } }),
    });

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?connected=shopify&shop=${encodeURIComponent(shopData.name||shop)}`);
  } catch (err: unknown) {
    console.error("[shopify/callback]", err);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=shopify_auth_failed`);
  }
}
