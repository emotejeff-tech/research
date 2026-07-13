/**
 * agents/hypothesis_engine.ts — The Hypothesis Engine.
 *
 * Before initiating a search, this generates three mutually exclusive
 * hypotheses about the research question. The Researcher is then tasked
 * to find data that DISPROVES each one — violently neutralizing
 * confirmation bias.
 */
import { llm, extractJSON } from '../tools/llm'

const SYSTEM = `You are the Hypothesis Engine. Given a research question, generate exactly THREE mutually exclusive hypotheses — predictions that CANNOT all be true simultaneously. Each hypothesis should represent a distinct, defensible position that a reasonable expert might hold.

Then, for each hypothesis, write a "disproof query" — a web search query specifically designed to find evidence that CONTRADICTS that hypothesis (not confirms it).

Return ONLY JSON: {"hypotheses":[{"statement":"...","disproofQuery":"..."},{"statement":"...","disproofQuery":"..."},{"statement":"...","disproofQuery":"..."}]}`

export interface Hypothesis {
  statement: string
  disproofQuery: string
  /** Whether the disproof search found contradicting evidence. */
  disproven?: boolean
  /** Evidence found against the hypothesis. */
  disproofEvidence?: string
}

export async function generateHypotheses(query: string): Promise<Hypothesis[]> {
  const raw = await llm(SYSTEM, `Research question: ${query}\n\nGenerate 3 mutually exclusive hypotheses with disproof queries.`, 2, true)
  const parsed = extractJSON<{ hypotheses?: Hypothesis[] }>(raw)
  if (Array.isArray(parsed?.hypotheses)) {
    return parsed!.hypotheses.slice(0, 3).map((h) => ({
      statement: h.statement || '',
      disproofQuery: h.disproofQuery || '',
    }))
  }
  return []
}
