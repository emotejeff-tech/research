/**
 * tools/web_search.ts — Web search wrapper (Tavily/Exa-equivalent via z-ai).
 * Cheap, used heavily in Discovery (hybrid routing for token efficiency).
 */
import { getZAI } from './sdk'
import type { Source } from '../types'
import { uid } from '../util'

export async function webSearch(query: string, num = 5): Promise<Source[]> {
  const sdk = await getZAI()
  const results: any[] = await sdk.functions.invoke('web_search', { query, num })
  return (results || []).slice(0, num).map((r) => ({
    id: uid(),
    query,
    title: r.name || r.title || 'Untitled',
    url: r.url,
    snippet: (r.snippet || '').slice(0, 280),
    host: r.host_name || '',
  }))
}
