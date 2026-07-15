/**
 * tools/search_providers.ts — Multi-provider search aggregator.
 *
 * Queries multiple search APIs in parallel (Brave, Tavily, Exa, DuckDuckGo
 * Instant, Z.ai) and merges + deduplicates results. Each provider is
 * rate-limited independently. Providers without API keys are skipped.
 *
 * Local-first:
 * - DuckDuckGo works without a key
 * - arXiv API works without a key for academic research
 * - Local cache replay works when all providers fail
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
  tavily: 400,
  exa: 400,
  youcom: 600,
  tinyfish: 500,
  nimbler: 500,
  duckduckgo: 1000,
  arxiv: 500,
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

// ---------- Provider: You.com ----------
async function searchYouCom(query: string, num: number, apiKey: string): Promise<Source[]> {
  await rateLimit('youcom')
  const res = await fetch(`https://api.ydc-index.io/search?query=${encodeURIComponent(query)}&num_web_results=${num}`, {
    headers: { 'X-API-Key': apiKey },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`You.com HTTP ${res.status}`)
  const data: any = await res.json()
  return (data?.hits || []).slice(0, num).map((r: any) => ({
    id: uid(),
    query,
    title: r.title || 'Untitled',
    url: r.url,
    snippet: (r.description || r.snippet || '').slice(0, 300),
    host: (() => { try { return new URL(r.url).hostname } catch { return '' } })(),
  }))
}

// ---------- Provider: TinyFish (AI-optimized search) ----------
async function searchTinyFish(query: string, num: number, apiKey: string): Promise<Source[]> {
  await rateLimit('tinyfish')
  const res = await fetch('https://api.tinyfish.io/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, max_results: num }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`TinyFish HTTP ${res.status}`)
  const data: any = await res.json()
  return (data?.results || data?.data || []).slice(0, num).map((r: any) => ({
    id: uid(),
    query,
    title: r.title || r.name || 'Untitled',
    url: r.url || r.link,
    snippet: (r.snippet || r.content || r.description || '').slice(0, 300),
    host: (() => { try { return new URL(r.url || r.link).hostname } catch { return '' } })(),
  }))
}

// ---------- Provider: Nimble (nimbleway.com) ----------
// API: POST https://sdk.nimbleway.com/v1/agents/run
// Auth: Bearer token
// Uses the "google_search" agent with a query parameter.
async function searchNimbler(query: string, num: number, apiKey: string): Promise<Source[]> {
  await rateLimit('nimbler')
  const res = await fetch('https://sdk.nimbleway.com/v1/agents/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      agent: 'google_search',
      params: {
        query: query,
        num: num,
        parse: true,
      },
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Nimble HTTP ${res.status}: ${errText.slice(0, 100)}`)
  }
  const data: any = await res.json()
  // Nimble returns results in data.output.results or data.results
  const results = data?.output?.results || data?.results || data?.output || []
  const sources: Source[] = []
  for (const r of (Array.isArray(results) ? results : [])) {
    sources.push({
      id: uid(),
      query,
      title: r.title || r.name || 'Untitled',
      url: r.url || r.link || r.href || '',
      snippet: (r.snippet || r.description || r.content || r.text || '').slice(0, 300),
      host: (() => { try { return r.url ? new URL(r.url).hostname : (r.domain || '') } catch { return '' } })(),
    })
    if (sources.length >= num) break
  }
  return sources
}

// ---------- Provider: arXiv (no key needed, academic research) ----------
async function searchArxiv(query: string, num: number): Promise<Source[]> {
  await rateLimit('arxiv')
  const searchQuery = query.replace(/\s+/g, '+').slice(0, 200)
  const url = `http://export.arxiv.org/api/query?search_query=all:${searchQuery}&start=0&max_results=${num}`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`)
  const data: any = await res.text()
  const sources: Source[] = []

  // Parse XML manually (no dependencies)
  const entries = data.match(/<entry>([\s\S]*?)<\/entry>/g) || []
  for (const entry of entries.slice(0, num)) {
    const title = extractXml(entry, 'title')?.trim().replace(/\s+/g, ' ') || 'Untitled'
    const summary = extractXml(entry, 'summary')?.trim().replace(/\s+/g, ' ') || ''
    const id = extractXml(entry, 'id') || ''
    const authors = extractXml(entry, 'author')
    const published = extractXml(entry, 'published') || ''
    const host = 'arxiv.org'

    if (id) {
      sources.push({
        id: uid(),
        query,
        title,
        url: id,
        snippet: `${summary.slice(0, 300)}${authors ? `\nAuthors: ${authors}` : ''}${published ? `\nPublished: ${published}` : ''}`,
        host,
      })
    }
  }
  return sources
}

/** Extract a simple XML element. */
function extractXml(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  if (!match) return null
  return match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
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

  // Always try arXiv (free, no key) — great for academic research.
  providers.push({
    name: 'arxiv',
    fn: () => searchArxiv(query, num),
  })

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

  // You.com (needs key)
  if (settings.youcomApiKey) {
    providers.push({
      name: 'youcom',
      fn: () => searchYouCom(query, num, settings.youcomApiKey),
    })
  }

  // TinyFish (needs key)
  if (settings.tinyfishApiKey) {
    providers.push({
      name: 'tinyfish',
      fn: () => searchTinyFish(query, num, settings.tinyfishApiKey),
    })
  }

  // Nimbler (needs key)
  if (settings.nimblerApiKey) {
    providers.push({
      name: 'nimbler',
      fn: () => searchNimbler(query, num, settings.nimblerApiKey),
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
