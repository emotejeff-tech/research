/**
 * tools/vector_memory.ts — Local execution memory (FAISS-style).
 *
 * A lightweight in-memory vector store that RAGs past conclusions + registry
 * data before the Planner kicks off new searches. Uses simple cosine
 * similarity over bag-of-words embeddings (no external dependencies — keeps
 * the mini-service self-contained). Persists to vector_memory.json so it
 * survives restarts.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_PATH = join(__dirname, '..', 'vector_memory.json')

interface MemoryEntry {
  id: string
  text: string
  query: string
  conclusion: string
  timestamp: number
  vector: number[]
}

interface VectorStore {
  entries: MemoryEntry[]
}

let store: VectorStore = { entries: [] }

/** Simple bag-of-words vectorizer (token frequencies, lowercased). */
function vectorize(text: string): number[] {
  const tokens = (text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [])
  const counts: Record<string, number> = {}
  for (const t of tokens) counts[t] = (counts[t] || 0) + 1
  // Build a fixed-size vector from the top 128 tokens.
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 128)
  return sorted.map(([, v]) => v)
}

/** Cosine similarity between two sparse vectors. */
function cosineSim(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0
  const len = Math.min(a.length, b.length)
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

/** Load the vector store from disk. */
export function loadVectorMemory() {
  try {
    if (existsSync(STORAGE_PATH)) {
      const raw = readFileSync(STORAGE_PATH, 'utf-8')
      store = JSON.parse(raw) as VectorStore
      console.log(`[vector-memory] loaded ${store.entries.length} past conclusions`)
    } else {
      store = { entries: [] }
      console.log('[vector-memory] starting fresh')
    }
  } catch (e) {
    console.error('[vector-memory] load failed:', (e as Error).message)
    store = { entries: [] }
  }
}

/** Persist the store to disk. */
function persist() {
  try {
    if (!existsSync(dirname(STORAGE_PATH))) mkdirSync(dirname(STORAGE_PATH), { recursive: true })
    writeFileSync(STORAGE_PATH, JSON.stringify(store, null, 2), 'utf-8')
  } catch (e) {
    console.error('[vector-memory] persist failed:', (e as Error).message)
  }
}

/** Store a completed research conclusion for future RAG retrieval. */
export function storeConclusion(query: string, conclusion: string) {
  const text = `${query} ${conclusion.slice(0, 500)}`
  const entry: MemoryEntry = {
    id: Math.random().toString(36).slice(2, 10),
    text,
    query,
    conclusion: conclusion.slice(0, 300),
    timestamp: Date.now(),
    vector: vectorize(text),
  }
  store.entries.push(entry)
  // Cap at 200 entries.
  if (store.entries.length > 200) store.entries = store.entries.slice(-200)
  persist()
}

/**
 * RAG retrieval: find past conclusions similar to the given query.
 * Returns the top-k matches above a similarity threshold.
 */
export function retrieveRelevant(query: string, k = 3, threshold = 0.15): MemoryEntry[] {
  if (!store.entries.length) return []
  const qVec = vectorize(query)
  const scored = store.entries.map((e) => ({
    entry: e,
    score: cosineSim(qVec, e.vector),
  }))
  return scored
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.entry)
}

/** Get stats for the frontend. */
export function getMemoryStats(): { count: number; oldestTs: number | null } {
  if (!store.entries.length) return { count: 0, oldestTs: null }
  return {
    count: store.entries.length,
    oldestTs: Math.min(...store.entries.map((e) => e.timestamp)),
  }
}
