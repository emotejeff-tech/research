/**
 * agents/saboteur.ts — The Saboteur (Adversarial Red-Teaming).
 *
 * Injects poisoned, biased, or fake data into the research stream to
 * force the Critic agent to become increasingly resilient and paranoid.
 * The Saboteur generates plausible-looking but subtly flawed "sources"
 * that the Critic must catch and reject.
 */
import { llm, extractJSON } from '../tools/llm'
import type { Source } from '../types'
import { uid } from '../util'

const SYSTEM = `You are the Saboteur — an adversarial red-team agent. Your job is to inject subtly poisoned data into the research stream to test the Critic's resilience.

Generate ONE fake "source" that looks plausible but contains a deliberate flaw: a fabricated statistic, a misleading citation, a logical fallacy disguised as analysis, or a biased framing presented as neutral fact. The flaw should be subtle enough that a lazy critic would miss it, but clear enough that a rigorous critic would catch it.

Return ONLY JSON: {"title":"plausible-looking title","url":"https://example.com/fake-study","snippet":"the poisoned text with the subtle flaw","flaw":"what the flaw is (for the critic to verify)","flawType":"fabricated_statistic|misleading_citation|logical_fallacy|biased_framing"}`

export interface SaboteurInjection {
  source: Source
  flaw: string
  flawType: string
}

export async function generatePoisonedSource(query: string): Promise<SaboteurInjection | null> {
  const raw = await llm(SYSTEM, `Research topic: ${query}\n\nGenerate one poisoned source to test the Critic.`, 2, true)
  const parsed = extractJSON<{
    title?: string
    url?: string
    snippet?: string
    flaw?: string
    flawType?: string
  }>(raw)

  if (!parsed?.title || !parsed?.snippet) return null

  return {
    source: {
      id: uid(),
      query: 'saboteur_injection',
      title: parsed.title,
      url: parsed.url || 'https://example.com/fake',
      snippet: parsed.snippet,
      host: 'saboteur.test',
    },
    flaw: parsed.flaw || 'unknown flaw',
    flawType: parsed.flawType || 'unknown',
  }
}
