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
import { getLocalLLMConfig, isLocalTierActive, isLocalPrimary } from './settings'
import type { LLMResult, Source } from '../types'

export { extractJSON }

// ---------- Tier configuration ----------
const LOCAL_LLM_TIMEOUT_MS = 120000 // 120s — local models can be VERY slow (first load, large context)

// ---------- Tier 1: primary (z-ai cloud, or local if set as primary) ----------
/** Primary LLM call with exponential-backoff retries. Throws on total failure.
 * If the user set a local provider as PRIMARY in Settings, uses that instead of Z.ai.
 */
export async function llm(
  systemPrompt: string,
  userPrompt: string,
  retries = 2,
): Promise<string> {
  // If local is set as primary, use it directly with retries (skip Z.ai config requirement).
  if (isLocalPrimary()) {
    let lastErr: any
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await localLLM(systemPrompt, userPrompt)
      } catch (e) {
        lastErr = e
        console.error(`[llm] local attempt ${attempt + 1}/${retries + 1} failed:`, (e as Error)?.message)
        if (attempt < retries) await sleep(1000 * (attempt + 1))
      }
    }
    throw lastErr
  }

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

// ---------- Tier 2: local model (Ollama / LM Studio / OpenRouter / llama.cpp) ----------
/**
 * Attempts a local or remote OpenAI-compatible inference endpoint, using the
 * provider settings configured via the UI (or env vars as fallback). Returns
 * the text on success, or throws if unconfigured / unreachable / empty.
 * Designed to fail fast (LOCAL_LLM_TIMEOUT_MS) so the pipeline moves on.
 */
export async function localLLM(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const config = getLocalLLMConfig()
  if (!config.baseURL) {
    throw new Error('No local LLM configured — set a provider in Settings')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOCAL_LLM_TIMEOUT_MS)
  try {
    const res = await fetch(`${config.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      if (res.status === 404) {
        throw new Error(`model "${config.model}" not found (HTTP 404). Run: ollama list — to see installed models, or: ollama pull ${config.model}`)
      }
      throw new Error(`local LLM HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    }
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
 * If the user set a local provider as PRIMARY (in Settings), use it first.
 * Otherwise: Z.ai cloud → local → degraded.
 * Complexity controls retry count (simple=1, standard=2, heavy=3).
 */
export async function llmWithFallback(
  systemPrompt: string,
  userPrompt: string,
  opts: { retries?: number; degraded?: string; complexity?: TaskComplexity } = {},
): Promise<LLMResult> {
  const complexity = opts.complexity || 'standard'
  const retries = opts.retries ?? (complexity === 'simple' ? 1 : complexity === 'heavy' ? 3 : 2)

  // If local provider is set as PRIMARY, try it first (skip Z.ai entirely).
  if (isLocalPrimary()) {
    try {
      const content = await localLLM(systemPrompt, userPrompt)
      return { content, mode: 'primary', tier: 'local' }
    } catch (e) {
      console.error('[llm] local primary failed:', (e as Error)?.message)
      // Fall through to Z.ai as a secondary fallback.
    }
  }

  // Tier 1 — Z.ai cloud gateway (skipped if local is primary and succeeded).
  try {
    const content = await llm(systemPrompt, userPrompt, retries)
    return { content, mode: 'primary', tier: 'primary' }
  } catch (e) {
    console.error(
      '[llm] tier1 (zai cloud) exhausted — stepping down:',
      (e as Error)?.message,
    )
  }

  // Tier 2 — local/remote model (Ollama / LM Studio / OpenRouter / llama.cpp).
  // Only attempted if enabled + configured (and not already tried as primary).
  if (isLocalTierActive() && !isLocalPrimary()) {
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
