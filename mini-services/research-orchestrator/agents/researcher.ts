/**
 * agents/researcher.ts — The Discovery agent. Runs multi-provider web search
 * per sub-query and streams sources to the client. Uses the search aggregator
 * to query Brave, Tavily, Exa, DuckDuckGo, and Z.ai in parallel.
 */
import { multiSearch } from '../tools/search_providers'
import { getCachedResults, cacheResults } from '../tools/search_cache'
import type { Source, Emit } from '../types'
import { sleep } from '../util'

export async function discover(subQueries: string[], emit: Emit): Promise<Source[]> {
  const sources: Source[] = []
  for (const sq of subQueries) {
    // Check cache first.
    const cached = getCachedResults(sq)
    if (cached) {
      emit('research:thought', { agent: 'Discovery', text: `Cache hit: "${sq}" — returning ${cached.length} cached sources instantly` })
      for (const src of cached) {
        sources.push({ ...src, id: src.id + '_c' })
        emit('research:source', { source: { ...src, id: src.id + '_c' } })
      }
      continue
    }

    emit('research:thought', { agent: 'Discovery', text: `Multi-provider search: "${sq}"` })
    try {
      const { sources: results, providerStats } = await multiSearch(sq, 5, (ps) => {
        if (ps.results.length > 0) {
          emit('research:thought', {
            agent: 'Discovery',
            text: `[${ps.provider}] returned ${ps.results.length} results in ${ps.durationMs}ms`,
          })
        } else if (ps.error) {
          emit('research:thought', {
            agent: 'Discovery',
            text: `[${ps.provider}] failed: ${ps.error.slice(0, 60)}`,
          })
        }
      })

      // Cache the merged results.
      cacheResults(sq, results)
      for (const src of results.slice(0, 6)) {
        sources.push(src)
        emit('research:source', { source: src })
        await sleep(100)
      }

      // Summary of which providers contributed.
      const working = providerStats.filter((p) => p.results.length > 0).map((p) => p.provider)
      if (working.length > 0) {
        emit('research:thought', {
          agent: 'Discovery',
          text: `Merged ${results.length} unique sources from ${working.length} provider(s): ${working.join(', ')}`,
        })
      }
    } catch (e) {
      emit('research:thought', {
        agent: 'Discovery',
        text: `Search failed for "${sq}": ${(e as Error).message}`,
      })
    }
    await sleep(200)
  }

  // Academic paper pass.
  const academicQuery = `${subQueries[0]} research paper arxiv`
  const cachedAcademic = getCachedResults(academicQuery)
  if (cachedAcademic) {
    emit('research:thought', { agent: 'Discovery', text: `Cache hit: academic pass` })
    for (const src of cachedAcademic) {
      sources.push({ ...src, id: src.id + '_ac' })
      emit('research:source', { source: { ...src, id: src.id + '_ac' } })
    }
  } else {
    emit('research:thought', { agent: 'Discovery', text: `Academic search: "${academicQuery}"` })
    try {
      const { sources: paperResults } = await multiSearch(academicQuery, 4)
      cacheResults(academicQuery, paperResults)
      for (const src of paperResults.slice(0, 3)) {
        sources.push(src)
        emit('research:source', { source: src })
        await sleep(100)
      }
    } catch {
      /* best-effort */
    }
  }

  emit('research:thought', {
    agent: 'Discovery',
    text: `Collected ${sources.length} sources across ${subQueries.length} branches (+ academic pass).`,
  })
  return sources
}
