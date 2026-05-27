import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code  = searchParams.get("code");
    const shop  = searchParams.get("shop");
    const state = searchParams.get("state");

    if (!code || !shop || !state) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=missing_params`);
    }

    const userId = state.split("_")[0];
    if (!userId) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=invalid_state`);
    }

    // Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id:     process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });
    if (!tokenRes.ok) throw new Error("Token exchange failed");
    const { access_token } = await tokenRes.json();

    // Get shop info
    const shopRes  = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": access_token },
    });
    const { shop: shopData } = await shopRes.json();

    // Save to Firestore using firebase-admin or client
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore }                  = await import("firebase-admin/firestore");

    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId:   process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });
    }

    const adminDb = getFirestore();
    await adminDb.doc(`users/${userId}/integrations/shopify`).set({
      shopDomain:  shop,
      accessToken: access_token,
      shopName:    shopData.name,
      shopEmail:   shopData.email,
      currency:    shopData.currency,
      connectedAt: new Date(),
      scopes:      ["read_orders","read_products","read_customers","read_inventory","read_analytics"],
    }, { merge: true });

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?connected=shopify&shop=${encodeURIComponent(shopData.name)}`
    );
  } catch (err: unknown) {
    console.error("[shopify/callback]", err);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=shopify_auth_failed`);
  }
}
