/**
 * tools/voicebox.ts — Local TTS/STT orchestration with Audiobox auto-detection.
 *
 * Local-first:
 * - Default to Audiobox on localhost:17493 (no API key needed)
 * - Auto-detect installed models and voices on startup
 * - Gracefully fallback to local text-only if TTS unavailable
 * - No cloud dependencies
 */
import { getSettings } from './settings'

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

/** Get the active Audiobox URL from settings. */
export function getAudioboxUrl(): string {
  const s = getSettings()
  return s.voiceBoxUrl || 'http://localhost:17493'
}

/** Get the active Audiobox model. */
export function getAudioboxModel(): string {
  const s = getSettings()
  return s.ttsModel || 'kokoro'
}

/** Get the active Audiobox voice. */
export function getAudioboxVoice(): string {
  const s = getSettings()
  return s.ttsVoice || 'af_heart'
}

/** Get the active Audiobox voice list. */
export function getAudioboxVoices(): string[] {
  const s = getSettings()
  return s.ttsVoices || ['af_heart', 'bf_heart', 'af_alloy', 'bf_alloy']
}



/** Get the active Audiobox model list. */
export function getAudioboxModels(): string[] {
  const s = getSettings()
  return s.ttsModels || ['kokoro', 'f5-tts', 'vits']
}

/** Check if Audiobox/local TTS is enabled. */
export function isVoiceEnabled(): boolean {
  const s = getSettings()
  return s.voiceBoxEnabled !== false && !!s.voiceBoxUrl
}

/** Auto-detect Audiobox models on startup. */
export async function autoDetectAudioboxModels(): Promise<string[]> {
  const url = getAudioboxUrl()
  const endpoints = [
    `${url}/models`,
    `${url}/api/models`,
    `${url}/api/tts/models`,
  ]

  const models: string[] = []
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        const data: any = await res.json()
        const arr = Array.isArray(data) ? data : data?.models || data?.data || data?.voices || []
        for (const m of arr) {
          if (typeof m === 'string') models.push(m)
          else if (m?.id) models.push(m.id)
          else if (m?.name) models.push(m.name)
        }
        break
      }
    } catch {
      // Try next endpoint
    }
  }

  // Fallback to known Kokoro models (Audiobox default)
  if (models.length === 0) {
    models.push('kokoro')
  }

  return Array.from(new Set(models))
}

/** Auto-detect Audiobox voices on startup. */
export async function autoDetectAudioboxVoices(): Promise<string[]> {
  const url = getAudioboxUrl()
  const endpoints = [
    `${url}/voices`,
    `${url}/api/voices`,
    `${url}/api/tts/voices`,
  ]

  const voices: string[] = []
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        const data: any = await res.json()
        const arr = Array.isArray(data) ? data : data?.voices || data?.data || []
        for (const v of arr) {
          if (typeof v === 'string') voices.push(v)
          else if (v?.id) voices.push(v.id)
          else if (v?.name) voices.push(v.name)
        }
        break
      }
    } catch {
      // Try next endpoint
    }
  }

  // Fallback to known Kokoro voices (Audiobox default)
  if (voices.length === 0) {
    voices.push('af_heart', 'bf_heart', 'af_alloy', 'bf_alloy')
  }

  return Array.from(new Set(voices))
}



/** Fetch available Audiobox voices. */
export async function fetchVoices(): Promise<string[]> {
  const url = getAudioboxUrl()
  const endpoints = [
    `${url}/voices`,
    `${url}/api/voices`,
    `${url}/api/tts/voices`,
  ]

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data: any = await res.json()
        const arr = Array.isArray(data) ? data : data?.voices || data?.data || []
        return arr.map((v: any) => v?.id || v?.name || v).filter(Boolean)
      }
    } catch {
      // Try next endpoint
    }
  }
  return getAudioboxVoices()
}

/** Fetch available Audiobox models. */
export async function fetchModels(): Promise<string[]> {
  const url = getAudioboxUrl()
  const endpoints = [
    `${url}/models`,
    `${url}/api/models`,
    `${url}/api/tts/models`,
  ]

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data: any = await res.json()
        const arr = Array.isArray(data) ? data : data?.models || data?.data || []
        return arr.map((m: any) => m?.id || m?.name || m).filter(Boolean)
      }
    } catch {
      // Try next endpoint
    }
  }
  return getAudioboxModels()
}

/** Check if a voice exists in the available list. */
function voiceExists(voice: string, available: string[]): boolean {
  if (!available.length) return true
  return available.includes(voice)
}

/** Check if a model exists in the available list. */
function modelExists(model: string, available: string[]): boolean {
  if (!available.length) return true
  return available.includes(model)
}

/** Generate TTS audio via local Audiobox. */
export async function announce(message: string): Promise<VoiceResult> {
  const s = getSettings()
  const url = getAudioboxUrl()
  const model = getAudioboxModel()
  const voice = getAudioboxVoice()

  // Try multiple Audiobox endpoint patterns (different versions expose different paths)
  const endpoints = [
    `${url}/api/tts`,
    `${url}/api/tts/voice`,
    `${url}/tts`,
    `${url}/api/generate`,
  ]

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          voice,
          text: message,
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) throw new Error(`Audiobox HTTP ${res.status}`)

      const data: any = await res.json()
      const audioBase64 = data?.audio || data?.audioBase64 || data?.audio_base64
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

      // Some servers return raw audio as text response
      const text = data?.text || data?.output || data?.content || ''
      if (text) {
        return {
          ok: true,
          audioBase64: text,
          text: message,
          provider: 'audiobox',
          model,
          voice,
        }
      }
    } catch (e) {
      console.warn(`[voicebox] Audiobox endpoint ${ep} failed: ${(e as Error).message}`)
    }
  }

  // Last resort: try the base URL with a generic POST
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        voice,
        text: message,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`Audiobox HTTP ${res.status}`)
    const data: any = await res.json()
    const audioBase64 = data?.audio || data?.audioBase64 || data?.audio_base64 || data?.output || ''
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
    // Ignore — try fallback below
  }

  // Return an error result (caller will show text-only)
  return {
    ok: false,
    text: message,
    provider: 'audiobox',
    model,
    voice,
    error: 'Audiobox TTS unavailable — check local server on port 17493'
  }
}

/** Get voice stats for the UI. */
export function getVoiceStats(): { enabled: boolean; url: string; model: string; voice: string; voices: string[] } {
  const s = getSettings()
  return {
    enabled: isVoiceEnabled(),
    url: getAudioboxUrl(),
    model: getAudioboxModel(),
    voice: getAudioboxVoice(),
    voices: getAudioboxVoices(),
  }
}
