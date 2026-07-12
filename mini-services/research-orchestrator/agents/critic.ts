/**
 * agents/critic.ts — The Critic. Inspects the Actor's synthesis for flaws.
 *
 * Mode-aware criteria:
 *  - 'research':  flag hedging, non-conclusions, narrative/wording adoption,
 *    non-primary data, missing logic chain, unsupported claims.
 *  - 'blueprint': flag vague/non-actionable objectives, missing architecture,
 *    outdated tech, missing concrete next actions, unsupported claims.
 *
 * Uses llmWithFallback so the critic works even if the primary LLM is down.
 * Falls back to a "pass" verdict if all LLM tiers fail (never crashes the run).
 */
import { llmWithFallback, extractJSON } from '../tools/llm'
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

const UPGRADE_SYSTEM = `You are the Critic agent. Review the upgrade report for completeness and accuracy. Return ONLY JSON: {"verdict":"pass"|"revise","issues":["..."],"notes":"..."}.`

function systemFor(taskType: TaskType): string {
  if (taskType === 'blueprint') return BLUEPRINT_SYSTEM
  if (taskType === 'upgrade') return UPGRADE_SYSTEM
  return RESEARCH_SYSTEM
}

export async function critique(
  query: string,
  draft: string,
  sources: Source[],
  iteration: number,
  taskType: TaskType = 'research',
): Promise<CritiqueRound> {
  const sourcesBlock = sources
    .slice(0, 8) // limit to avoid token overflow
    .map((s, i) => `[${i + 1}] ${s.title} — ${s.snippet.slice(0, 100)}`)
    .join('\n')

  // Use llmWithFallback instead of llm — so local models work as fallback.
  const result = await llmWithFallback(
    systemFor(taskType),
    `Goal: ${query}\nTask type: ${taskType}\n\nActor's ${taskType} (iteration ${iteration}):\n${draft.slice(0, 3000)}\n\nSources provided:\n${sourcesBlock}`,
    {
      retries: 2,
      degraded: '{"verdict":"pass","issues":[],"notes":"Critic LLM unavailable — draft accepted without verification (degraded)."}',
      complexity: 'standard',
    },
  )

  // Try to parse JSON from the response.
  const parsed = extractJSON<{ verdict?: string; issues?: string[]; notes?: string }>(result.content)

  if (!parsed) {
    // If the LLM returned non-JSON (common with small local models), try to extract a verdict from the text.
    const text = result.content.toLowerCase()
    let verdict: 'pass' | 'revise' = 'pass'
    if (text.includes('revise') || text.includes('fail') || text.includes('issue') || text.includes('flaw')) {
      verdict = 'revise'
    }
    return {
      iteration,
      verdict,
      issues: [],
      notes: `Critic returned non-JSON output (mode: ${result.mode}). Verdict inferred from text. ${result.content.slice(0, 200)}`,
    }
  }

  return {
    iteration,
    verdict: parsed?.verdict === 'pass' ? 'pass' : parsed?.verdict === 'revise' ? 'revise' : 'pass',
    issues: Array.isArray(parsed?.issues) ? parsed!.issues.slice(0, 5) : [],
    notes: parsed?.notes || 'Critic review complete.',
  }
}
