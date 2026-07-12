/**
 * tools/context_pruner.ts — Dynamic Context Pruning.
 *
 * Prevents context depletion during massive multi-branch runs by summarizing
 * older DAG execution branches before passing them to the next agent. Uses
 * a lightweight token-estimation + extractive summarization (no LLM needed —
 * keeps the first/last sentences + key citations) so it's fast and free.
 */
import type { Source } from '../types'

/** Rough token estimate: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Prune a source list to fit within a token budget. Keeps the most recent
 * sources + the ones with the longest snippets (denser evidence). Returns
 * a compact representation suitable for passing to the next agent.
 */
export function pruneSources(sources: Source[], tokenBudget = 2000): Source[] {
  if (!sources.length) return []
  const totalTokens = sources.reduce((sum, s) => sum + estimateTokens(s.snippet), 0)
  if (totalTokens <= tokenBudget) return sources

  // Score each source by snippet density (longer = more data).
  const scored = sources.map((s, i) => ({ s, i, score: s.snippet.length }))
  scored.sort((a, b) => b.score - a.score)

  let usedTokens = 0
  const kept: Source[] = []
  for (const { s } of scored) {
    const t = estimateTokens(s.snippet)
    if (usedTokens + t > tokenBudget) break
    kept.push(s)
    usedTokens += t
  }
  // Restore original order.
  kept.sort((a, b) => sources.indexOf(a) - sources.indexOf(b))
  return kept
}

/**
 * Summarize an execution branch (sub-query + its sources) into a compact
 * digest. Extracts the top keywords + first sentence of each source.
 */
export function summarizeBranch(subQuery: string, sources: Source[]): string {
  const top = sources.slice(0, 3)
  const lines = top.map((s) => `- ${s.title}: ${s.snippet.split('.')[0]}.`)
  return `Branch "${subQuery}" (${sources.length} sources):\n${lines.join('\n')}`
}

/**
 * Build a compact execution digest from all branches — used to pass context
 * to downstream agents without depleting the token budget.
 */
export function buildExecutionDigest(
  subQueries: string[],
  sources: Source[],
  tokenBudget = 3000,
): string {
  const branches = subQueries.map((sq) => {
    const branchSources = sources.filter((s) => s.query === sq)
    return summarizeBranch(sq, branchSources)
  })
  let digest = branches.join('\n\n')
  // If still too long, truncate to budget.
  if (estimateTokens(digest) > tokenBudget) {
    const charBudget = tokenBudget * 4
    digest = digest.slice(0, charBudget) + '\n…[pruned]'
  }
  return digest
}
