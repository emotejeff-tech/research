/**
 * agents/critic.ts — The Critic. Inspects the Actor's synthesis for flaws.
 *
 * Mode-aware criteria:
 *  - 'research':  flag hedging, non-conclusions, narrative/wording adoption,
 *    non-primary data, missing logic chain, unsupported claims.
 *  - 'blueprint': flag vague/non-actionable objectives, missing architecture,
 *    outdated tech, missing concrete next actions, unsupported claims.
 */
import { llm, extractJSON } from '../tools/llm'
import type { Source, CritiqueRound, TaskType } from '../types'

const RESEARCH_SYSTEM = `You are the Critic agent in an Actor-Critic research system. Your ONLY job is to find flaws in the Actor's INDEPENDENT RESEARCH ANALYSIS. Check specifically for:
- Hedging or non-conclusions (e.g. "some say X, others say Y" without a verdict) — FLAG.
- Adoption of outside narrative / framing / wording instead of independent analysis — FLAG.
- Reliance on non-primary data (opinion, editorial, corporate PR, internet consensus) presented as fact — FLAG.
- Missing step-by-step logic, or failure to compare opposing data points by strength of evidence — FLAG.
- Unsupported claims not traceable to a cited source, or logical fallacies — FLAG.
Be rigorous but fair. Return ONLY JSON: {"verdict":"pass"|"revise","issues":["..."],"notes":"..."}. Use "pass" ONLY if the analysis is accurate, well-cited, forms a DEFINITIVE independent conclusion, and shows its reasoning.`

const BLUEPRINT_SYSTEM = `You are the Critic agent in an Actor-Critic research system. Your ONLY job is to find flaws in the Actor's BLUEPRINT. Check specifically for:
- Vague or non-actionable objectives — FLAG.
- Missing architecture or step-by-step plan — FLAG.
- Outdated technologies or approaches when the sources show better/newer ones — FLAG.
- Lack of concrete next actions or code-level specifics — FLAG.
- Unsupported claims not traceable to a cited source — FLAG.
Be rigorous but fair. Return ONLY JSON: {"verdict":"pass"|"revise","issues":["..."],"notes":"..."}. Use "pass" ONLY if the blueprint is concrete, modern, well-cited, and actionable.`

function systemFor(taskType: TaskType): string {
  return taskType === 'blueprint' ? BLUEPRINT_SYSTEM : RESEARCH_SYSTEM
}

export async function critique(
  query: string,
  draft: string,
  sources: Source[],
  iteration: number,
  taskType: TaskType = 'research',
): Promise<CritiqueRound> {
  const sourcesBlock = sources
    .map((s, i) => `[${i + 1}] ${s.title} — ${s.snippet}`)
    .join('\n')
  const raw = await llm(
    systemFor(taskType),
    `Goal: ${query}\nTask type: ${taskType}\n\nActor's ${taskType} (iteration ${iteration}):\n${draft}\n\nSources provided:\n${sourcesBlock}`,
  )
  const parsed = extractJSON<{ verdict?: string; issues?: string[]; notes?: string }>(raw)
  return {
    iteration,
    verdict: parsed?.verdict === 'pass' ? 'pass' : parsed?.verdict === 'revise' ? 'revise' : 'pass',
    issues: Array.isArray(parsed?.issues) ? parsed!.issues : [],
    notes: parsed?.notes || 'Critic returned unparseable output; defaulting to pass.',
  }
}
