/**
 * tools/voicebox.ts — Local TTS/STT orchestration with Audiobox + OpenAI-compatible TTS auto-detection.
 *
 * Local-first:
 * - Default ttsProvider is "auto": try local Audiobox first, then OpenAI-compatible TTS.
 * - Auto-detect installed models and voices on startup.
 * - Gracefully fallback to local text-only if TTS unavailable.
 * - Supports Audiobox/Kokoro, Qwen3-TTS, Chatterbox TTS, and other OpenAI-compatible TTS servers.
 */
import { getSettings } from './settings'

export type TtsProvider = 'auto' | 'audiobox' | 'openai-compatible'

export interface VoiceResult {
  ok: boolean
  audioBase64?: string
  text?: string
  provider: string
  model: string
  voice: string
  error?: string
}

export interface VoiceBoxModel {
  id: string
  name?: string
  language?: string
}

export interface VoiceBoxVoice {
  id: string
  name?: string
  language?: string
}

const DEFAULT_TTS_MODELS = ['kokoro', 'f5-tts', 'vits', 'qwen3-tts', 'qwen-tts', 'qwen2.5-omni-7b', 'chatterbox-tts', 'chatterbox']
const DEFAULT_TTS_VOICES = [
  'af_heart',
  'bf_heart',
  'af_alloy',
  'bf_alloy',
  'alloy',
  'ash',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'shimmer',
  'vivian',
  'ryan',
  'serena',
  'chatterbox',
]

/** Get the active VoiceBox URL from settings. */
export function getAudioboxUrl(): string {
  const s = getSettings()
  return s.voiceBoxUrl || 'http://localhost:17493'
}

/** Get the active VoiceBox TTS provider. */
export function getTtsProvider(): TtsProvider {
  const s = getSettings()
  return s.ttsProvider === 'audiobox' || s.ttsProvider === 'openai-compatible' ? s.ttsProvider : 'auto'
}

/** Get the active VoiceBox model. */
export function getAudioboxModel(): string {
  const s = getSettings()
  return s.ttsModel || DEFAULT_TTS_MODELS[0] || 'kokoro'
}

/** Get the active VoiceBox voice. */
export function getAudioboxVoice(): string {
  const s = getSettings()
  return s.ttsVoice || DEFAULT_TTS_VOICES[0] || 'af_heart'
}

/** Get the active VoiceBox voice list. */
export function getAudioboxVoices(): string[] {
  const s = getSettings()
  return s.ttsVoices || DEFAULT_TTS_VOICES
}

/** Get the active VoiceBox model list. */
export function getAudioboxModels(): string[] {
  const s = getSettings()
  return s.ttsModels || DEFAULT_TTS_MODELS
}

/** Check if VoiceBox/local TTS is enabled. */
export function isVoiceEnabled(): boolean {
  const s = getSettings()
  return s.voiceBoxEnabled !== false && !!s.voiceBoxUrl
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)))
}

function modelValue(model: any): string | undefined {
  if (typeof model === 'string') return model
  if (!model || typeof model !== 'object') return undefined
  return model.id || model.name || model.model || model.value || model.voice
}

function voiceValue(voice: any): string | undefined {
  if (typeof voice === 'string') return voice
  if (!voice || typeof voice !== 'object') return undefined
  return voice.id || voice.name || voice.label || voice.voice || voice.value
}

function listFromData(data: any, kind: 'models' | 'voices'): string[] {
  const arr = Array.isArray(data) ? data : data?.models || data?.data || data?.voices || data?.items || data?.results || []
  return unique(arr.map((item) => (kind === 'models' ? modelValue(item) : voiceValue(item)) ?? ''))
}

function ttsHeaders(): Record<string, string> {
  const s = getSettings()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (s.voiceBoxApiKey) headers.Authorization = `Bearer ${s.voiceBoxApiKey}`
  return headers
}

function providerOrder(): TtsProvider[] {
  const provider = getTtsProvider()
  return provider === 'auto' ? ['audiobox', 'openai-compatible'] : [provider]
}

function openAiCompatibleBase(): string {
  const url = normalizeUrl(getAudioboxUrl())
  return url.endsWith('/v1') ? url : `${url}/v1`
}

function getOpenAiCompatibleModelsUrl(): string {
  return `${openAiCompatibleBase()}/models`
}

function getOpenAiCompatibleVoicesUrl(): string {
  return `${openAiCompatibleBase()}/voices`
}

function getOpenAiCompatibleSpeechUrl(): string {
  return `${openAiCompatibleBase()}/audio/speech`
}

function getAudioboxModelsUrls(): string[] {
  const url = normalizeUrl(getAudioboxUrl())
  return [
    `${url}/models`,
    `${url}/api/models`,
    `${url}/api/tts/models`,
    `${url}/v1/models`,
  ]
}

function getAudioboxVoicesUrls(): string[] {
  const url = normalizeUrl(getAudioboxUrl())
  return [
    `${url}/voices`,
    `${url}/api/voices`,
    `${url}/api/tts/voices`,
    `${url}/v1/voices`,
  ]
}

