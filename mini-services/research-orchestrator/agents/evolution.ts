/**
 * agents/evolution.ts — Self-teaching. Authors a reusable, self-contained
 * Python utility for the research domain and caches it to the plugin registry.
 */
import { llm, extractJSON } from '../tools/llm'
import type { Plugin } from '../types'
import { uid } from '../util'

const EVO_SYSTEM =
  'You are the Evolution agent. Based on the research domain, design a small, self-contained Python utility that would genuinely help automate or extend this kind of research (e.g. a fetcher, parser, analyzer, or validator). It must be runnable, under ~40 lines, and use only the standard library. Return ONLY JSON: {"name":"snake_case_name","description":"one line","language":"python","code":"..."}.'

export async function evolve(
  query: string,
  subQueries: string[],
): Promise<Plugin | null> {
  const raw = await llm(
    EVO_SYSTEM,
    `Research goal: ${query}\nDomain hints: ${subQueries.join(', ')}\n\nReturn the plugin JSON.`,
  )
  const parsed = extractJSON<Omit<Plugin, 'id' | 'createdAt'>>(raw)
  if (parsed && parsed.name && parsed.code) {
    return {
      id: uid(),
      name: parsed.name,
      description: parsed.description || '',
      language: parsed.language || 'python',
      code: parsed.code,
      createdAt: Date.now(),
    }
  }
  return null
}
