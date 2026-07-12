/**
 * agents/researcher.ts — The Discovery agent. Runs deep web search per
 * sub-query and streams sources to the client as they arrive. Also runs
 * an academic-paper-oriented search pass to surface research papers.
 *
 * Performance: checks the parameterized search cache first — if a sub-query
 * was already searched, returns the cached result instantly.
 */
import { webSearch } from '../tools/web_search'
import { getCachedResults, cacheResults } from '../tools/search_cache'
import type { Source, Emit } from '../types'
import { sleep } from '../util'

export async function discover(subQueries: string[], emit: Emit): Promise<Source[]> {
  const sources: Source[] = []
  for (const sq of subQueries) {
    // Check cache first.
    const cached = getCachedResults(sq)
    if (cached) {
      emit('research:thought', { agent: 'Discovery', text: `⚡ Cache hit: "${sq}" — returning ${cached.length} cached sources instantly` })
      for (const src of cached) {
        sources.push({ ...src, id: src.id + '_c' }) // new id to avoid dupes
        emit('research:source', { source: { ...src, id: src.id + '_c' } })
      }
      continue
    }

    emit('research:thought', { agent: 'Discovery', text: `Searching the web: "${sq}"` })
    try {
      const results = await webSearch(sq, 5)
      // Cache the results for future runs.
      cacheResults(sq, results)
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

  // Academic paper pass — surface research papers for deeper grounding.
  const academicQuery = `${subQueries[0]} research paper arxiv`
  // Check cache for the academic query too.
  const cachedAcademic = getCachedResults(academicQuery)
  if (cachedAcademic) {
    emit('research:thought', { agent: 'Discovery', text: `⚡ Cache hit: academic pass — returning ${cachedAcademic.length} cached sources` })
    for (const src of cachedAcademic) {
      sources.push({ ...src, id: src.id + '_ac' })
      emit('research:source', { source: { ...src, id: src.id + '_ac' } })
    }
  } else {
    emit('research:thought', {
      agent: 'Discovery',
      text: `Searching for academic papers: "${academicQuery}"`,
    })
    try {
      const paperResults = await webSearch(academicQuery, 4)
      cacheResults(academicQuery, paperResults)
      for (const src of paperResults.slice(0, 3)) {
        sources.push(src)
        emit('research:source', { source: src })
        await sleep(100)
      }
    } catch {
      /* academic search is best-effort */
    }
  }

  emit('research:thought', {
    agent: 'Discovery',
    text: `Collected ${sources.length} sources across ${subQueries.length} branches (+ academic pass).`,
  })
  return sources
}
