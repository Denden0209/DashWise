// lib/rag/vectorStore.ts
// Firestore vector store for DashWise RAG.
// Stores embeddings in users/{uid}/embeddings/ collection.
// No external vector DB needed at this scale (<10K chunks per user).
// Upgrade path: swap to Pinecone when you have 100+ active users.

import {
  collection, doc, setDoc, getDocs, deleteDoc,
  query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Chunk, StoredChunk, SearchResult, embedText, cosineSimilarity } from "./embeddings";

function embCol(uid: string) {
  return collection(db, "users", uid, "embeddings");
}

// ── Store one chunk ────────────────────────────────────────
export async function storeChunk(uid: string, chunk: Chunk, embedding: number[]): Promise<void> {
  const ref = doc(embCol(uid));
  await setDoc(ref, { ...chunk, embedding, createdAt: serverTimestamp() });
}

// ── Store many chunks in parallel batches ─────────────────
export async function storeChunks(uid: string, chunks: Chunk[], embeddings: number[][]): Promise<void> {
  const BATCH = 20;
  for (let i = 0; i < chunks.length; i += BATCH) {
    await Promise.all(
      chunks.slice(i, i + BATCH).map((chunk, j) => storeChunk(uid, chunk, embeddings[i + j]))
    );
  }
}

// ── Delete chunks for one file ────────────────────────────
export async function deleteFileChunks(uid: string, fileId: string): Promise<void> {
  const q    = query(embCol(uid), where("fileId", "==", fileId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

// ── Check if file already has embeddings ──────────────────
export async function fileHasEmbeddings(uid: string, fileId: string): Promise<boolean> {
  const q    = query(embCol(uid), where("fileId", "==", fileId));
  const snap = await getDocs(q);
  return !snap.empty;
}

// ── Semantic search ────────────────────────────────────────
// Embeds the query, compares against all stored chunks,
// returns top K most similar above the threshold.
export async function semanticSearch(
  uid:           string,
  queryText:     string,
  topK           = 8,
  threshold      = 0.25,
  filterFolder?: string,
): Promise<SearchResult[]> {
  const queryEmbedding = await embedText(queryText);

  let q = query(embCol(uid));
  if (filterFolder) q = query(embCol(uid), where("folderId", "==", filterFolder));

  const snap = await getDocs(q);
  if (snap.empty) return [];

  const scored: SearchResult[] = [];
  snap.docs.forEach(d => {
    const chunk = { id: d.id, ...d.data() } as StoredChunk;
    const sim   = cosineSimilarity(queryEmbedding, chunk.embedding);
    if (sim >= threshold) scored.push({ chunk, similarity: sim });
  });

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

// ── Format search results into context string for Claude ──
export function buildContextFromResults(results: SearchResult[]): string {
  if (results.length === 0) return "";
  return results.map(r =>
    `[Source: ${r.chunk.source} | Relevance: ${(r.similarity * 100).toFixed(0)}%]\n${r.chunk.text}`
  ).join("\n\n---\n\n");
}
