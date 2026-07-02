export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";

// Shopify signs every callback with an HMAC of the query string (minus the
// hmac param itself), keyed by the app's client secret. Verifying it is what
// proves the redirect actually came from Shopify — and it's required for app
// review when distributing beyond a dev store.
function verifyHmac(searchParams: URLSearchParams, secret: string): boolean {
  const hmac = searchParams.get("hmac");
  if (!hmac) return false;
  const message = [...searchParams.entries()]
    .filter(([k]) => k !== "hmac")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    const { searchParams } = new URL(req.url);
    const code  = searchParams.get("code");
    const shop  = searchParams.get("shop");
    const state = searchParams.get("state");
    if (!code || !shop || !state) return NextResponse.redirect(`${appUrl}/integrations?error=missing_params`);

    // Only accept real *.myshopify.com domains (prevents token exchange with an attacker host).
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
      return NextResponse.redirect(`${appUrl}/integrations?error=invalid_state`);
    }
    if (!verifyHmac(searchParams, process.env.SHOPIFY_CLIENT_SECRET || "")) {
      return NextResponse.redirect(`${appUrl}/integrations?error=invalid_state`);
    }
    const userId = state.split("_")[0];
    if (!userId) return NextResponse.redirect(`${appUrl}/integrations?error=invalid_state`);

    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ client_id:process.env.SHOPIFY_CLIENT_ID, client_secret:process.env.SHOPIFY_CLIENT_SECRET, code }),
    });
    if (!tokenRes.ok) return NextResponse.redirect(`${appUrl}/integrations?error=shopify_auth_failed`);
    const { access_token, scope } = await tokenRes.json() as { access_token:string; scope?:string };

    const shopRes  = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, { headers:{"X-Shopify-Access-Token":access_token} });
    const { shop: shopData } = await shopRes.json();

    await adminDb().doc(`users/${userId}/integrations/shopify`).set({
      shopDomain:  shop,
      accessToken: access_token,
      shopName:    shopData?.name || "",
      shopEmail:   shopData?.email || "",
      currency:    shopData?.currency || "USD",
      scopes:      (scope || "").split(",").filter(Boolean),
      connectedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.redirect(`${appUrl}/integrations?connected=shopify&shop=${encodeURIComponent(shopData?.name||shop)}`);
  } catch (err: unknown) {
    console.error("[shopify/callback]", err);
    return NextResponse.redirect(`${appUrl}/integrations?error=shopify_auth_failed`);
  }
}
