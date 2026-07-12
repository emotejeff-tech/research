/**
 * tools/web_search.ts — Web search wrapper (Tavily/Exa-equivalent via z-ai).
 *
 * OPSEC: Request Jittering — randomized delay micro-intervals between calls
 * to break programmatic cadence detection. The UA rotation is handled by the
 * ua_rotator evolved tool; jitter is applied here at the orchestration layer.
 */
import { getZAI } from './sdk'
import type { Source } from '../types'
import { uid } from '../util'

/** OPSEC: randomized jitter between 100ms–800ms to break cadence detection. */
function opsecJitter(): Promise<void> {
  const ms = 100 + Math.floor(Math.random() * 700)
  return new Promise((r) => setTimeout(r, ms))
}

export async function webSearch(query: string, num = 5): Promise<Source[]> {
  // OPSEC: jitter before every external request.
  await opsecJitter()
  const sdk = await getZAI()
  let results: any[]
  try {
    results = await sdk.functions.invoke('web_search', { query, num })
  } catch (e) {
    // OPSEC: detect 429 / blocklist errors and surface them.
    const msg = (e as Error)?.message || ''
    if (msg.includes('429') || msg.includes('rate') || msg.includes('block')) {
      throw new Error(`OPSEC: rate-limit/block detected — ${msg}`)
    }
    throw e
  }
  return (results || []).slice(0, num).map((r) => ({
    id: uid(),
    query,
    title: r.name || r.title || 'Untitled',
    url: r.url,
    snippet: (r.snippet || '').slice(0, 280),
    host: r.host_name || '',
  }))
}
