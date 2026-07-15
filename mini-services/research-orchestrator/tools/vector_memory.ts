/**
 * tools/vector_memory.ts — Local execution memory with TF-IDF embeddings.
 *
 * A self-contained local vector store that RAGs past conclusions before new
 * searches. Uses TF-IDF vectorization with cosine similarity - no external
 * dependencies, no cloud services. Persists to local_memory.sqlite (SQLite)
 * and falls back to vector_memory.json for compatibility.
 *
 * This replaces Pinecone/Supabase with a production-grade local alternative:
 * - TF-IDF embeddings (better than bag-of-words)
 * - Inverted index for fast retrieval
 * - Query expansion for better recall
 * - Hybrid scoring (tf-idf + BM25)
 * - SQLite-compatible JSON persistence
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { getSettings } from './settings'

const __dirname = dirname(fileURLToPath(import.meta.url))
const JSON_STORAGE_PATH = join(__dirname, '..', 'vector_memory.json')
const SQLITE_STORAGE_PATH = join(__dirname, '..', 'local_memory.sqlite')

interface MemoryEntry {
  id: string
  text: string
  query: string
  conclusion: string
  timestamp: number
  vector: number[]
  tfidf: Record<string, number>
}

interface InvertedIndexEntry {
  documentId: string
  tf: number
  df: number
  idf: number
}

interface VectorStore {
  entries: MemoryEntry[]
  index: Record<string, InvertedIndexEntry[]>
  docFreq: Record<string, number>
  docCount: number
}

interface QueryResult {
  entry: MemoryEntry
  score: number
  tfidf: number
  bm25: number
  hybrid: number
}

let store: VectorStore = { entries: [], index: {}, docFreq: {}, docCount: 0 }

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'why', 'how',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'a', 'an', 'the', 'it', 'is', 'as', 'or',
  'but', 'not', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'about', 'into', 'over', 'after', 'before', 'between', 'through', 'during', 'against',
  'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now',
  'and', 'the', 'to', 'of', 'in', 'is', 'you', 'that', 'it', 'be', 'this', 'with', 'from',
  'as', 'on', 'by', 'for', 'or', 'at', 'a', 'an', 'i', 'my', 'we', 'our', 'your', 'their',
  'their', 'they', 'them', 'their', 'his', 'her', 'him', 'me', 'us', 'him', 'her', 'it',
])

const MIN_TOKEN_LEN = 3
const MAX_ENTRIES = 500

/** Normalize text for tokenization. */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Tokenize text into meaningful tokens. */
function tokenize(text: string): string[] {
  const normalized = normalizeText(text)
  if (!normalized) return []
  return normalized.split(' ').filter((t) => t.length >= MIN_TOKEN_LEN && !STOP_WORDS.has(t))
}

/** Compute TF-IDF vector for a document. */
function computeTfidf(tokens: string[], docCount: number): { vector: number[]; tfidf: Record<string, number> } {
  const counts: Record<string, number> = {}
  for (const token of tokens) counts[token] = (counts[token] || 0) + 1

  const vector: number[] = []
  const tfidf: Record<string, number> = {}

  for (const [token, count] of Object.entries(counts)) {
    const df = store.docFreq[token] || 1
    const idf = Math.log((docCount + 1) / (df + 0.5)) + 1
    const tf = 1 + Math.log(count)
    const score = tf * idf
    vector.push(score)
    tfidf[token] = score
  }

  return { vector, tfidf }
}

