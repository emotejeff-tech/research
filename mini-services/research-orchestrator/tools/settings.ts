/**
 * tools/settings.ts — Persistent LLM provider settings.
 *
 * Stores the user's preferred LLM backend (Ollama / LM Studio / OpenRouter /
 * llama.cpp / Custom) with base URL, API key, and selected model. Persists to
 * settings.json so the configuration survives restarts. Provides model
 * auto-fetching from the provider's /v1/models or /api/tags endpoint.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SETTINGS_PATH = join(__dirname, '..', 'settings.json')

export type ProviderType = 'zai' | 'ollama' | 'lmstudio' | 'openrouter' | 'llamacpp' | 'custom'

export interface LLMSettings {
  /** Active provider. 'zai' = use the built-in z-ai SDK (default). */
  provider: ProviderType
  /** Base URL of the OpenAI-compatible endpoint. */
  baseURL: string
  /** API key (if required by the provider). */
  apiKey: string
  /** Selected model name. */
  model: string
  /** Whether the local tier is enabled in the fallback pipeline. */
  enabled: boolean
  /** When true, use the local provider as the PRIMARY engine (skip Z.ai entirely). */
  primary: boolean
  /** Search API keys (optional — enable multi-provider search aggregation). */
  tavilyApiKey?: string
  exaApiKey?: string
  youcomApiKey?: string
  tinyfishApiKey?: string
  nimblerApiKey?: string
  /** Sandbox API keys (optional — execute evolved tools in isolated cloud sandboxes). */
  daytonaApiKey?: string
  daytonaServerUrl?: string
  e2bApiKey?: string
  /** Database keys (optional — persistent vector memory). */
  supabaseUrl?: string
  supabaseKey?: string
  pineconeApiKey?: string
  pineconeIndex?: string
  /** VoiceBox (local TTS + Whisper) settings. */
  voiceBoxUrl?: string
  voiceBoxApiKey?: string
  voiceBoxEnabled?: boolean
  ttsModel?: string
  ttsVoice?: string
  whisperModel?: string
}

/** Provider presets with sensible defaults. */
export const PROVIDER_PRESETS: Record<
  ProviderType,
  { label: string; defaultURL: string; defaultKey: string; defaultModel: string; needsKey: boolean; help: string }
> = {
  zai: {
    label: 'Z.ai (Built-in)',
    defaultURL: '',
    defaultKey: '',
    defaultModel: '',
    needsKey: false,
    help: 'Default cloud gateway. No configuration needed.',
  },
  ollama: {
    label: 'Ollama',
    defaultURL: 'http://localhost:11434/v1',
    defaultKey: 'ollama',
    defaultModel: 'llama3.2',
    needsKey: false,
    help: 'Local Ollama server. Install from ollama.com, then pull a model with `ollama pull llama3.2`.',
  },
  lmstudio: {
    label: 'LM Studio',
    defaultURL: 'http://localhost:1234/v1',
    defaultKey: 'lm-studio',
    defaultModel: 'local-model',
    needsKey: false,
    help: 'Local LM Studio server. Start the dev server in LM Studio → Local Server tab.',
  },
  openrouter: {
    label: 'OpenRouter',
    defaultURL: 'https://openrouter.ai/api/v1',
    defaultKey: '',
    defaultModel: 'meta-llama/llama-3.2-3b-instruct:free',
    needsKey: true,
    help: 'Cloud router with free + paid models. Get an API key at openrouter.ai/keys.',
  },
  llamacpp: {
    label: 'llama.cpp',
    defaultURL: 'http://localhost:8080/v1',
    defaultKey: 'none',
    defaultModel: 'local-model',
    needsKey: false,
    help: 'llama.cpp server. Build with `make server` and run: ./server -m model.gguf --port 8080',
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    defaultURL: 'http://localhost:8000/v1',
    defaultKey: '',
    defaultModel: 'local-model',
    needsKey: false,
    help: 'Any OpenAI-compatible endpoint (vLLM, text-generation-webui, etc.).',
  },
}

const DEFAULT_SETTINGS: LLMSettings = {
  provider: 'zai',
  baseURL: '',
  apiKey: '',
  model: '',
  enabled: false,
  primary: false,
}

