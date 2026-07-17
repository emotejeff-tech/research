/**
 * tools/settings.ts — Persistent LLM provider settings.
 *
 * Stores the user's preferred LLM backend (Ollama / LM Studio / OpenRouter /
 * llama.cpp / Custom / AudioBox) with base URL, API key, and selected model.
 * Persists to settings.json so the configuration survives restarts.
 * Provides model auto-fetching from the provider's /v1/models or /api/tags endpoint.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SETTINGS_PATH = join(__dirname, '..', 'settings.json')

export type ProviderType = 'zai' | 'ollama' | 'lmstudio' | 'openrouter' | 'llamacpp' | 'custom' | 'audiobox'

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
  /** Max context window (in tokens) to pass to the model. */
  maxContextTokens: number
  /** Temperature for generation (0-2). */
  temperature: number
  /** Force JSON response format for structured prompts (Critic, Evolution). */
  jsonMode: boolean
  /** Optional: separate lightweight model for Planning/Discovery (saves VRAM). */
  planningModel?: string
  planningEndpoint?: string
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
  /** Memory backend settings (local-first: JSON/SQLite-compatible, no cloud). */
  memoryBackend: 'local'
  memoryPath: ''
  /** VoiceBox (local TTS + Whisper) settings. */
  voiceBoxUrl?: string
  voiceBoxApiKey?: string
  voiceBoxEnabled?: boolean
  /** VoiceBox TTS backend: auto tries local Audiobox first, then OpenAI-compatible TTS. */
  ttsProvider?: 'auto' | 'audiobox' | 'openai-compatible'
  ttsModel?: string
  ttsVoice?: string
  ttsVoices?: string[]
  ttsModels?: string[]
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
    defaultKey: '',
    defaultModel: 'llama3.2',
    needsKey: false,
    help: 'Local Ollama server. Install from ollama.com, then pull a model with `ollama pull llama3.2`.',
  },
  lmstudio: {
    label: 'LM Studio',
    defaultURL: 'http://localhost:1234/v1',
    defaultKey: '',
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
  audiobox: {
    label: 'AudioBox (Local TTS + Whisper)',
    defaultURL: 'http://localhost:17493',
    defaultKey: '',
    defaultModel: 'kokoro',
    needsKey: false,
    help: 'Local AudioBox server. Start with `python -m voicebox.server` or your custom AudioBox setup.',
  },
}

const DEFAULT_SETTINGS: LLMSettings = {
  provider: 'zai',
  baseURL: '',
  apiKey: '',
  model: '',
  enabled: false,
  primary: false,
  maxContextTokens: 8192,
  temperature: 0.7,
  jsonMode: true,
  planningModel: '',
  planningEndpoint: '',
  voiceBoxUrl: 'http://localhost:17493',
  voiceBoxApiKey: '',
  voiceBoxEnabled: true,
  ttsProvider: 'auto',
  ttsModel: 'kokoro',
  ttsVoice: 'af_heart',
  ttsVoices: ['af_heart', 'bf_heart', 'af_alloy', 'bf_alloy', 'alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'vivian', 'ryan', 'serena', 'chatterbox'],
  ttsModels: ['kokoro', 'f5-tts', 'vits', 'qwen3-tts', 'qwen-tts', 'chatterbox-tts', 'chatterbox', 'openai-compatible'],
  whisperModel: 'whisper-1',
  memoryBackend: 'local',
  memoryPath: '',
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
      console.log('[settings] no settings file, using defaults (local-first)')
    }
  } catch (e) {
    console.error('[settings] load failed:', (e as Error).message)
    settings = { ...DEFAULT_SETTINGS }
  }
}

/** Save settings to disk. Writes the COMPLETE settings object — no merging. */
export function saveSettings(newSettings: Partial<LLMSettings>): LLMSettings {
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
 * - AudioBox: GET /api/voices (native format)
 * - Others: GET /v1/models (OpenAI-compatible format)
 */
export async function fetchModels(
  provider: ProviderType,
  baseURL: string,
  apiKey: string,
  timeoutMs = 5000,
): Promise<{ models: string[]; voices?: string[]; error?: string }> {
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
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: any = await res.json()
      const models = (data?.models || []).map((m: any) => m.name || m.model).filter(Boolean)
      return { models }
    }

    // AudioBox has a native /api/voices endpoint.
    if (provider === 'audiobox') {
      const res = await fetch(`${url}/api/voices`, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: any = await res.json()
      const voices = (data?.voices || data?.data || []).map((v: any) => v.name || v.id || v).filter(Boolean)
      return { models: [data?.default_model || 'kokoro' as string], voices }
    }

    // All other providers use the OpenAI-compatible /v1/models endpoint.
    const res = await fetch(`${url}/models`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
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
 * is configured with a baseURL + model, it's active.
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

/** Get the effective local LLM config. */
export function getLocalLLMConfig(): { baseURL: string; apiKey: string; model: string; maxContextTokens: number; temperature: number; jsonMode: boolean } {
  return {
    baseURL: settings.baseURL || '',
    apiKey: settings.apiKey || 'none',
    model: settings.model || 'local-model',
    maxContextTokens: settings.maxContextTokens || 8192,
    temperature: settings.temperature ?? 0.7,
    jsonMode: settings.jsonMode ?? true,
  }
}

/** Get config for the lightweight planning model (if configured separately). */
export function getPlanningModelConfig(): { baseURL: string; model: string } | null {
  if (settings.planningEndpoint && settings.planningModel) {
    return {
      baseURL: settings.planningEndpoint,
      model: settings.planningModel,
    }
  }
  return null
}
