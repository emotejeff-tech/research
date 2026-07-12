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
 * Returns base64-encoded audio that the frontend can play.
 */
export async function speak(text: string): Promise<TTSResult> {
  const s = getSettings()
  if (!s.voiceBoxUrl) {
    return { ok: false, error: 'VoiceBox not configured' }
  }

  // Truncate very long text — TTS is for short announcements.
  const truncated = text.slice(0, 300)

  try {
    const res = await fetch(`${s.voiceBoxUrl.replace(/\/$/, '')}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(s.voiceBoxApiKey ? { 'Authorization': `Bearer ${s.voiceBoxApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: s.ttsModel || 'tts-1',
        input: truncated,
        voice: s.ttsVoice || 'alloy',
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, error: `TTS HTTP ${res.status}: ${errText.slice(0, 100)}` }
    }

    // The response is raw audio bytes — convert to base64.
    const arrayBuffer = await res.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    return { ok: true, audioBase64: base64 }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Transcribe audio using the local Whisper endpoint.
 * Accepts base64-encoded audio, returns transcribed text.
 */
export async function transcribe(audioBase64: string, format: string = 'wav'): Promise<STTResult> {
  const s = getSettings()
  if (!s.voiceBoxUrl) {
    return { ok: false, error: 'VoiceBox not configured' }
  }

  try {
    // Convert base64 to a Blob for multipart form upload.
    const buffer = Buffer.from(audioBase64, 'base64')
    const blob = new Blob([buffer], { type: `audio/${format}` })
    const formData = new FormData()
    formData.append('file', blob, `audio.${format}`)
    formData.append('model', s.whisperModel || 'whisper-1')

    const res = await fetch(`${s.voiceBoxUrl.replace(/\/$/, '')}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: {
        ...(s.voiceBoxApiKey ? { 'Authorization': `Bearer ${s.voiceBoxApiKey}` } : {}),
      },
      body: formData,
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      return { ok: false, error: `Whisper HTTP ${res.status}` }
    }

    const data: any = await res.json()
    return { ok: true, text: data?.text || '' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
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
