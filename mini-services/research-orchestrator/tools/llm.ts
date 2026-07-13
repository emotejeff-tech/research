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
import { getLocalLLMConfig, getPlanningModelConfig, isLocalTierActive, isLocalPrimary } from './settings'
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
  useJsonMode?: boolean,
): Promise<string> {
  // If local is set as primary, use it directly with retries (skip Z.ai config requirement).
  if (isLocalPrimary()) {
    // Check if this is a planning/discovery call — use the lightweight planning model if configured
    const planningConfig = getPlanningModelConfig()
    const isPlanningCall = systemPrompt.includes('Coordinator') || systemPrompt.includes('Planner') || systemPrompt.includes('Decompose')

    let lastErr: any
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (isPlanningCall && planningConfig) {
          // Use the lightweight planning model
          return await localLLMWithModel(systemPrompt, userPrompt, planningConfig.baseURL, planningConfig.model, useJsonMode)
        }
        return await localLLM(systemPrompt, userPrompt, useJsonMode)
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
/**
 * Call a local model with a specific endpoint+model (for hybrid routing).
 * Used by the planning model shortcut.
 */
async function localLLMWithModel(
  systemPrompt: string,
  userPrompt: string,
  baseURL: string,
  model: string,
  useJsonMode?: boolean,
): Promise<string> {
  const config = getLocalLLMConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOCAL_LLM_TIMEOUT_MS)

  const requestBody: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: false,
    options: {
      num_ctx: config.maxContextTokens,
      temperature: config.temperature,
    },
  }

  const shouldUseJson = useJsonMode ?? config.jsonMode
  if (shouldUseJson) {
    requestBody.response_format = { type: 'json_object' }
  }

  try {
    const res = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`planning model HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    }
    const data: any = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (content && content.trim().length > 0) return content.trim()
    throw new Error('Empty planning model response')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Local LLM call with JSON mode support + heartbeat + smart retry.
 * When useJsonMode is true, adds response_format: { type: 'json_object' }
 * so the model returns valid JSON (critical for Critic, Evolution, Planner).
 *
 * Includes:
 *  - Heartbeat callback every 10s (so UI doesn't look frozen during long generation)
 *  - Smart retry: if first call returns non-JSON when JSON was expected, retry with simplified prompt
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

  // Smart retry: if JSON was expected but response isn't valid JSON, retry with a simplified prompt
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
  config: { baseURL: string; apiKey: string; model: string; maxContextTokens: number; temperature: number },
  systemPrompt: string,
  userPrompt: string,
  useJsonMode: boolean,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOCAL_LLM_TIMEOUT_MS)

  // Heartbeat: log every 10s so the orchestrator console shows the model is still working
  const heartbeat = setInterval(() => {
    console.log(`[llm] model "${config.model}" still generating... (${new Date().toLocaleTimeString()})`)
  }, 10000)

  const requestBody: any = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: false,
    options: {
      num_ctx: config.maxContextTokens,
      temperature: config.temperature,
    },
  }

  if (useJsonMode) {
    requestBody.response_format = { type: 'json_object' }
  }

  try {
    const res = await fetch(`${config.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
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
 * If the user set a local provider as PRIMARY (in Settings), use it first.
 * Otherwise: Z.ai cloud → local → degraded.
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

  // If local provider is set as PRIMARY, try it with retries (skip Z.ai entirely).
  if (isLocalPrimary()) {
    let lastErr: any
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const content = await localLLM(systemPrompt, userPrompt, useJson)
        return { content, mode: 'primary', tier: 'local' }
      } catch (e) {
        lastErr = e
        console.error(`[llm] local primary attempt ${attempt + 1}/${retries + 1} failed:`, (e as Error)?.message)
        if (attempt < retries) await sleep(2000 * (attempt + 1))
      }
    }
    console.error('[llm] local primary exhausted after retries — falling to degraded.')
    // Don't try Z.ai — it's not configured. Go straight to degraded.
    return { content: opts.degraded || '', mode: 'degraded', tier: 'degraded' }
  }

  // Tier 1 — Z.ai cloud gateway.
  try {
    const content = await llm(systemPrompt, userPrompt, retries)
    return { content, mode: 'primary', tier: 'primary' }
  } catch (e) {
    console.error(
      '[llm] tier1 (zai cloud) exhausted — stepping down:',
      (e as Error)?.message,
    )
  }

  // Tier 2 — local/remote model (only if not already tried as primary).
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
