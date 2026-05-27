// lib/db.ts
// ─────────────────────────────────────────────────────────
// Every function that reads or writes to Firestore lives here.
// The app never talks to Firebase directly — always through these functions.
// ─────────────────────────────────────────────────────────

import {
  doc,
  setDoc,
  getDoc,
  addDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
  increment,
} from "firebase/firestore";
import { db } from "./firebase";

// ── Types ──────────────────────────────────────────────────────────────────

export type BusinessProfile = {
  uid:           string;
  name:          string;
  email:         string;
  role:          string;
  bizName:       string;
  bizType:       string;
  primaryTool:   string;
  employees:     string;
  goals:         string[];
  advisorTone:   string;
  subscription:  "free" | "pro" | "team" | "business";
  uploadsCount:  number;
  createdAt?:    unknown;
};

export type UploadRecord = {
  id?:            string;
  date?:          unknown;
  label:          string;
  source:         string;
  dataType:       string;
  period:         string;
  metrics:        Record<string, unknown>;
  topMetrics:     { label: string; value: string; trend: string }[];
  summary:        string;
  insights:       { title: string; finding: string; action: string; priority: string }[];
  warnings:       string[];
  fieldsDetected: string[];
  quality:        string;
};

export type ChatMessage = {
  id?:        string;
  role:       "user" | "assistant";
  content:    string;
  timestamp?: unknown;
  type?:      string;
};

// ── User / Profile ─────────────────────────────────────────────────────────

/**
 * saveUserProfile
 * Creates or updates the user document in Firestore.
 * Called after the 3-step onboarding completes.
 * Path: users/{userId}
 */
export async function saveUserProfile(
  uid: string,
  profile: Partial<BusinessProfile>
): Promise<void> {
  await setDoc(
    doc(db, "users", uid),
    {
      ...profile,
      subscription: "free",
      uploadsCount:  0,
      createdAt:     serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * getUserProfile
 * Fetches the business profile for a logged-in user.
 * Returns null if the user has not completed onboarding yet.
 *
 * Retries up to 3 times with increasing delays.
 * This handles the "client is offline" error that can appear
 * right after login before Firestore finishes connecting.
 */
export async function getUserProfile(
  uid: string
): Promise<BusinessProfile | null> {
  const MAX_RETRIES = 3;
  const WAIT_MS     = 800;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      return snap.exists() ? (snap.data() as BusinessProfile) : null;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      const isOffline =
        message.includes("client is offline") ||
        message.includes("Failed to get document") ||
        message.includes("unavailable");

      if (isOffline && attempt < MAX_RETRIES) {
        console.warn(
          `[DashWise] Firestore offline — retrying ${attempt}/${MAX_RETRIES}...`
        );
        await new Promise((res) => setTimeout(res, WAIT_MS * attempt));
        continue;
      }

      console.error("[DashWise] getUserProfile failed:", err);
      return null;
    }
  }

  return null;
}

/**
 * updateUserProfile
 * Partially updates a user profile — used on the Settings page.
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<BusinessProfile>
): Promise<void> {
  await updateDoc(doc(db, "users", uid), updates);
}

// ── Uploads ────────────────────────────────────────────────────────────────

/**
 * saveUpload
 * Saves a completed AI analysis to Firestore and increments the upload counter.
 * Path: users/{userId}/uploads/{auto-id}
 */
export async function saveUpload(
  uid: string,
  upload: UploadRecord
): Promise<string> {
  const ref = await addDoc(
    collection(db, "users", uid, "uploads"),
    { ...upload, date: serverTimestamp() }
  );
  await updateDoc(doc(db, "users", uid), {
    uploadsCount: increment(1),
  });
  return ref.id;
}

/**
 * getRecentUploads
 * Returns the most recent N uploads — used to build the AI business memory context.
 */
export async function getRecentUploads(
  uid: string,
  limitN = 8
): Promise<UploadRecord[]> {
  const q = query(
    collection(db, "users", uid, "uploads"),
    orderBy("date", "desc"),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as UploadRecord));
}

/**
 * getAllUploads
 * Returns all uploads for the history page timeline, newest first.
 */
export async function getAllUploads(uid: string): Promise<UploadRecord[]> {
  const q = query(
    collection(db, "users", uid, "uploads"),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as UploadRecord));
}

// ── Chat History ───────────────────────────────────────────────────────────

/**
 * saveChatMessage
 * Saves a single chat message (user or assistant) to Firestore.
 * Path: users/{userId}/chats/{auto-id}
 */
export async function saveChatMessage(
  uid: string,
  message: ChatMessage
): Promise<void> {
  await addDoc(collection(db, "users", uid, "chats"), {
    ...message,
    timestamp: serverTimestamp(),
  });
}

/**
 * getRecentChats
 * Returns the last N messages in chronological order.
 * Used by the chat API to inject conversation history into Claude's context.
 */
