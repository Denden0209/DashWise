// lib/firebaseAdmin.ts — server-side Firestore access (Admin SDK).
// API routes run with NO user auth context, so the client SDK's reads/writes
// get rejected by firestore.rules. The Admin SDK bypasses rules using a
// service account. Server routes must do their own authorization checks.
//
// Required env (Vercel + .env.local):
//   FIREBASE_SERVICE_ACCOUNT — the full service-account JSON, either raw or
//   base64-encoded. Firebase console → Project settings → Service accounts →
//   "Generate new private key".

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function loadCredentials(): { projectId: string; clientEmail: string; privateKey: string } {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");
  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const sa = JSON.parse(json) as { project_id: string; client_email: string; private_key: string };
  return {
    projectId: sa.project_id,
    clientEmail: sa.client_email,
    privateKey: sa.private_key.replace(/\\n/g, "\n"),
  };
}

let app: App | null = null;

export function adminDb(): Firestore {
  if (!app) {
    app = getApps()[0] ?? initializeApp({ credential: cert(loadCredentials()) });
  }
  return getFirestore(app);
}
