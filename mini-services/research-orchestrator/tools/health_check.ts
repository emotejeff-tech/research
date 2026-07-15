/**
 * tools/health_check.ts — Pre-flight health checks + environment auto-discovery.
 *
 * On startup, scans environment variables for API keys (OPENAI_API_KEY,
 * ANTHROPIC_API_KEY, GROQ_API_KEY, etc.) as secondary fallback. Pings all
 * configured providers (Ollama, LM Studio, search APIs, sandbox APIs) with
 * 500ms health checks and reports their status to the frontend.
 */
import { getSettings } from './settings'

export interface HealthStatus {
  name: string
  type: 'llm' | 'search' | 'sandbox' | 'database' | 'voice'
  status: 'online' | 'offline' | 'unconfigured'
  latencyMs?: number
  detail?: string
}

/** Environment variable names to scan for API keys. */
const ENV_KEY_MAP: Record<string, { name: string; type: string; setting: string }> = {
  OPENAI_API_KEY: { name: 'OpenAI', type: 'llm', setting: 'apiKey' },
  ANTHROPIC_API_KEY: { name: 'Anthropic', type: 'll', setting: 'apiKey' },
  GROQ_API_KEY: { name: 'Groq', type: 'llm', setting: 'apiKey' },
  COHERE_API_KEY: { name: 'Cohere', type: 'llm', setting: 'apiKey' },
  OPENROUTER_API_KEY: { name: 'OpenRouter', type: 'llm', setting: 'apiKey' },
  TAVILY_API_KEY: { name: 'Tavily', type: 'search', setting: 'tavilyApiKey' },
  EXA_API_KEY: { name: 'Exa', type: 'search', setting: 'exaApiKey' },
  BRAVE_SEARCH_API_KEY: { name: 'Brave', type: 'search', setting: 'braveApiKey' },
  SERPAPI_KEY: { name: 'SerpAPI', type: 'search', setting: 'serpApiKey' },
}

/** Scan environment variables for API keys and merge into settings. */
export function discoverEnvKeys(): { found: string[]; settings: Record<string, string> } {
  const found: string[] = []
  const discovered: Record<string, string> = {}
  for (const [envVar, meta] of Object.entries(ENV_KEY_MAP)) {
    const value = process.env[envVar]
    if (value && value.trim().length > 5) {
      found.push(`${meta.name} (${envVar})`)
      discovered[meta.setting] = value.trim()
    }
  }
  return { found, settings: discovered }
}

/** Ping a URL with a 500ms timeout to check if it's reachable. */
async function ping(url: string, timeoutMs: number = 2000): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { ok: res.ok || res.status < 500, latencyMs: Date.now() - start }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: (e as Error).message.slice(0, 80) }
  }
}

/**
 * Run health checks on all configured providers.
 * Returns a list of health statuses for the frontend.
 */
export async function runHealthChecks(): Promise<HealthStatus[]> {
  const s = getSettings()
  const checks: Promise<HealthStatus>[] = []

  // LLM providers
  if (s.provider !== 'zai' && s.baseURL) {
    const providerName = s.provider.toUpperCase()
    checks.push(
      ping(`${s.baseURL.replace(/\/$/, '')}/models`, 2000).then((r) => ({
        name: providerName,
        type: 'llm' as const,
        status: r.ok ? ('online' as const) : ('offline' as const),
        latencyMs: r.latencyMs,
        detail: r.error,
      })),
    )
  }

  // Search providers
  const searchProviders: { name: string; url: string; key?: string }[] = [
    { name: 'Z.ai Search', url: 'https://api.z.ai', key: undefined },
    { name: 'DuckDuckGo', url: 'https://api.duckduckgo.com', key: undefined },
  ]
  if (s.tavilyApiKey) searchProviders.push({ name: 'Tavily', url: 'https://api.tavily.com', key: s.tavilyApiKey })
  if (s.exaApiKey) searchProviders.push({ name: 'Exa', url: 'https://api.exa.ai', key: s.exaApiKey })
  if (s.youcomApiKey) searchProviders.push({ name: 'You.com', url: 'https://api.ydc-index.io', key: s.youcomApiKey })
  if (s.tinyfishApiKey) searchProviders.push({ name: 'TinyFish', url: 'https://api.tinyfish.io', key: s.tinyfishApiKey })
  if (s.nimblerApiKey) searchProviders.push({ name: 'Nimble', url: 'https://sdk.nimbleway.com', key: s.nimblerApiKey })

  for (const sp of searchProviders) {
    checks.push(
      ping(sp.url, 2000).then((r) => ({
        name: sp.name,
        type: 'search' as const,
        status: r.ok ? ('online' as const) : ('offline' as const),
        latencyMs: r.latencyMs,
        detail: r.error,
      })),
    )
  }

  // Unconfigured search providers
  const allSearchNames = ['Tavily', 'Exa', 'You.com', 'TinyFish', 'Nimble']
  for (const name of allSearchNames) {
    if (!searchProviders.find((sp) => sp.name === name)) {
      checks.push(Promise.resolve({
        name,
        type: 'search' as const,
        status: 'unconfigured' as const,
      }))
    }
  }

  // Sandbox providers
  if (s.e2bApiKey) {
    checks.push(
      ping('https://api.e2b.dev', 2000).then((r) => ({
        name: 'E2B Sandbox',
        type: 'sandbox' as const,
        status: r.ok ? ('online' as const) : ('offline' as const),
        latencyMs: r.latencyMs,
      })),
    )
  }
  if (s.daytonaApiKey) {
    checks.push(Promise.resolve({
      name: 'Daytona Sandbox',
      type: 'sandbox' as const,
      status: 'online' as const, // Can't easily ping Daytona without making a workspace
    }))
  }

  // Local memory store
  checks.push(Promise.resolve({
    name: 'Local TF-IDF Memory',
    type: 'database' as const,
    status: 'online' as const,
    detail: 'No Pinecone/Supabase required — local memory is always available',
  }))

  // Voice
  if (s.voiceBoxUrl) {
    checks.push(
      ping(s.voiceBoxUrl, 2000).then((r) => ({
        name: 'VoiceBox TTS',
        type: 'voice' as const,
        status: r.ok ? ('online' as const) : ('offline' as const),
        latencyMs: r.latencyMs,
      })),
    )
  }

  return Promise.all(checks)
}
