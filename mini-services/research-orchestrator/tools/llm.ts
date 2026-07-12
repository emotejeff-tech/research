/**
 * tools/llm.ts — Language model client with a model fallback pipeline.
 *
 * Step 4 of the blueprint ("Local Fallback Setup"): when the primary LLM
 * exhausts retries (402 / credits / rate-limit / network), we never freeze
 * the run. `llmWithFallback` returns a degraded result instead, and
 * `degradedSynthesis` compiles a structured, sourced report directly from
 * the gathered web snippets — no LLM required.
 */
import { getZAI } from './sdk'
import { sleep, extractJSON } from '../util'
import type { LLMResult, Source } from '../types'

export { extractJSON }

/** Primary LLM call with exponential-backoff retries. Throws on total failure. */
export async function llm(
  systemPrompt: string,
  userPrompt: string,
  retries = 2,
): Promise<string> {
  let lastErr: any
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const sdk = await getZAI()
      const completion = await sdk.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        thinking: { type: 'disabled' },
      })
      const content = completion?.choices?.[0]?.message?.content
      if (content && content.trim().length > 0) return content.trim()
      throw new Error('Empty LLM response')
    } catch (e) {
      lastErr = e
      console.error(
        `[llm] attempt ${attempt + 1}/${retries + 1} failed:`,
        (e as Error)?.message,
      )
      if (attempt < retries) await sleep(800 * (attempt + 1))
    }
  }
  throw lastErr
}

/**
 * Model fallback pipeline (Step 4).
 * Primary: z-ai LLM with retries.
 * Fallback: returns `opts.degraded` with mode='degraded' so the caller can
 * continue the run without a working LLM.
 */
export async function llmWithFallback(
  systemPrompt: string,
  userPrompt: string,
  opts: { retries?: number; degraded?: string } = {},
): Promise<LLMResult> {
  try {
    const content = await llm(systemPrompt, userPrompt, opts.retries)
    return { content, mode: 'primary' }
  } catch (e) {
    console.error(
      '[llm] primary model exhausted — entering degraded mode:',
      (e as Error)?.message,
    )
    return { content: opts.degraded || '', mode: 'degraded' }
  }
}

/**
 * No-LLM structured synthesis. Compiles gathered sources into a cited
 * Markdown report grouped by discovery branch. Used when the LLM is
 * unavailable so the user still receives a sourced deliverable.
 */
export function degradedSynthesis(query: string, sources: Source[]): string {
  if (sources.length === 0) {
    return `# ${query}\n\n> ⚠️ **Degraded mode:** the primary language model was unavailable and no web sources could be retrieved. Please retry once model access is restored.`
  }
  const byQuery = new Map<string, Source[]>()
  for (const s of sources) {
    if (!byQuery.has(s.query)) byQuery.set(s.query, [])
    byQuery.get(s.query)!.push(s)
  }
  let md = `# ${query}\n\n`
  md += `> ⚠️ **Degraded mode:** the primary language model was unavailable (credits exhausted or rate-limited). This report was compiled directly from live web sources without LLM synthesis. Verify all details against the cited links.\n\n`
  md += `## Evidence by discovery branch\n\n`
  let i = 1
  for (const [q, srcs] of byQuery) {
    md += `### ${q}\n\n`
    for (const s of srcs) {
      md += `- **[${i}] [${s.title}](${s.url})** — *${s.host}*\n  ${s.snippet}\n\n`
      i++
    }
  }
  md += `\n---\n*Compiled from ${sources.length} sources across ${byQuery.size} discovery branches in degraded mode.*`
  return md
}
