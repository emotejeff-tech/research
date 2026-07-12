/**
 * agents/devils_advocate.ts — The Devil's Advocate.
 *
 * A cross-agent peer reviewer that runs BEFORE the formal Critic. It
 * specifically tries to find logical fallacies and break the Synthesizer's
 * logic. If it finds fatal flaws, they're fed to the Actor as additional
 * feedback before the Critic even runs — saving a full critique iteration.
 */
import { llm, extractJSON } from '../tools/llm'
import type { Source } from '../types'

const DEVILS_SYSTEM = `You are the Devil's Advocate — a ruthless cross-agent peer reviewer. Your job is to BREAK the Synthesizer's logic before the formal Critic reviews it.

Attack the analysis from every angle:
- Find logical fallacies (circular reasoning, false dichotomies, hasty generalizations, cherry-picking).
- Identify unstated assumptions that could invalidate the conclusion.
- Find the weakest link in the reasoning chain and try to snap it.
- Propose the strongest counterargument the analysis fails to address.

Return ONLY JSON: {"fatalFlaws":["..."],"weaknesses":["..."],"strongestCounter":"..."}. If the logic is sound, return empty arrays and a counter that's already addressed.`

export interface DevilsAdvocateResult {
  fatalFlaws: string[]
  weaknesses: string[]
  strongestCounter: string
}

export async function devilsAdvocate(
  query: string,
  draft: string,
  sources: Source[],
): Promise<DevilsAdvocateResult> {
  const sourcesBlock = sources
    .slice(0, 6)
    .map((s, i) => `[${i + 1}] ${s.title} — ${s.snippet.slice(0, 100)}`)
    .join('\n')
  const raw = await llm(
    DEVILS_SYSTEM,
    `Goal: ${query}\n\nSynthesizer's draft:\n${draft}\n\nSources:\n${sourcesBlock}\n\nBreak the logic. Return the JSON.`,
  )
  const parsed = extractJSON<{
    fatalFlaws?: string[]
    weaknesses?: string[]
    strongestCounter?: string
  }>(raw)
  return {
    fatalFlaws: Array.isArray(parsed?.fatalFlaws) ? parsed!.fatalFlaws : [],
    weaknesses: Array.isArray(parsed?.weaknesses) ? parsed!.weaknesses : [],
    strongestCounter: parsed?.strongestCounter || '',
  }
}
