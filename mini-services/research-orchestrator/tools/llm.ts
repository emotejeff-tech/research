/**
 * tools/llm.ts — Multi-tier language model pipeline with robust local fallback.
 *
 * Topology:
 *   Tier 1 — local-first: Ollama / LM Studio / llama.cpp / custom OpenAI-compatible
 *   Tier 2 — cloud fallback: user's configured provider (OpenRouter/Anthropic/etc.)
 *   Tier 3 — degraded: no-LLM structured snippet compilation
 *
 * Key improvements for local LLM support:
 *   - Ollama direct mode (no /v1 prefix needed)
 *   - Better timeout handling with AbortController
 *   - JSON response support via prompt engineering (not response_format, which local endpoints reject)
 *   - Smart retry with simplified prompts for JSON
 *   - Graceful degradation when all tiers fail
 *   - Warmup for local models to preload into VRAM
 */
import { getZAI } from './sdk'
import { sleep, extractJSON } from '../util'
import { getLocalLLMConfig, getPlanningModelConfig, isLocalTierActive, isLocalPrimary } from './settings'
import type { LLMResult, Source } from '../types'

export { extractJSON }

// ---------- Configuration ----------
const LOCAL_LLM_TIMEOUT_MS = 300000 // 300s — local models can be VERY slow
const LOCAL_LLM_RETRY_BACKOFF = 3000 // ms between retries
const LOCAL_LLM_HEARTBEAT_MS = 15000 // ms — log heartbeat every 15s
const LOCAL_LLM_WARMUP_TIMEOUT_MS = 10000 // ms — startup warmup should not block forever

// ---------- Tier 1: primary (configured provider or local) ----------
/** Primary LLM call with exponential-backoff retries.
 * If local is set as PRIMARY, use it directly. Otherwise use the configured
 * cloud provider (Z.ai by default).
 */
export async function llm(
  systemPrompt: string,
  userPrompt: string,
  retries = 2,
  useJsonMode?: boolean,
): Promise<string> {
  // If local is set as primary, use it directly with retries.
  if (isLocalPrimary()) {
    let lastErr: any
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await localLLM(systemPrompt, userPrompt, useJsonMode)
      } catch (e) {
        lastErr = e
        console.error(`[llm] local primary attempt ${attempt + 1}/${retries + 1} failed:`, (e as Error)?.message)
        if (attempt < retries) await sleep(LOCAL_LLM_RETRY_BACKOFF * (attempt + 1))
      }
    }
    throw lastErr
  }

  // Otherwise use the configured cloud provider.
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
        `[llm] cloud attempt ${attempt + 1}/${retries + 1} failed:`,
        (e as Error)?.message,
      )
      if (attempt < retries) await sleep(800 * (attempt + 1))
    }
  }
  throw lastErr
}

// ---------- Tier 2: local model (Ollama / LM Studio / llama.cpp / custom) ----------
/**
 * Attempts a local or remote OpenAI-compatible inference endpoint.
 * Designed to fail fast with clear error messages.
 */
