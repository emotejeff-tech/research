/**
 * agents/critic.ts — The Critic. Inspects the Actor's synthesis for flaws,
 * fallacies, missing edge cases and unsupported claims. Returns a verdict.
 */
import { llm, extractJSON } from '../tools/llm'
import type { Source, CritiqueRound } from '../types'

const CRITIC_SYSTEM =
  'You are the Critic agent in an Actor-Critic research system. Your ONLY job is to find flaws, logical fallacies, missing edge cases, unsupported claims, or source-misattribution in the Actor\'s synthesis. Be rigorous but fair. Return ONLY JSON: {"verdict":"pass"|"revise","issues":["..."],"notes":"..."}. Use "pass" only if the synthesis is accurate, well-cited, and complete.'

export async function critique(
  query: string,
  draft: string,
  sources: Source[],
  iteration: number,
): Promise<CritiqueRound> {
  const sourcesBlock = sources
    .map((s, i) => `[${i + 1}] ${s.title} — ${s.snippet}`)
    .join('\n')
  const raw = await llm(
    CRITIC_SYSTEM,
    `Research goal: ${query}\n\nActor's synthesis (iteration ${iteration}):\n${draft}\n\nSources provided:\n${sourcesBlock}`,
  )
  const parsed = extractJSON<{ verdict?: string; issues?: string[]; notes?: string }>(raw)
  return {
    iteration,
    verdict: parsed?.verdict === 'pass' ? 'pass' : parsed?.verdict === 'revise' ? 'revise' : 'pass',
    issues: Array.isArray(parsed?.issues) ? parsed!.issues : [],
    notes: parsed?.notes || 'Critic returned unparseable output; defaulting to pass.',
  }
}
