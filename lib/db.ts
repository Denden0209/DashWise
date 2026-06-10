// lib/db.ts — All Firestore operations
import {
  doc, getDoc, setDoc, addDoc, updateDoc, collection,
  query, orderBy, limit, getDocs, serverTimestamp, increment,
} from "firebase/firestore";
import { db } from "./firebase";

// ── Types ──────────────────────────────────────────────────
export type BusinessProfile = {
  uid:           string;
  name:          string;
  email?:        string;
  role?:         string;
  bizName:       string;
  bizType:       string;
  primaryTool?:  string;
  employees?:    string;
  goals?:        string[];
  advisorTone?:  string;
  subscription?: string;
  uploadsCount?: number;
  createdAt?:    unknown;
  orgId?:        string;
};

export type UploadRecord = {
  id?:          string;
  label:        string;
  source:       string;
  dataType:     string;
  period:       string;
  metrics?:     unknown;
  topMetrics?:  string[];
  summary?:     string;
  insights?:    string[];
  warnings?:    string[];
  fieldsDetected?: string[];
  quality?:     string;
  date?:        unknown;
};

export type BusinessFolder = {
  id?:                  string;
  bizName:              string;
  bizType?:             string;
  fileCount:            number;
  lastAnalyzedAt?:      unknown;
  lastAnalysisSummary?: string;
  lastAnalysisFull?:    string;
  createdAt?:           unknown;
};

export type FolderFile = {
  id?:            string;
  name:           string;
  size:           number;
  type:           string;
  storagePath?:   string;
  downloadURL?:   string;
  parsedContent?: string;
  sheets?:        string[];
  rowCount?:      number;
  status:         string;
  uploadedAt?:    unknown;
};

export type ChatMessage = {
  id?:        string;
  role:       "user" | "assistant";
  content:    string;
  type?:      string;
  timestamp?: unknown;
};

export type FullAnalysis = {
  analysis:      string;
  dashboardData: unknown;
  mode:          string;
  fileNames:     string[];
  analyzedAt?:   string;
};

// ── Profile ────────────────────────────────────────────────
export async function getUserProfile(uid: string): Promise<BusinessProfile | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      return snap.exists() ? (snap.data() as BusinessProfile) : null;
    } catch {
      if (i === 2) return null;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  return null;
}

export async function saveUserProfile(uid: string, data: Partial<BusinessProfile>): Promise<void> {
  await setDoc(doc(db, "users", uid), { ...data, uid, createdAt: serverTimestamp() }, { merge: true });
}

export async function updateUserProfile(uid: string, data: Partial<BusinessProfile>): Promise<void> {
  await updateDoc(doc(db, "users", uid), data);
}

// ── Folders ────────────────────────────────────────────────
export async function createFolder(uid: string, bizName: string, bizType?: string): Promise<string> {
  const ref = await addDoc(collection(db, "users", uid, "folders"), {
    bizName, bizType: bizType || "", fileCount: 0, createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getUserFolders(uid: string): Promise<BusinessFolder[]> {
  const q    = query(collection(db, "users", uid, "folders"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BusinessFolder));
}

export async function saveFolderAnalysis(uid: string, folderId: string, summary: string): Promise<void> {
  await updateDoc(doc(db, "users", uid, "folders", folderId), {
    lastAnalysisSummary: summary,
    lastAnalyzedAt:      serverTimestamp(),
  });
}

// Save complete analysis (dashboard JSON + narrative) so it survives navigation
export async function saveFolderFullAnalysis(uid: string, folderId: string, data: FullAnalysis): Promise<void> {
  const summary = (data.dashboardData as { summary?: string })?.summary || "";
  await updateDoc(doc(db, "users", uid, "folders", folderId), {
    lastAnalysisFull:    JSON.stringify({ ...data, analyzedAt: new Date().toISOString() }),
    lastAnalysisSummary: summary.slice(0, 300),
    lastAnalyzedAt:      serverTimestamp(),
  });
}

// Load last full analysis for a folder (returns null if never analyzed)
export async function getFolderFullAnalysis(uid: string, folderId: string): Promise<FullAnalysis | null> {
  const snap = await getDoc(doc(db, "users", uid, "folders", folderId));
  if (!snap.exists()) return null;
  const raw = snap.data().lastAnalysisFull;
  if (!raw) return null;
  try { return JSON.parse(raw) as FullAnalysis; } catch { return null; }
}

// ── Files ──────────────────────────────────────────────────
export async function addFileToFolder(uid: string, folderId: string, file: Omit<FolderFile, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "users", uid, "folders", folderId, "files"), {
    ...file, uploadedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "users", uid, "folders", folderId), { fileCount: increment(1) });
  return ref.id;
}

export async function getFolderFiles(uid: string, folderId: string): Promise<FolderFile[]> {
  const q    = query(collection(db, "users", uid, "folders", folderId, "files"), orderBy("uploadedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as FolderFile));
}

export async function updateFileRecord(uid: string, folderId: string, fileId: string, data: Partial<FolderFile>): Promise<void> {
  await updateDoc(doc(db, "users", uid, "folders", folderId, "files", fileId), data);
}

// ── Uploads (legacy) ───────────────────────────────────────
export async function saveUpload(uid: string, data: Omit<UploadRecord, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "users", uid, "uploads"), { ...data, date: serverTimestamp() });
  await updateDoc(doc(db, "users", uid), { uploadsCount: increment(1) }).catch(() => {});
  return ref.id;
}

export async function getAllUploads(uid: string): Promise<UploadRecord[]> {
  const q    = query(collection(db, "users", uid, "uploads"), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as UploadRecord));
}

