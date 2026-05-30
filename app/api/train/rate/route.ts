// app/api/train/rate/route.ts
// Saves a rated conversation pair as a fine-tuning training example.
// Called when user clicks 👍 or 👎 on an advisor response.

import { NextRequest, NextResponse } from "next/server";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { uid, userMessage, assistantReply, rating, bizType } = await req.json();
    if (!uid || !userMessage || !assistantReply || !rating)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    await addDoc(collection(db, "training_examples"), {
      uid,
      userMessage:    userMessage.slice(0, 2000),
      assistantReply: assistantReply.slice(0, 4000),
      rating,
      bizType:        bizType || "unknown",
      createdAt:      serverTimestamp(),
      usedInTraining: false,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[train/rate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
