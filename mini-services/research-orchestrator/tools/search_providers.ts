/**
 * tools/search_providers.ts — Multi-provider search aggregator.
 *
 * Queries multiple search APIs in parallel (Brave, Tavily, Exa, DuckDuckGo
 * Instant, Z.ai) and merges + deduplicates results. Each provider is
 * rate-limited independently. Providers without API keys are skipped.
 *
 * This decouples search from the Z.ai SDK — if Z.ai is unavailable, the
 * other providers still return results.
 */
import type { Source } from '../types'
import { uid } from '../util'
import { getSettings } from './settings'

export interface SearchProviderResult {
  provider: string
  results: Source[]
  error?: string
  durationMs: number
}

/** Per-provider rate limiting (minimum ms between calls). */
const RATE_LIMITS: Record<string, number> = {
  zai: 200,
  brave: 500,      // 1 req per second (free tier)
  tavily: 400,     // ~2.5 req/sec
  exa: 400,        // reasonable
  duckduckgo: 1000, // be gentle
}

const lastCallTime: Record<string, number> = {}

/** Respect per-provider rate limits. */
async function rateLimit(provider: string): Promise<void> {
  const limit = RATE_LIMITS[provider] || 500
  const now = Date.now()
  const elapsed = now - (lastCallTime[provider] || 0)
  if (elapsed < limit) {
    await new Promise((r) => setTimeout(r, limit - elapsed))
  }
  lastCallTime[provider] = Date.now()
}

// ---------- Provider: Z.ai (built-in, no key needed) ----------
async function searchZai(query: string, num: number): Promise<Source[]> {
  const { getZAI } = await import('./sdk')
  await rateLimit('zai')
  const sdk = await getZAI()
  const results: any[] = await sdk.functions.invoke('web_search', { query, num })
  return (results || []).slice(0, num).map((r) => ({
    id: uid(),
    query,
    title: r.name || r.title || 'Untitled',
    url: r.url,
    snippet: (r.snippet || '').slice(0, 300),
    host: r.host_name || '',
  }))
}

// ---------- Provider: Brave Search API ----------
async function searchBrave(query: string, num: number, apiKey: string): Promise<Source[]> {
  await rateLimit('brave')
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${num}`, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`)
  const data: any = await res.json()
  return (data?.web?.results || []).slice(0, num).map((r: any) => ({
    id: uid(),
    query,
    title: r.title || 'Untitled',
    url: r.url,
    snippet: (r.description || '').slice(0, 300),
    host: (() => { try { return new URL(r.url).hostname } catch { return '' } })(),
  }))
}

// ---------- Provider: Tavily API ----------
async function searchTavily(query: string, num: number, apiKey: string): Promise<Source[]> {
  await rateLimit('tavily')
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: num,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`)
  const data: any = await res.json()
  return (data?.results || []).slice(0, num).map((r: any) => ({
    id: uid(),
    query,
    title: r.title || 'Untitled',
    url: r.url,
    snippet: (r.content || '').slice(0, 300),
    host: (() => { try { return new URL(r.url).hostname } catch { return '' } })(),
  }))
}

// ---------- Provider: Exa (formerly Metaphor) ----------
async function searchExa(query: string, num: number, apiKey: string): Promise<Source[]> {
  await rateLimit('exa')
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      numResults: num,
      useAutoprompt: true,
      contents: { text: { maxCharacters: 300 } },
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Exa HTTP ${res.status}`)
  const data: any = await res.json()
  return (data?.results || []).slice(0, num).map((r: any) => ({
    id: uid(),
    query,
    title: r.title || 'Untitled',
    url: r.url,
    snippet: (r.text || '').slice(0, 300),
    host: (() => { try { return new URL(r.url).hostname } catch { return '' } })(),
  }))
}