export async function getRecentUploads(uid: string, n = 10): Promise<UploadRecord[]> {
  const q    = query(collection(db, "users", uid, "uploads"), orderBy("date", "desc"), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as UploadRecord));
}

// ── Chat ───────────────────────────────────────────────────
export async function saveChatMessage(uid: string, msg: Omit<ChatMessage, "id">): Promise<void> {
  await addDoc(collection(db, "users", uid, "chats"), { ...msg, timestamp: serverTimestamp() });
}

export async function getRecentChats(uid: string, n = 30): Promise<ChatMessage[]> {
  const q    = query(collection(db, "users", uid, "chats"), orderBy("timestamp", "asc"), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
}

// ── Full business data (all folders, full content) ────────
export async function getAllBusinessData(uid: string): Promise<{
  folderCount:     number;
  fileCount:       number;
  totalDataSize:   number;
  folderSummaries: {
    folderId:      string;
    folderName:    string;
    fileNames:     string[];
    fileTypes:     string[];
    fileCount:     number;
    readyCount:    number;
    parsedContent: string;
    lastAnalysis:  string;
  }[];
}> {
  const folders   = await getUserFolders(uid);
  const summaries = [];
  let   totalSize = 0;

  for (const folder of folders) {
    const files = await getFolderFiles(uid, folder.id!);
    const ready = files.filter(f => f.status === "ready" && f.parsedContent);

    const combined = ready.map(f => {
      const content = f.parsedContent || "";
      totalSize    += content.length;
      return [
        `┌─── FILE: ${f.name} (${f.type.toUpperCase()}) ───`,
        f.rowCount ? `│ Rows: ${f.rowCount}` : "",
        f.sheets?.length ? `│ Sheets: ${f.sheets.join(", ")}` : "",
        `│`,
        content,
        `└─── END: ${f.name} ───`,
      ].filter(Boolean).join("\n");
    }).join("\n\n");

    summaries.push({
      folderId:      folder.id!,
      folderName:    folder.bizName,
      fileNames:     files.map(f => f.name),
      fileTypes:     [...new Set(files.map(f => f.type))],
      fileCount:     files.length,
      readyCount:    ready.length,
      parsedContent: combined,
      lastAnalysis:  folder.lastAnalysisSummary || "",
    });
  }

  return {
    folderCount:     folders.length,
    fileCount:       folders.reduce((s, f) => s + f.fileCount, 0),
    totalDataSize:   totalSize,
    folderSummaries: summaries,
  };
}

export async function checkUsageLimit(uid: string): Promise<boolean> {
  const profile = await getUserProfile(uid);
  if (!profile) return false;
  if (profile.subscription && profile.subscription !== "free") return true;
  return (profile.uploadsCount || 0) < 5;
}
