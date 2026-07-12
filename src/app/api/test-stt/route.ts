import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { url, apiKey, model, audio } = await req.json()

  if (!url) {
    return NextResponse.json({ ok: false, error: 'No STT server URL provided' })
  }

  const baseUrl = url.replace(/\/$/, '')
  const headers: Record<string, string> = {}
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  // Convert base64 to buffer
  const buffer = Buffer.from(audio, 'base64')

  // Try multiple transcription endpoints
  const endpoints = [
    `${baseUrl}/v1/audio/transcriptions`,
    `${baseUrl}/api/transcribe`,
    `${baseUrl}/transcribe`,
    `${baseUrl}/api/stt`,
  ]

  for (const epUrl of endpoints) {
    try {
      const blob = new Blob([buffer], { type: 'audio/webm' })
      const formData = new FormData()
      formData.append('file', blob, 'audio.webm')
      formData.append('model', model || 'whisper-1')

      const res = await fetch(epUrl, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) continue

      const data = await res.json()
      const transcribedText = data?.text || data?.transcript || data?.result
      if (transcribedText) {
        return NextResponse.json({ ok: true, text: transcribedText })
      }
    } catch {
      continue
    }
  }

  return NextResponse.json({ ok: false, error: 'All STT endpoints failed. Check if your Whisper server is running.' })
}