export async function getRecentChats(
  uid: string,
  limitN = 30
): Promise<ChatMessage[]> {
  const q = query(
    collection(db, "users", uid, "chats"),
    orderBy("timestamp", "desc"),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ChatMessage))
    .reverse();
}

// ── Usage / Subscription ───────────────────────────────────────────────────

/**
 * checkUsageLimit
 * Returns true if the user is allowed to run another analysis.
 * Free tier: 5 lifetime analyses.
 * Pro and above: unlimited.
 */
export async function checkUsageLimit(uid: string): Promise<boolean> {
  const profile = await getUserProfile(uid);
  if (!profile) return false;
  if (profile.subscription !== "free") return true;
  return profile.uploadsCount < 5;
}

// ── File Folders ───────────────────────────────────────────────────────────
// Each user gets one folder per business. Files live inside folders.
// Firestore path: users/{userId}/folders/{folderId}/files/{fileId}

export type FolderFile = {
  id?:          string;
  name:         string;          // original file name
  size:         number;          // bytes
  type:         string;          // csv / excel / pdf / txt / json
  storagePath:  string;          // Firebase Storage path
  downloadURL:  string;          // public download URL
  parsedContent?: string;        // extracted text (set after parsing)
  sheets?:      string[];        // sheet names for Excel files
  rowCount?:    number;
  uploadedAt?:  unknown;
  status:       "uploading" | "ready" | "error";
};

export type BusinessFolder = {
  id?:         string;
  bizName:     string;           // folder display name
  bizType:     string;
  createdAt?:  unknown;
  fileCount:   number;
  lastAnalyzedAt?: unknown;
  lastAnalysisSummary?: string;
};

/**
 * createFolder
 * Creates a business folder for the user.
 * One folder per business — reuse if already exists.
 */
export async function createFolder(uid: string, folder: Omit<BusinessFolder, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "users", uid, "folders"), {
    ...folder,
    fileCount: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * getUserFolders
 * Returns all folders for a user — shown on the Files page.
 */
export async function getUserFolders(uid: string): Promise<BusinessFolder[]> {
  const q = query(collection(db, "users", uid, "folders"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BusinessFolder));
}

/**
 * addFileToFolder
 * Saves a file record inside a folder after upload.
 */
export async function addFileToFolder(uid: string, folderId: string, file: Omit<FolderFile, "id">): Promise<string> {
  const ref = await addDoc(
    collection(db, "users", uid, "folders", folderId, "files"),
    { ...file, uploadedAt: serverTimestamp() }
  );
  // Increment folder file count
  await updateDoc(doc(db, "users", uid, "folders", folderId), {
    fileCount: increment(1),
  });
  return ref.id;
}

/**
 * getFolderFiles
 * Returns all files inside a folder.
 */
export async function getFolderFiles(uid: string, folderId: string): Promise<FolderFile[]> {
  const q = query(
    collection(db, "users", uid, "folders", folderId, "files"),
    orderBy("uploadedAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as FolderFile));
}

/**
 * updateFileRecord
 * Updates a file record after parsing completes.
 */
export async function updateFileRecord(
  uid: string,
  folderId: string,
  fileId: string,
  updates: Partial<FolderFile>
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "folders", folderId, "files", fileId), updates);
}

/**
 * saveFolderAnalysis
 * Saves the consolidated AI analysis result back to the folder.
 */
export async function saveFolderAnalysis(
  uid: string,
  folderId: string,
  summary: string
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "folders", folderId), {
    lastAnalyzedAt:      serverTimestamp(),
    lastAnalysisSummary: summary,
  });
}

// ── Cross-folder business intelligence ────────────────────────────────────

/**
 * getAllBusinessData
 * Fetches ALL folders and ALL files across the entire account.
 * Used by the advisor to understand the full business picture.
 * Returns a consolidated summary ready to inject into Claude's context.
 */
export async function getAllBusinessData(uid: string): Promise<{
  folderCount:  number;
  fileCount:    number;
  folderSummaries: {
    folderName:  string;
    fileNames:   string[];
    fileTypes:   string[];
    parsedContent: string;
    lastAnalysis: string;
  }[];
}> {
  const folders = await getUserFolders(uid);
  const folderSummaries = [];

  for (const folder of folders) {
    const files    = await getFolderFiles(uid, folder.id!);
    const ready    = files.filter(f => f.status === "ready");

    // Combine parsed content from all files in this folder
    const combinedContent = ready
      .map(f => `[${f.name}]: ${(f.parsedContent || "").slice(0, 1500)}`)
      .join("\n\n");

    folderSummaries.push({
      folderName:    folder.bizName,
      fileNames:     files.map(f => f.name),
      fileTypes:     [...new Set(files.map(f => f.type))],
      parsedContent: combinedContent,
      lastAnalysis:  folder.lastAnalysisSummary || "",
    });
  }

  return {
    folderCount:  folders.length,
    fileCount:    folders.reduce((s, f) => s + f.fileCount, 0),
    folderSummaries,
  };
}
