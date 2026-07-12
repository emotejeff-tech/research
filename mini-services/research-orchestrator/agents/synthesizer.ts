/**
 * agents/synthesizer.ts — The Actor. Drafts a cited synthesis from evidence.
 *
 * Mode-aware:
 *  - 'research'  → strict independent-research-analyst methodology.
 *  - 'blueprint' → best-ideas actionable blueprint using latest research/code.
 *
 * Uses the model fallback pipeline: if the LLM is unavailable, degrades to a
 * no-LLM snippet compilation so the run never freezes.
 */
import { llmWithFallback, degradedSynthesis } from '../tools/llm'
import type { Source, TaskType } from '../types'

const RESEARCH_SYSTEM = `You are an independent research analyst. Evaluate the goal below and form an ORIGINAL conclusion. You MUST strictly follow these rules:

1. Primary Data Only: Rely exclusively on verifiable, empirical data, raw statistics, documented history, or peer-reviewed findings from the sources.
2. Strip the Narrative: Filter out editorial commentary, political bias, corporate PR, and standard internet consensus. Do NOT adopt the framing or wording of outside sources — use your own.
3. Show Your Logic: Walk through your step-by-step reasoning. Compare opposing data points or counterarguments directly against each other based on the strength of their evidence.
4. Form an Independent Conclusion: Based only on that evidence and your own logical synthesis, deliver a DEFINITIVE conclusion. Do NOT hedge with generic summaries like "some experts say X while others say Y" — state what the data actually points to.

Write in Markdown. Cite sources inline as [n]. Keep it under ~500 words. Address critic feedback when provided.`

const BLUEPRINT_SYSTEM = `You are a senior systems architect. For the goal below, produce the strongest, most actionable blueprint using the latest research and code from the sources.
Come up with the best ideas and concrete objectives to complete the task in the best way. Include: core objectives, architecture / step-by-step plan, key technologies with rationale (prefer the newest approaches the sources support), and concrete next actions. Be specific and opinionated, not generic.
Write in Markdown. Cite sources inline as [n]. Keep it under ~500 words. Address critic feedback when provided.`

function systemFor(taskType: TaskType): string {
  return taskType === 'blueprint' ? BLUEPRINT_SYSTEM : RESEARCH_SYSTEM
}

function buildUser(
  query: string,
  sources: Source[],
  feedback: string,
  taskType: TaskType,
): string {
  const sourcesBlock = sources
    .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${s.snippet}`)
    .join('\n')
  const synthPrompt = feedback
    ? `Previous draft was critiqued. Feedback to address: ${feedback}\n\nRevise your ${taskType} accordingly.`
    : taskType === 'blueprint'
      ? 'Produce the first blueprint.'
      : 'Produce your first independent analysis.'
  return `Goal: ${query}\nTask type: ${taskType}\n\nSources:\n${sourcesBlock}\n\n${synthPrompt}`
}

export async function synthesize(
  query: string,
  sources: Source[],
  feedback: string,
  _iteration: number,
  taskType: TaskType = 'research',
): Promise<{ draft: string; mode: 'primary' | 'degraded'; tier: 'primary' | 'local' | 'degraded' }> {
  const result = await llmWithFallback(
    systemFor(taskType),
    buildUser(query, sources, feedback, taskType),
    {
      retries: 2,
      degraded: degradedSynthesis(query, sources),
    },
  )
  return { draft: result.content, mode: result.mode, tier: result.tier }
}