let settings: LLMSettings = { ...DEFAULT_SETTINGS }

/** Load settings from disk. */
export function loadSettings() {
  try {
    if (existsSync(SETTINGS_PATH)) {
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) }
      console.log(`[settings] loaded provider=${settings.provider} model=${settings.model || '(none)'} enabled=${settings.enabled}`)
    } else {
      settings = { ...DEFAULT_SETTINGS }
      console.log('[settings] no settings file, using defaults (zai built-in)')
    }
  } catch (e) {
    console.error('[settings] load failed:', (e as Error).message)
    settings = { ...DEFAULT_SETTINGS }
  }
}

/** Save settings to disk. Writes the COMPLETE settings object — no merging.
 * This ensures all fields from the frontend form are saved every time. */
export function saveSettings(newSettings: Partial<LLMSettings>): LLMSettings {
  // Start with defaults, then overlay EVERYTHING from the incoming data.
  // This ensures old/corrupted settings.json fields are overwritten.
  settings = {
    ...DEFAULT_SETTINGS,
    ...newSettings,
  } as LLMSettings

  try {
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
    const keys = [
      settings.tavilyApiKey ? 'tavily' : null,
      settings.exaApiKey ? 'exa' : null,
      settings.youcomApiKey ? 'youcom' : null,
      settings.tinyfishApiKey ? 'tinyfish' : null,
      settings.nimblerApiKey ? 'nimbler' : null,
      settings.daytonaApiKey ? 'daytona' : null,
      settings.e2bApiKey ? 'e2b' : null,
      settings.supabaseUrl ? 'supabase' : null,
      settings.pineconeApiKey ? 'pinecone' : null,
    ].filter(Boolean)
    console.log(`[settings] saved provider=${settings.provider} model=${settings.model || '(none)'} primary=${settings.primary} keys=[${keys.join(',')}]`)
  } catch (e) {
    console.error('[settings] save failed:', (e as Error).message)
  }
  return settings
}

/** Get current settings. */
export function getSettings(): LLMSettings {
  return { ...settings }
}

/**
 * Fetch available models from the configured provider.
 * - Ollama: GET /api/tags (native format)
 * - Others: GET /v1/models (OpenAI-compatible format)
 * Returns a list of model IDs.
 */
export async function fetchModels(
  provider: ProviderType,
  baseURL: string,
  apiKey: string,
): Promise<{ models: string[]; error?: string }> {
  if (!baseURL && provider !== 'zai') {
    return { models: [], error: 'No base URL configured' }
  }

  const url = baseURL.replace(/\/$/, '')
  const headers: Record<string, string> = {}
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  try {
    // Ollama has a native /api/tags endpoint (not OpenAI-compatible).
    if (provider === 'ollama') {
      const res = await fetch(`${url.replace('/v1', '')}/api/tags`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: any = await res.json()
      const models = (data?.models || []).map((m: any) => m.name || m.model).filter(Boolean)
      return { models }
    }

    // All other providers use the OpenAI-compatible /v1/models endpoint.
    const res = await fetch(`${url}/models`, {
      headers,
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: any = await res.json()
    const models = (data?.data || []).map((m: any) => m.id).filter(Boolean)
    return { models }
  } catch (e) {
    const msg = (e as Error)?.message || 'unknown error'
    return { models: [], error: msg }
  }
}

/**
 * Check if the local tier should be used. Auto-detects: if a non-zai provider
 * is configured with a baseURL + model, it's active. No need to manually toggle.
 */
export function isLocalTierActive(): boolean {
  return settings.provider !== 'zai' && !!settings.baseURL && !!settings.model
}

/**
 * Check if the local provider should be the PRIMARY engine (skip Z.ai).
 * Auto-detects: if a non-zai provider is configured, use it as primary.
 * This avoids the Z.ai config requirement entirely.
 */
export function isLocalPrimary(): boolean {
  return settings.provider !== 'zai' && !!settings.baseURL && !!settings.model
}

/**
 * Get the effective local LLM config.
 */
export function getLocalLLMConfig(): { baseURL: string; apiKey: string; model: string } {
  return {
    baseURL: settings.baseURL || '',
    apiKey: settings.apiKey || 'none',
    model: settings.model || 'local-model',
  }
}
