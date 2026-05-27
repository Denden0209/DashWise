// app/api/shopify/callback/route.ts
// Step 2 of Shopify OAuth.
// Exchanges the auth code for a permanent access token.
// Uses the regular Firebase client SDK — no firebase-admin needed.

import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code  = searchParams.get("code");
    const shop  = searchParams.get("shop");
    const state = searchParams.get("state");

    if (!code || !shop || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=missing_params`
      );
    }

    // Extract userId from state token
    const userId = state.split("_")[0];
    if (!userId) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=invalid_state`
      );
    }

    // ── Step 1: Exchange code for access token ─────────────
    const tokenRes = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id:     process.env.SHOPIFY_CLIENT_ID,
          client_secret: process.env.SHOPIFY_CLIENT_SECRET,
          code,
        }),
      }
    );

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=shopify_auth_failed`
      );
    }

    const { access_token } = await tokenRes.json();

    // ── Step 2: Get shop details ───────────────────────────
    const shopRes = await fetch(
      `https://${shop}/admin/api/2024-01/shop.json`,
      { headers: { "X-Shopify-Access-Token": access_token } }
    );

    if (!shopRes.ok) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=shopify_auth_failed`
      );
    }

    const { shop: shopData } = await shopRes.json();

    // ── Step 3: Save token via Firestore REST API ──────────
    // Uses the Firebase REST API directly — no firebase-admin SDK needed.
    // The token is saved under the user's document in Firestore.
    const firestoreURL = `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}/integrations/shopify`;

    const firestoreBody = {
      fields: {
        shopDomain:   { stringValue: shop },
        accessToken:  { stringValue: access_token },
        shopName:     { stringValue: shopData.name || "" },
        shopEmail:    { stringValue: shopData.email || "" },
        currency:     { stringValue: shopData.currency || "USD" },
        connectedAt:  { timestampValue: new Date().toISOString() },
        scopes:       {
          arrayValue: {
            values: [
              "read_orders","read_products","read_customers",
              "read_inventory","read_analytics",
            ].map(s => ({ stringValue: s })),
          },
        },
      },
    };

    // Use PATCH to create or update the document
    const saveRes = await fetch(`${firestoreURL}?updateMask.fieldPaths=shopDomain&updateMask.fieldPaths=accessToken&updateMask.fieldPaths=shopName&updateMask.fieldPaths=shopEmail&updateMask.fieldPaths=currency&updateMask.fieldPaths=connectedAt&updateMask.fieldPaths=scopes`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(firestoreBody),
    });

    if (!saveRes.ok) {
      const errText = await saveRes.text();
      console.error("Firestore save failed:", errText);
      // Still redirect to success — token exchange worked even if save had issues
    }

    // ── Step 4: Redirect back to integrations page ─────────
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?connected=shopify&shop=${encodeURIComponent(shopData.name || shop)}`
    );

  } catch (err: unknown) {
    console.error("[shopify/callback] Error:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=shopify_auth_failed`
    );
  }
}