function getAudioboxSpeechUrls(): string[] {
  const url = normalizeUrl(getAudioboxUrl())
  return [
    `${url}/api/tts`,
    `${url}/api/tts/voice`,
    `${url}/tts`,
    `${url}/api/generate`,
    `${url}/v1/audio/speech`,
  ]
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: init.signal || AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function responseText(res: Response): Promise<string> {
  try {
    return await res.text().catch(() => '')
  } catch {
    return ''
  }
}

async function fetchListFromProvider(provider: TtsProvider, kind: 'models' | 'voices'): Promise<string[]> {
  const urls = provider === 'openai-compatible'
    ? kind === 'models' ? [getOpenAiCompatibleModelsUrl()] : [getOpenAiCompatibleVoicesUrl()]
    : kind === 'models' ? getAudioboxModelsUrls() : getAudioboxVoicesUrls()

  for (const url of urls) {
    const data = await fetchJson<any>(url, { method: 'GET' })
    if (data) {
      const values = listFromData(data, kind)
      if (values.length > 0) return values
    }
  }
  return []
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function audioBase64FromResponse(res: Response): Promise<string | undefined> {
  const contentType = res.headers.get('content-type') || ''

  if (!contentType.includes('application/json')) {
    const blob = await res.blob().catch(() => undefined)
    if (blob && blob.size > 0) return blobToBase64(blob)
    return undefined
  }

  let data: any = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  const audioBase64 = data?.audio || data?.audioBase64 || data?.audio_base64 || data?.output || data?.content || ''
  if (audioBase64) return audioBase64

  const blob = await res.blob().catch(() => undefined)
  if (blob && blob.size > 0) return blobToBase64(blob)

  return undefined
}

async function announceAudiobox(message: string, model: string, voice: string): Promise<VoiceResult> {
  const urls = getAudioboxSpeechUrls()

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: ttsHeaders(),
        body: JSON.stringify({
          model,
          voice,
          text: message,
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) throw new Error(`Audiobox HTTP ${res.status}: ${await responseText(res)}`)

      const audioBase64 = await audioBase64FromResponse(res)
      if (audioBase64) {
        return {
          ok: true,
          audioBase64,
          text: message,
          provider: 'audiobox',
          model,
          voice,
        }
      }
    } catch (e) {
      console.warn(`[voicebox] Audiobox endpoint ${url} failed: ${(e as Error).message}`)
    }
  }

  return {
    ok: false,
    text: message,
    provider: 'audiobox',
    model,
    voice,
    error: 'Audiobox TTS unavailable — check local server on port 17493 or use ttsProvider=openai-compatible',
  }
}

async function announceOpenAiCompatible(message: string, model: string, voice: string): Promise<VoiceResult> {
  const url = getOpenAiCompatibleSpeechUrl()

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: ttsHeaders(),
      body: JSON.stringify({
        model,
        input: message,
        voice,
        response_format: 'wav',
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) throw new Error(`OpenAI-compatible TTS HTTP ${res.status}: ${await responseText(res)}`)

    const audioBase64 = await audioBase64FromResponse(res)
    if (audioBase64) {
      return {
        ok: true,
        audioBase64,
        text: message,
        provider: 'openai-compatible',
        model,
        voice,
      }
    }
  } catch (e) {
    console.warn(`[voicebox] OpenAI-compatible TTS endpoint ${url} failed: ${(e as Error).message}`)
  }

  return {
    ok: false,
    text: message,
    provider: 'openai-compatible',
    model,
    voice,
    error: 'OpenAI-compatible TTS unavailable — check /v1/audio/speech on the configured VoiceBox URL',
  }
}

/** Auto-detect VoiceBox models on startup. */
export async function autoDetectAudioboxModels(): Promise<string[]> {
  return fetchModels()
}

/** Auto-detect VoiceBox voices on startup. */
export async function autoDetectAudioboxVoices(): Promise<string[]> {
  return fetchVoices()
}

/** Fetch available VoiceBox voices. */
export async function fetchVoices(): Promise<string[]> {
  for (const provider of providerOrder()) {
    const voices = await fetchListFromProvider(provider, 'voices')
    if (voices.length > 0) return voices
  }
  return DEFAULT_TTS_VOICES
}

/** Fetch available VoiceBox models. */
export async function fetchModels(): Promise<string[]> {
  for (const provider of providerOrder()) {
    const models = await fetchListFromProvider(provider, 'models')
    if (models.length > 0) return models
  }
  return DEFAULT_TTS_MODELS
}

/** Generate TTS audio via local VoiceBox. */
export async function announce(message: string): Promise<VoiceResult> {
  const s = getSettings()
  const model = getAudioboxModel()
  const voice = getAudioboxVoice()

  if (getTtsProvider() === 'openai-compatible') {
    return announceOpenAiCompatible(message, model, voice)
  }

  const audioboxResult = await announceAudiobox(message, model, voice)
  if (audioboxResult.ok) return audioboxResult

  if (getTtsProvider() === 'auto') {
    const openAiResult = await announceOpenAiCompatible(message, model, voice)
    if (openAiResult.ok) return openAiResult
    return {
      ok: false,
      text: message,
      provider: 'auto',
      model,
      voice,
      error: `Audiobox unavailable (${audioboxResult.error}); OpenAI-compatible TTS unavailable (${openAiResult.error})`,
    }
  }

  return audioboxResult
}

/** Get voice stats for the UI. */
export function getVoiceStats(): { enabled: boolean; url: string; provider: TtsProvider; model: string; voice: string; voices: string[]; models: string[] } {
  const s = getSettings()
  return {
    enabled: isVoiceEnabled(),
    url: getAudioboxUrl(),
    provider: getTtsProvider(),
    model: getAudioboxModel(),
    voice: getAudioboxVoice(),
    voices: getAudioboxVoices(),
    models: getAudioboxModels(),
  }
}
