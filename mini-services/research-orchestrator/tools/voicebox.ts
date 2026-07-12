/**
 * tools/voicebox.ts — Local TTS (text-to-speech) + Whisper (speech-to-text).
 *
 * Integrates with a local VoiceBox server (or any OpenAI-compatible TTS +
 * Whisper endpoint). TTS announces critical phase changes and failures so
 * you can monitor hands-free. Whisper enables future voice-activated commands.
 *
 * VoiceBox server: https://github.com/Mozilla/voicebox (or use openai-style
 * TTS at /v1/audio/speech + Whisper at /v1/audio/transcriptions).
 *
 * Also supports Ollama's built-in speech models if configured.
 */
import { getSettings } from './settings'

export interface TTSResult {
  ok: boolean
  audioBase64?: string
  error?: string
}

export interface STTResult {
  ok: boolean
  text?: string
  error?: string
}

/**
 * Generate speech from text using the local TTS endpoint.
 * Supports multiple TTS API formats:
 *  1. OpenAI-compatible: POST /v1/audio/speech (body: {model, input, voice})
 *  2. FastAPI/Piper style: POST /api/tts or /tts (body: {text} or {text, voice})
 *  3. Coqui TTS style: POST /api/tts (body: {text, speaker_id})
 *
 * Returns base64-encoded audio that the frontend can play.
 */
export async function speak(text: string): Promise<TTSResult> {
  const s = getSettings()
  if (!s.voiceBoxUrl) {
    return { ok: false, error: 'VoiceBox not configured' }
  }

  // Truncate very long text — TTS is for short announcements.
  const truncated = text.slice(0, 300)
  const baseUrl = s.voiceBoxUrl.replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (s.voiceBoxApiKey) headers['Authorization'] = `Bearer ${s.voiceBoxApiKey}`

  // Try multiple TTS endpoints in order.
  const endpoints = [
    // OpenAI-compatible format
    {
      url: `${baseUrl}/v1/audio/speech`,
      body: JSON.stringify({
        model: s.ttsModel || 'tts-1',
        input: truncated,
        voice: s.ttsVoice || 'alloy',
        response_format: 'mp3',
      }),
      expectAudio: true,
    },
    // FastAPI/Piper style (common for local TTS servers on custom ports)
    {
      url: `${baseUrl}/api/tts`,
      body: JSON.stringify({
        text: truncated,
        voice: s.ttsVoice || 'default',
        model: s.ttsModel || 'tts-1',
      }),
      expectAudio: true,
    },
    // Simple /tts endpoint
    {
      url: `${baseUrl}/tts`,
      body: JSON.stringify({
        text: truncated,
        voice: s.ttsVoice || 'default',
      }),
      expectAudio: true,
    },
    // Query param style (some FastAPI TTS servers use GET)
    {
      url: `${baseUrl}/api/tts?text=${encodeURIComponent(truncated)}&voice=${encodeURIComponent(s.ttsVoice || 'default')}`,
      body: null,
      expectAudio: true,
      method: 'GET',
    },
  ]

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: ep.method || 'POST',
        headers: ep.body ? headers : { ...(s.voiceBoxApiKey ? { 'Authorization': `Bearer ${s.voiceBoxApiKey}` } : {}) },
        body: ep.body || undefined,
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) continue // Try next endpoint

      const contentType = res.headers.get('content-type') || ''

      // If we got JSON, it might be a different format — try to extract audio.
      if (contentType.includes('application/json')) {
        const data: any = await res.json()
        // Some TTS APIs return {audio: "base64..."} or {audio_base64: "..."}
        const audioB64 = data?.audio || data?.audio_base64 || data?.audioBase64 || data?.data
        if (audioB64 && typeof audioB64 === 'string') {
          return { ok: true, audioBase64: audioB64 }
        }
        continue // Not the right format, try next
      }

      // If we got raw audio bytes, convert to base64.
      if (contentType.startsWith('audio/') || ep.expectAudio) {
        const arrayBuffer = await res.arrayBuffer()
        if (arrayBuffer.byteLength > 0) {
          const base64 = Buffer.from(arrayBuffer).toString('base64')
          return { ok: true, audioBase64: base64 }
        }
      }
    } catch {
      continue // Try next endpoint
    }
  }

  return { ok: false, error: 'All TTS endpoints failed — check if the server is running and the URL is correct' }
}

/**
 * Transcribe audio using the local Whisper endpoint.
 * Accepts base64-encoded audio, returns transcribed text.
 * Supports multiple STT API formats (OpenAI-compatible + FastAPI).
 */
export async function transcribe(audioBase64: string, format: string = 'wav'): Promise<STTResult> {
  const s = getSettings()
  if (!s.voiceBoxUrl) {
    return { ok: false, error: 'VoiceBox not configured' }
  }

  const baseUrl = s.voiceBoxUrl.replace(/\/$/, '')
  const buffer = Buffer.from(audioBase64, 'base64')

  // Try multiple transcription endpoints.
  const endpoints = [
    `${baseUrl}/v1/audio/transcriptions`,
    `${baseUrl}/api/transcribe`,
    `${baseUrl}/transcribe`,
    `${baseUrl}/api/stt`,
  ]

  for (const url of endpoints) {
    try {
      const blob = new Blob([buffer], { type: `audio/${format}` })
      const formData = new FormData()
      formData.append('file', blob, `audio.${format}`)
      formData.append('model', s.whisperModel || 'whisper-1')

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...(s.voiceBoxApiKey ? { 'Authorization': `Bearer ${s.voiceBoxApiKey}` } : {}),
        },
        body: formData,
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) continue

      const data: any = await res.json()
      const text = data?.text || data?.transcript || data?.result
      if (text) return { ok: true, text }
    } catch {
      continue
    }
  }

  return { ok: false, error: 'All transcription endpoints failed' }
}

/** Check if voice/audio is configured. */
export function isVoiceEnabled(): boolean {
  const s = getSettings()
  return !!s.voiceBoxUrl && (s.voiceBoxEnabled !== false)
}

/**
 * Announce a message via TTS. Only fires if voice is enabled.
 * Returns the base64 audio so the caller can emit it to the frontend.
 */
export async function announce(message: string): Promise<TTSResult | null> {
  if (!isVoiceEnabled()) return null
  // Strip emojis and excessive whitespace for cleaner speech.
  const clean = message.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim()
  if (!clean || clean.length < 3) return null
  return speak(clean)
}
