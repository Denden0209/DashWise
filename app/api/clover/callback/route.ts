export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code        = searchParams.get("code");
    const state       = searchParams.get("state");
    const merchant_id = searchParams.get("merchant_id");
    if (!code || !state) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=missing_params`);
    const userId = state.split("_")[0];
    if (!userId) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=invalid_state`);

    const tokenRes = await fetch("https://api.clover.com/oauth/v2/token", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ client_id:process.env.CLOVER_APP_ID, client_secret:process.env.CLOVER_APP_SECRET, code, grant_type:"authorization_code", redirect_uri:`${process.env.NEXT_PUBLIC_APP_URL}/api/clover/callback` }),
    });
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
    const { access_token, merchant_id: tokenMerchantId } = await tokenRes.json();
    const mid = merchant_id || tokenMerchantId;

    const mRes = await fetch(`https://api.clover.com/v3/merchants/${mid}`, { headers:{"Authorization":`Bearer ${access_token}`} });
    const merchant = mRes.ok ? await mRes.json() : { name:"My Clover Store" };

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}/integrations/clover`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ fields:{ merchantId:{stringValue:mid}, accessToken:{stringValue:access_token}, merchantName:{stringValue:merchant.name||"My Clover Store"}, currency:{stringValue:merchant.currency||"USD"}, environment:{stringValue:"production"}, connectedAt:{timestampValue:new Date().toISOString()} } }),
    });

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?connected=clover&merchant=${encodeURIComponent(merchant.name||"Clover Store")}`);
  } catch (err: unknown) {
    console.error("[clover/callback]", err);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=clover_auth_failed`);
  }
}
