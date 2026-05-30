export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { userId, environment = "production" } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const state  = `${userId}_${randomBytes(16).toString("hex")}`;
    const base   = environment === "sandbox" ? "https://sandbox.dev.clover.com" : "https://api.clover.com";
    const params = new URLSearchParams({
      client_id:     process.env.CLOVER_APP_ID!,
      redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/clover/callback`,
      state,
      response_type: "code",
    });
    const authURL = `${base}/oauth/v2/authorize?${params.toString()}`;

    return NextResponse.json({ authURL, state });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Auth failed" }, { status: 500 });
  }
}
