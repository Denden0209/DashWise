// lib/rag/embeddings.ts
// OpenAI embeddings — converts text into vectors for semantic search.
// Uses text-embedding-3-small: cheapest, fast, 1536 dimensions.
// Cost: $0.02 per million tokens = ~$0.001 per average file.

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const EMBEDDING_MODEL  = "text-embedding-3-small";
export const EMBEDDING_DIM    = 1536;
export const MAX_CHUNK_WORDS  = 400;   // words per chunk
export const CHUNK_OVERLAP    = 50;    // overlapping words between chunks

// ── Types ─────────────────────────────────────────────────
export type Chunk = {
  text:       string;
  source:     string;   // filename
  fileId:     string;
  folderId:   string;
  uid:        string;
  chunkIndex: number;
};

export type StoredChunk = Chunk & {
  id:        string;
  embedding: number[];
  createdAt: unknown;
};

export type SearchResult = {
  chunk:      StoredChunk;
  similarity: number;
};

// ── Split text into overlapping chunks ────────────────────
export function chunkText(
  text:     string,
  source:   string,
  fileId:   string,
  folderId: string,
  uid:      string,
): Chunk[] {
  const words  = text.split(/\s+/).filter(Boolean);
  const chunks: Chunk[] = [];
  const step   = MAX_CHUNK_WORDS - CHUNK_OVERLAP;

  for (let i = 0; i < words.length; i += step) {
    const slice = words.slice(i, i + MAX_CHUNK_WORDS);
    if (slice.length < 10) continue;
    chunks.push({ text: slice.join(" "), source, fileId, folderId, uid, chunkIndex: chunks.length });
  }
  return chunks;
}

// ── Embed a single string ─────────────────────────────────
export async function embedText(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  });
  return res.data[0].embedding;
}

// ── Embed multiple strings in batches ─────────────────────
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const results: number[][] = [];
  const BATCH = 100;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH).map(t => t.slice(0, 8000));
    const res   = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: slice });
    results.push(...res.data.map(d => d.embedding));
  }
  return results;
}

// ── Cosine similarity between two vectors ─────────────────
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
