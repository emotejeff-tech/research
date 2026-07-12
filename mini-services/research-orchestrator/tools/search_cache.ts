/**
 * tools/search_cache.ts — Parameterized tool caching.
 *
 * Caches web_search inputs/outputs. If the agent fires an identical sub-query,
 * it returns the cached result instantly instead of hitting the internet.
 * Persists to search_cache.json so cache survives restarts.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { Source } from '../types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE_PATH = join(__dirname, '..', 'search_cache.json')

interface CacheEntry {
  query: string
  results: Source[]
  timestamp: number
  hitCount: number
}

let cache: Record<string, CacheEntry> = {}

/** Load the cache from disk. */
export function loadSearchCache() {
  try {
    if (existsSync(CACHE_PATH)) {
      cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'))
      console.log(`[search-cache] loaded ${Object.keys(cache).length} cached queries`)
    }
  } catch {
    cache = {}
  }
}

/** Persist the cache. */
function persist() {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8')
  } catch {
    /* best-effort */
  }
}

/** Normalize a query string for cache key matching. */
function cacheKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Check the cache for a matching query. Returns cached sources + increments
 * hitCount if found, or null if not cached.
 */
export function getCachedResults(query: string): Source[] | null {
  const key = cacheKey(query)
  const entry = cache[key]
  if (entry) {
    entry.hitCount += 1
    persist()
    return entry.results
  }
  return null
}

/** Store search results in the cache. */
export function cacheResults(query: string, results: Source[]) {
  const key = cacheKey(query)
  cache[key] = {
    query,
    results,
    timestamp: Date.now(),
    hitCount: 1,
  }
  // Cap at 100 cached queries.
  const keys = Object.keys(cache)
  if (keys.length > 100) {
    // Evict the oldest.
    let oldest = keys[0]
    for (const k of keys) {
      if (cache[k].timestamp < cache[oldest].timestamp) oldest = k
    }
    delete cache[oldest]
  }
  persist()
}

/** Get cache stats for the frontend. */
export function getCacheStats(): { entries: number; totalHits: number } {
  const entries = Object.keys(cache).length
  const totalHits = Object.values(cache).reduce((sum, e) => sum + e.hitCount, 0)
  return { entries, totalHits }
}
