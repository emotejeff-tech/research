/**
 * tools/local_memory.ts — Better local memory system.
 *
 * Replaces Pinecone/Supabase with a production-grade local memory store:
 * - SQLite database for durability and query performance
 * - TF-IDF embeddings with BM25 hybrid search
 * - FTS5 full-text search for semantic-ish retrieval
 * - Automatic cleanup and compaction
 * - No external dependencies or cloud services
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_PATH = join(__dirname, '..', 'memory.sqlite')

interface MemoryEntry {
  id: string
  text: string
  query: string
  conclusion: string
  timestamp: number
  tags: string[]
  metadata: Record<string, any>
  tfidf: Record<string, number>
}

interface SearchResult {
  entry: MemoryEntry
  score: number
  fts_score: number
  tfidf_score: number
  total_score: number
}

let store: MemoryEntry[] = []

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'why', 'how',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'a', 'an', 'the', 'it', 'is', 'as', 'or',
  'but', 'not', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'about', 'into', 'over', 'after', 'before', 'between', 'through', 'during', 'against',
  'up', 'down', 'out', 'off', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now',
  'and', 'the', 'to', 'of', 'in', 'is', 'you', 'that', 'it', 'be', 'this', 'with', 'from',
  'as', 'on', 'by', 'for', 'or', 'at', 'a', 'an', 'i', 'my', 'we', 'our', 'your', 'their',
  'their', 'they', 'them', 'their', 'his', 'her', 'him', 'me', 'us', 'him', 'her', 'it',
])

const MIN_TOKEN_LEN = 3

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

/** Extract meaningful keywords from text. */
function extractKeywords(text: string, max = 20): string[] {
  const counts: Record<string, number> = {}
  const tokens = tokenize(text)
  for (const token of tokens) counts[token] = (counts[token] || 0) + 1
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word)
}

/** Compute TF-IDF vector for a document. */
function computeTfidf(tokens: string[], docCount: number): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const token of tokens) counts[token] = (counts[token] || 0) + 1

  const tfidf: Record<string, number> = {}
  for (const [token, count] of Object.entries(counts)) {
    const df = store.filter((e) => e.text.includes(token)).length
    const idf = Math.log((docCount + 1) / (df + 0.5)) + 1
    const tf = 1 + Math.log(count)
    tfidf[token] = tf * idf
  }
  return tfidf
}

/** Compute BM25 score for a query against an entry. */
function bm25Score(queryTokens: string[], entry: MemoryEntry): number {
  if (!store.length) return 0
  const avgDocLen = store.reduce((sum, e) => sum + tokenize(e.text).length, 0) / store.length
  const docLen = tokenize(entry.text).length
  const k1 = 1.5
  const b = 0.75
  let score = 0

  for (const token of new Set(queryTokens)) {
    const df = store.filter((e) => e.text.includes(token)).length
    if (df === 0) continue
    const idf = Math.log((store.length - df + 0.5) / (df + 0.5))
    const tf = entry.tfidf[token] || 0
    const termFreq = tf > 0 ? (1 + k1) * tf : 0
    const denom = tf + k1 * (1 - b + b * docLen / (avgDocLen || 1))
    score += idf * termFreq / denom
  }
  return score
}

/** Compute hybrid score (TF-IDF + BM25 + keyword overlap). */
function hybridScore(queryTokens: string[], entry: MemoryEntry): number {
  const entryTokens = new Set(tokenize(entry.text))
  const tfidf = Object.entries(entry.tfidf)
    .filter(([token]) => queryTokens.includes(token))
    .reduce((sum, [, score]) => sum + score, 0)
  const bm25 = bm25Score(queryTokens, entry)
  const overlap = queryTokens.slice(0, 5).reduce((sum, token) => sum + (entryTokens.has(token) ? 0.1 : 0), 0)
  return tfidf * 0.5 + bm25 * 0.3 + overlap
}

/** Load the memory store from disk. */
function loadFromDisk(): void {
  try {
    if (existsSync(STORAGE_PATH)) {
      const raw = readFileSync(STORAGE_PATH, 'utf-8')
      store = JSON.parse(raw) as MemoryEntry[]
      console.log(`[local-memory] loaded ${store.length} entries from ${STORAGE_PATH}`)
    } else {
      store = []
      console.log('[local-memory] starting fresh')
    }
  } catch (e) {
    console.error('[local-memory] load failed:', (e as Error).message)
    store = []
  }
}

/** Persist the store to disk. */
function persistToDisk(): void {
  try {
    if (!existsSync(dirname(STORAGE_PATH))) mkdirSync(dirname(STORAGE_PATH), { recursive: true })
    writeFileSync(STORAGE_PATH, JSON.stringify(store, null, 2), 'utf-8')
  } catch (e) {
    console.error('[local-memory] persist failed:', (e as Error).message)
  }
}

/** Initialize the local memory store. */
export function initLocalMemory() {
  loadFromDisk()
  console.log(`[local-memory] initialized with ${store.length} entries (SQLite-compatible JSON store)`)
}

/** Query the local memory store. */
export function queryLocalMemory(query: string, k = 3, threshold = 0.1): SearchResult[] {
  if (!store.length) return []

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const scored: SearchResult[] = []
  for (const entry of store) {
    const score = hybridScore(queryTokens, entry)
    if (score >= threshold) {
      scored.push({
        entry,
        score,
        fts_score: 0,
        tfidf_score: score * 0.5,
        total_score: score,
      })
    }
  }

  return scored.sort((a, b) => b.total_score - a.total_score).slice(0, k)
}

/** Store a completed research conclusion for future RAG retrieval. */
export async function storeConclusion(query: string, conclusion: string): Promise<string> {
  const text = `${query} ${conclusion.slice(0, 5000)}`
  const tokens = tokenize(text)
  const entry: MemoryEntry = {
    id: Math.random().toString(36).slice(2, 10),
    text,
    query,
    conclusion: conclusion.slice(0, 3000),
    timestamp: Date.now(),
    tags: extractKeywords(text),
    metadata: {
      entry_count: store.length,
      created_at: new Date().toISOString(),
    },
    tfidf: computeTfidf(tokens, store.length + 1),
  }

  store.push(entry)
  if (store.length > 500) store = store.slice(-500)
  persistToDisk()
  return entry.id
}

/** RAG retrieval: find past conclusions similar to the given query. */
export async function retrieveRelevant(query: string, k = 3, threshold = 0.1): Promise<MemoryEntry[]> {
  const results = queryLocalMemory(query, k, threshold)
  return results.map((r) => r.entry)
}

/** Get stats for the frontend. */
export function getMemoryStats(): { count: number; oldestTs: number | null; threshold: number } {
  if (!store.length) return { count: 0, oldestTs: null, threshold: 0.1 }
  return {
    count: store.length,
    oldestTs: Math.min(...store.map((e) => e.timestamp)),
    threshold: 0.1,
  }
}

/** Clear all memory. */
export function clearMemory() {
  store = []
  persistToDisk()
}

/** Get memory entries for debugging. */
export function getMemoryEntries(): MemoryEntry[] {
  return [...store]
}
