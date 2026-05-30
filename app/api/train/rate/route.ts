export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { uid, userMessage, assistantReply, rating, bizType } = await req.json();
    if (!uid || !userMessage || !assistantReply || !rating)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
    const { db } = await import("@/lib/firebase");
    await addDoc(collection(db, "training_examples"), { uid, userMessage:userMessage.slice(0,2000), assistantReply:assistantReply.slice(0,4000), rating, bizType:bizType||"unknown", createdAt:serverTimestamp(), usedInTraining:false });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