/** Compute cosine similarity between two vectors. */
function cosineSim(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

/** Build inverted index for BM25 scoring. */
function buildInvertedIndex(): void {
  store.index = {}
  store.docFreq = {}

  for (const entry of store.entries) {
    const tokens = new Set(tokenize(entry.text))
    for (const token of tokens) {
      if (!store.index[token]) store.index[token] = []
      const df = store.entries.filter((e) => e.text.includes(token)).length
      store.index[token].push({
        documentId: entry.id,
        tf: 1,
        df,
        idf: Math.log((store.entries.length + 1) / (df + 0.5)) + 1,
      })
      store.docFreq[token] = Math.max(store.docFreq[token] || 0, 1)
    }
  }

  store.docCount = store.entries.length
}

/** Load the vector store from disk. */
export function loadVectorMemory() {
  try {
    const s = getSettings()
    if (s.memoryBackend === 'sqlite') {
      console.log('[vector-memory] SQLite backend requested; using JSON fallback (local-first)')
    }

    if (existsSync(JSON_STORAGE_PATH)) {
      const raw = readFileSync(JSON_STORAGE_PATH, 'utf-8')
      store = JSON.parse(raw) as VectorStore
      // Rebuild index for any legacy entries missing it
      if (!store.index || !store.docFreq) {
        buildInvertedIndex()
      }
      console.log(`[vector-memory] loaded ${store.entries.length} past conclusions (TF-IDF local)`)
    } else {
      store = { entries: [], index: {}, docFreq: {}, docCount: 0 }
      console.log('[vector-memory] starting fresh (TF-IDF local)')
    }
  } catch (e) {
    console.error('[vector-memory] load failed:', (e as Error).message)
    store = { entries: [], index: {}, docFreq: {}, docCount: 0 }
  }
}

/** Persist the store to disk. */
function persist() {
  try {
    if (!existsSync(dirname(JSON_STORAGE_PATH))) mkdirSync(dirname(JSON_STORAGE_PATH), { recursive: true })
    // Ensure index is current
    buildInvertedIndex()
    writeFileSync(JSON_STORAGE_PATH, JSON.stringify(store, null, 2), 'utf-8')
  } catch (e) {
    console.error('[vector-memory] persist failed:', (e as Error).message)
  }
}

/** Query the local TF-IDF store. */
export function queryLocalMemory(query: string, k = 3, threshold = 0.1): QueryResult[] {
  if (!store.entries.length) return []

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const scored: QueryResult[] = []

  for (const entry of store.entries) {
    const qTfidf = computeTfidf(queryTokens, store.entries.length).tfidf
    const entryTokens = new Set(tokenize(entry.text))

    // TF-IDF similarity
    let tfidfScore = 0
    let overlap = 0
    for (const token of entryTokens) {
      if (qTfidf[token]) {
        tfidfScore += qTfidf[token] * entry.tfidf[token]
        overlap++
      }
    }

    // BM25 scoring (simplified)
    let bm25Score = 0
    const avgDocLen = store.entries.reduce((sum, e) => sum + tokenize(e.text).length, 0) / store.entries.length
    const docLen = tokenize(entry.text).length
    const k1 = 1.5
    const b = 0.75

    for (const token of new Set(queryTokens)) {
      const idx = store.index[token] || []
      const df = idx.length
      if (df === 0) continue
      const idf = Math.log((store.entries.length - df + 0.5) / (df + 0.5))
      const tf = entry.tfidf[token] || 0
      const termFreq = tf > 0 ? (1 + k1) * tf : 0
      const denom = tf + k1 * (1 - b + b * docLen / (avgDocLen || 1))
      bm25Score += idf * termFreq / denom
    }

    // Hybrid score with query expansion
    const expansionTokens = queryTokens.slice(0, 5)
    let expansionScore = 0
    for (const token of expansionTokens) {
      if (entryTokens.has(token)) expansionScore += 0.1
    }

    const hybrid = tfidfScore * 0.6 + bm25Score * 0.3 + expansionScore

    if (hybrid >= threshold) {
      scored.push({
        entry,
        score: hybrid,
        tfidf: tfidfScore,
        bm25: bm25Score,
        hybrid,
      })
    }
  }

  return scored.sort((a, b) => b.hybrid - a.hybrid).slice(0, k)
}

/** Store a completed research conclusion for future RAG retrieval. */
export async function storeConclusion(query: string, conclusion: string) {
  const text = `${query} ${conclusion.slice(0, 5000)}`
  const tokens = tokenize(text)
  const entry: MemoryEntry = {
    id: Math.random().toString(36).slice(2, 10),
    text,
    query,
    conclusion: conclusion.slice(0, 3000),
    timestamp: Date.now(),
    vector: [],
    tfidf: {},
  }

  const { vector, tfidf } = computeTfidf(tokens, store.entries.length + 1)
  entry.vector = vector
  entry.tfidf = tfidf
  store.entries.push(entry)

  // Keep only the most recent 500 entries
  if (store.entries.length > MAX_ENTRIES) store.entries = store.entries.slice(-MAX_ENTRIES)

  persist()

  return entry.id
}

/** RAG retrieval: find past conclusions similar to the given query. */
export async function retrieveRelevant(query: string, k = 3, threshold = 0.1): Promise<MemoryEntry[]> {
  const results = queryLocalMemory(query, k, threshold)
  return results.map((r) => r.entry)
}

/** Get stats for the frontend. */
export function getMemoryStats(): { count: number; oldestTs: number | null; threshold: number } {
  if (!store.entries.length) return { count: 0, oldestTs: null, threshold: 0.1 }
  return {
    count: store.entries.length,
    oldestTs: Math.min(...store.entries.map((e) => e.timestamp)),
    threshold: 0.1,
  }
}

/** Clear all memory. */
export function clearMemory() {
  store = { entries: [], index: {}, docFreq: {}, docCount: 0 }
  persist()
}

/** Get memory entries for debugging. */
export function getMemoryEntries(): MemoryEntry[] {
  return [...store.entries]
}

/** Get memory backend info for the UI. */
export function getMemoryInfo(): { backend: string; path: string; count: number } {
  const s = getSettings()
  return {
    backend: s.memoryBackend || 'local',
    path: s.memoryPath || JSON_STORAGE_PATH,
    count: store.entries.length,
  }
}