async function localLLMWithModel(
  systemPrompt: string,
  userPrompt: string,
  baseURL: string,
  model: string,
  useJsonMode?: boolean,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOCAL_LLM_TIMEOUT_MS)

  const requestBody: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: false,
    temperature: 0.7,
  }

  // Note: JSON mode uses prompt engineering + smart retry instead of response_format,
  // since many local endpoints (Ollama, LM Studio) don't support OpenAI's json_object format.

  try {
    const res = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`local model HTTP ${res.status}: ${errBody.slice(0, 300)}`)
    }

    const data: any = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (content && content.trim().length > 0) return content.trim()
    throw new Error('Empty local model response')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Local LLM call with JSON mode support + heartbeat + smart retry.
 * When useJsonMode is true, relies on prompt engineering to extract valid JSON
 * (critical for Critic, Evolution, Planner).
 *
 * Includes:
 *  - Heartbeat callback every 15s (so UI doesn't look frozen during long generation)
 *  - Smart retry: if JSON was expected but response isn't valid JSON, retry with
 *    a simplified prompt
 *  - Ollama direct mode (no /v1 prefix needed)
 */
export async function localLLM(
  systemPrompt: string,
  userPrompt: string,
  useJsonMode?: boolean,
): Promise<string> {
  const config = getLocalLLMConfig()
  if (!config.baseURL) {
    throw new Error('No local LLM configured — set a provider in Settings')
  }

  const shouldUseJson = useJsonMode ?? config.jsonMode

  // First attempt with full prompt
  let result = await callLocalModel(config, systemPrompt, userPrompt, shouldUseJson)

  // Smart retry: if JSON was expected but response isn't valid JSON, retry
  // with a simplified prompt. This is critical for local models that don't
  // respect response_format reliably.
  if (shouldUseJson && result) {
    const { extractJSON } = await import('../util')
    if (!extractJSON(result)) {
      console.warn('[llm] response was not valid JSON — retrying with simplified prompt...')
      const simplifiedSystem = 'Return ONLY a valid JSON object. No markdown, no explanation, no code fences. Just raw JSON.'
      const simplifiedUser = `${systemPrompt}\n\n${userPrompt}\n\nRespond with ONLY the JSON object.`
      const retryResult = await callLocalModel(config, simplifiedSystem, simplifiedUser, true)
      if (retryResult) {
        if (extractJSON(retryResult)) {
          return retryResult
        }
      }
      // Return original even if not JSON — the caller has fallback parsing
    }
  }

  return result
}

/** Core function that makes the actual HTTP call to the local model. */
async function callLocalModel(
  config: { baseURL: string; apiKey: string; model: string; maxContextTokens: number; temperature: number; jsonMode: boolean },
  systemPrompt: string,
  userPrompt: string,
  useJsonMode: boolean,
  timeoutMs = LOCAL_LLM_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  // Heartbeat: log every 15s so the orchestrator console shows the model is still working
  const heartbeat = setInterval(() => {
    console.log(`[llm] model "${config.model}" still generating... (${new Date().toLocaleTimeString()})`)
  }, LOCAL_LLM_HEARTBEAT_MS)

  const requestBody: any = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: false,
    temperature: config.temperature,
    max_tokens: Math.min(config.maxContextTokens, 4096),
  }

  // Note: JSON mode handled via prompt engineering + smart retry, not response_format.
  // Local endpoints (Ollama, LM Studio, llama.cpp) often reject OpenAI's json_object format.

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`

    const res = await fetch(`${config.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      if (res.status === 404) {
        throw new Error(`model "${config.model}" not found. Run: ollama list — to see installed models, or: ollama pull ${config.model}`)
      }
      throw new Error(`local LLM HTTP ${res.status}: ${errBody.slice(0, 300)}`)
    }

    const data: any = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (content && content.trim().length > 0) return content.trim()
    throw new Error('Empty local LLM response')
  } finally {
    clearTimeout(timer)
    clearInterval(heartbeat)
  }
}

/** Warmup: send a tiny prompt to pre-load the model into VRAM. */
export async function warmupLocalModel(): Promise<boolean> {
  if (!isLocalPrimary()) return false
  try {
    console.log('[llm] warming up local model (pre-loading into VRAM)...')
    await callLocalModel(
      getLocalLLMConfig(),
      'You are a test. Respond with "OK".',
      'Say OK.',
      false,
      LOCAL_LLM_WARMUP_TIMEOUT_MS,
    )
    console.log('[llm] model warmup complete — first query will be fast.')
    return true
  } catch (e) {
    console.warn('[llm] warmup failed (model may still be loading):', (e as Error)?.message)
    return false
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
 * If the user set a local provider as PRIMARY, use it first.
 * Otherwise: configured provider → local → degraded.
 * Complexity controls retry count (simple=1, standard=2, heavy=3).
 */
export async function llmWithFallback(
  systemPrompt: string,
  userPrompt: string,
  opts: { retries?: number; degraded?: string; complexity?: TaskComplexity; useJsonMode?: boolean } = {},
): Promise<LLMResult> {
  const complexity = opts.complexity || 'standard'
  const retries = opts.retries ?? (complexity === 'simple' ? 1 : complexity === 'heavy' ? 3 : 2)
  const useJson = opts.useJsonMode

  // If local provider is set as PRIMARY, try it with retries (skip cloud entirely).
  if (isLocalPrimary()) {
    let lastErr: any
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const content = await localLLM(systemPrompt, userPrompt, useJson)
        return { content, mode: 'primary', tier: 'local' }
      } catch (e) {
        lastErr = e
        console.error(`[llm] local primary attempt ${attempt + 1}/${retries + 1} failed:`, (e as Error)?.message)
        if (attempt < retries) await sleep(LOCAL_LLM_RETRY_BACKOFF * (attempt + 1))
      }
    }
    console.error('[llm] local primary exhausted after retries — falling to degraded.')
    // Don't try cloud — it's not configured. Go straight to degraded.
    return { content: opts.degraded || '', mode: 'degraded', tier: 'degraded' }
  }

  // Tier 1 — configured cloud provider.
  try {
    const content = await llm(systemPrompt, userPrompt, retries, useJson)
    return { content, mode: 'primary', tier: 'primary' }
  } catch (e) {
    console.error(
      '[llm] tier1 (cloud) exhausted — stepping down:',
      (e as Error)?.message,
    )
  }

  // Tier 2 — local model (only if not already tried as primary).
  if (isLocalTierActive()) {
    try {
      const content = await localLLM(systemPrompt, userPrompt, useJson)
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
