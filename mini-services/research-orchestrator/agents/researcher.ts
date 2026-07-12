/**
 * agents/researcher.ts — The Discovery agent. Runs deep web search per
 * sub-query and streams sources to the client as they arrive.
 */
import { webSearch } from '../tools/web_search'
import type { Source, Emit } from '../types'
import { sleep } from '../util'

export async function discover(subQueries: string[], emit: Emit): Promise<Source[]> {
  const sources: Source[] = []
  for (const sq of subQueries) {
    emit('research:thought', { agent: 'Discovery', text: `Searching the web: "${sq}"` })
    try {
      const results = await webSearch(sq, 5)
      for (const src of results.slice(0, 4)) {
        sources.push(src)
        emit('research:source', { source: src })
        await sleep(120)
      }
    } catch (e) {
      emit('research:thought', {
        agent: 'Discovery',
        text: `Search failed for "${sq}", continuing with partial results. (${(e as Error).message})`,
      })
    }
    await sleep(200)
  }
  emit('research:thought', {
    agent: 'Discovery',
    text: `Collected ${sources.length} sources across ${subQueries.length} branches.`,
  })
  return sources
}
