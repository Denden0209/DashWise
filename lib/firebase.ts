// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableNetwork } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Only initialize if config is present (prevents build-time errors)
const hasConfig = !!firebaseConfig.apiKey && !!firebaseConfig.projectId;

const app = hasConfig
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())
  : (getApps().length === 0 ? initializeApp({ apiKey:"placeholder", projectId:"placeholder", appId:"placeholder" }) : getApp());

export const auth = getAuth(app);
export const db   = getFirestore(app);

// Enable network only in browser
if (typeof window !== "undefined" && hasConfig) {
  enableNetwork(db).catch(() => {});
}

export default app;
