/**
 * agents/synthesizer.ts — The Actor. Drafts a cited synthesis from evidence.
 * Uses the model fallback pipeline: if the LLM is unavailable, degrades to
 * a no-LLM snippet compilation so the run never freezes.
 */
import { llmWithFallback, degradedSynthesis } from '../tools/llm'
import type { Source } from '../types'

const SYNTH_SYSTEM =
  'You are the Synthesis (Actor) agent. Given the research goal and gathered sources, write a focused, well-structured synthesis in Markdown. Cite sources inline as [n]. Address critic feedback when provided. Keep it under ~450 words.'

function buildUser(query: string, sources: Source[], feedback: string): string {
  const sourcesBlock = sources
    .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${s.snippet}`)
    .join('\n')
  const synthPrompt = feedback
    ? `Previous draft was critiqued. Feedback to address: ${feedback}\n\nRevise the research synthesis accordingly.`
    : 'Produce the first synthesis.'
  return `Research goal: ${query}\n\nSources:\n${sourcesBlock}\n\n${synthPrompt}`
}

export async function synthesize(
  query: string,
  sources: Source[],
  feedback: string,
  _iteration: number,
): Promise<{ draft: string; mode: 'primary' | 'degraded' }> {
  const result = await llmWithFallback(SYNTH_SYSTEM, buildUser(query, sources, feedback), {
    retries: 2,
    degraded: degradedSynthesis(query, sources),
  })
  return { draft: result.content, mode: result.mode }
}
