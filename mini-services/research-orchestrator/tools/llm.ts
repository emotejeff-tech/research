/**
 * tools/llm.ts — Multi-tier language model pipeline.
 *
 * Topology (Step 4 "Local Fallback Setup", refined to a 3-tier pipeline):
 *   Tier 1 — primary:   z-ai-web-dev-sdk cloud gateway (with retry + backoff)
 *   Tier 2 — local:     OpenAI-compatible local model (Ollama / LM Studio),
 *                       env-gated via LOCAL_LLM_BASE_URL. Skipped fast when
 *                       unconfigured or unreachable so runs never stall.
 *   Tier 3 — degraded:  no-LLM structured snippet compilation.
 *
 * If premium third-party keys hit 402 / credit-exhaustion, the engine steps
 * down to the local tier, and only if that is also unavailable does it fall
 * to the degraded no-LLM path — execution never halts.
 */
import { getZAI } from './sdk'
import { sleep, extractJSON } from '../util'
import type { LLMResult, Source } from '../types'

export { extractJSON }

// ---------- Tier configuration ----------
const LOCAL_LLM_BASE_URL = process.env.LOCAL_LLM_BASE_URL || '' // e.g. http://localhost:11434/v1
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'qwen2.5:7b'
const LOCAL_LLM_KEY = process.env.LOCAL_LLM_KEY || 'ollama'
const LOCAL_LLM_TIMEOUT_MS = 4000 // fast-fail so we never stall on a dead endpoint

// ---------- Tier 1: primary (z-ai cloud) ----------
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
        `[llm] tier1 attempt ${attempt + 1}/${retries + 1} failed:`,
        (e as Error)?.message,
      )
      if (attempt < retries) await sleep(800 * (attempt + 1))
    }
  }
  throw lastErr
}

// ---------- Tier 2: local model (Ollama / LM Studio, OpenAI-compatible) ----------
/**
 * Attempts a local OpenAI-compatible inference endpoint. Returns the text on
 * success, or throws if unconfigured / unreachable / empty. Designed to fail
 * fast (LOCAL_LLM_TIMEOUT_MS) so the pipeline moves on without stalling.
 */
export async function localLLM(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (!LOCAL_LLM_BASE_URL) {
    throw new Error('LOCAL_LLM_BASE_URL not configured')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOCAL_LLM_TIMEOUT_MS)
  try {
    const res = await fetch(`${LOCAL_LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LOCAL_LLM_KEY}`,
      },
      body: JSON.stringify({
        model: LOCAL_LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`local LLM HTTP ${res.status}`)
    const data: any = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (content && content.trim().length > 0) return content.trim()
    throw new Error('Empty local LLM response')
  } finally {
    clearTimeout(timer)
  }
}

// ---------- Tiered pipeline orchestrator ----------
/**
 * Task complexity levels for tiered fallback granularity.
 * - 'simple': tool selection, classification → fewer retries (lightweight).
 * - 'standard': planning, critique → normal retries.
 * - 'heavy': synthesis, dreamer → max retries (reserve for quality).
 */
export type TaskComplexity = 'simple' | 'standard' | 'heavy'

/** Multi-tier fallback pipeline: primary → local → degraded.
 * Returns the first tier that succeeds, with its tier identity recorded.
 * Complexity controls retry count (simple=1, standard=2, heavy=3).
 */
export async function llmWithFallback(
  systemPrompt: string,
  userPrompt: string,
  opts: { retries?: number; degraded?: string; complexity?: TaskComplexity } = {},
): Promise<LLMResult> {
  const complexity = opts.complexity || 'standard'
  const retries = opts.retries ?? (complexity === 'simple' ? 1 : complexity === 'heavy' ? 3 : 2)
  // Tier 1 — primary cloud gateway.
  try {
    const content = await llm(systemPrompt, userPrompt, retries)
    return { content, mode: 'primary', tier: 'primary' }
  } catch (e) {
    console.error(
      '[llm] tier1 (primary) exhausted — stepping down:',
      (e as Error)?.message,
    )
  }

  // Tier 2 — local model (Ollama / LM Studio). Only attempted if configured.
  if (LOCAL_LLM_BASE_URL) {
    try {
      const content = await localLLM(systemPrompt, userPrompt)
      console.warn('[llm] tier2 (local) served the request — primary was unavailable.')
      return { content, mode: 'primary', tier: 'local' }
    } catch (e) {
      console.error(
        '[llm] tier2 (local) failed — stepping down to degraded:',
        (e as Error)?.message,
      )
    }
  }

  // Tier 3 — degraded no-LLM fallback.
  console.error('[llm] all inference tiers exhausted — degraded mode.')
  return { content: opts.degraded || '', mode: 'degraded', tier: 'degraded' }
}

/**
 * No-LLM structured synthesis. Compiles gathered sources into a cited
 * Markdown report grouped by discovery branch. Used when every inference
 * tier is unavailable so the user still receives a sourced deliverable.
 */
export function degradedSynthesis(query: string, sources: Source[]): string {
  if (sources.length === 0) {
    return `# ${query}\n\n> ⚠️ **Degraded mode:** all inference tiers were unavailable and no web sources could be retrieved. Please retry once model access is restored.`
  }
  const byQuery = new Map<string, Source[]>()
  for (const s of sources) {
    if (!byQuery.has(s.query)) byQuery.set(s.query, [])
    byQuery.get(s.query)!.push(s)
  }
  let md = `# ${query}\n\n`
  md += `> ⚠️ **Degraded mode:** all inference tiers were unavailable (credits exhausted or rate-limited, and no local model configured). This report was compiled directly from live web sources without LLM synthesis. Verify all details against the cited links.\n\n`
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