// ---------- Provider: DuckDuckGo Instant (no key needed) ----------
async function searchDuckDuckGo(query: string, num: number): Promise<Source[]> {
  await rateLimit('duckduckgo')
  const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`)
  const data: any = await res.json()
  // DDG Instant API returns limited results — extract what we can.
  const results: Source[] = []
  if (data.AbstractText && data.AbstractURL) {
    results.push({
      id: uid(), query, title: data.Heading || query,
      url: data.AbstractURL, snippet: data.AbstractText.slice(0, 300),
      host: (() => { try { return new URL(data.AbstractURL).hostname } catch { return '' } })(),
    })
  }
  for (const r of (data.RelatedTopics || []).slice(0, num)) {
    if (r.Text && r.FirstURL) {
      results.push({
        id: uid(), query, title: r.Text.slice(0, 80),
        url: r.FirstURL, snippet: r.Text.slice(0, 300),
        host: (() => { try { return new URL(r.FirstURL).hostname } catch { return '' } })(),
      })
    }
    if (results.length >= num) break
  }
  return results
}

// ---------- Multi-provider aggregator ----------
/**
 * Query all configured search providers in parallel and merge results.
 * Deduplicates by URL, ranks by frequency (appearing in multiple providers = higher rank).
 * Returns merged results + per-provider stats.
 */
export async function multiSearch(
  query: string,
  num: number = 5,
  onProviderResult?: (result: SearchProviderResult) => void,
): Promise<{ sources: Source[]; providerStats: SearchProviderResult[] }> {
  const settings = getSettings()
  const providers: { name: string; fn: () => Promise<Source[]> }[] = []

  // Always try Z.ai (free, no key) — but wrap in try/catch since it may fail without config.
  providers.push({
    name: 'zai',
    fn: () => searchZai(query, num),
  })

  // DuckDuckGo (free, no key)
  providers.push({
    name: 'duckduckgo',
    fn: () => searchDuckDuckGo(query, num),
  })

  // Brave (needs key)
  if (settings.braveApiKey) {
    providers.push({
      name: 'brave',
      fn: () => searchBrave(query, num, settings.braveApiKey),
    })
  }

  // Tavily (needs key)
  if (settings.tavilyApiKey) {
    providers.push({
      name: 'tavily',
      fn: () => searchTavily(query, num, settings.tavilyApiKey),
    })
  }

  // Exa (needs key)
  if (settings.exaApiKey) {
    providers.push({
      name: 'exa',
      fn: () => searchExa(query, num, settings.exaApiKey),
    })
  }

  // Run all providers in parallel.
  const results = await Promise.allSettled(
    providers.map(async (p) => {
      const start = Date.now()
      try {
        const sources = await p.fn()
        const result: SearchProviderResult = {
          provider: p.name,
          results: sources,
          durationMs: Date.now() - start,
        }
        onProviderResult?.(result)
        return result
      } catch (e) {
        const result: SearchProviderResult = {
          provider: p.name,
          results: [],
          error: (e as Error).message,
          durationMs: Date.now() - start,
        }
        onProviderResult?.(result)
        return result
      }
    }),
  )

  const providerStats = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { provider: 'unknown', results: [], error: 'rejected', durationMs: 0 },
  )

  // Merge + deduplicate by URL.
  const seen = new Map<string, { source: Source; count: number }>()
  for (const ps of providerStats) {
    for (const s of ps.results) {
      if (!s.url) continue
      // Normalize URL for dedup (strip trailing slash, lowercase host).
      const normalized = s.url.replace(/\/$/, '').toLowerCase()
      const existing = seen.get(normalized)
      if (existing) {
        existing.count++
        // Prefer longer snippets.
        if (s.snippet.length > existing.source.snippet.length) {
          existing.source.snippet = s.snippet
        }
      } else {
        seen.set(normalized, { source: s, count: 1 })
      }
    }
  }

  // Sort by cross-provider frequency (more providers = higher rank), then by snippet length.
  const merged = Array.from(seen.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return b.source.snippet.length - a.source.snippet.length
    })
    .map((v) => ({ ...v.source, query }))

  return { sources: merged, providerStats }
}
