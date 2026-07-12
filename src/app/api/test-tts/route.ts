import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { url, apiKey, model, voice, text } = await req.json()

  if (!url) {
    return NextResponse.json({ ok: false, error: 'No TTS server URL provided' })
  }

  const baseUrl = url.replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  // Try multiple TTS endpoint formats
  const endpoints = [
    {
      url: `${baseUrl}/v1/audio/speech`,
      body: JSON.stringify({ model: model || 'tts-1', input: text, voice: voice || 'alloy', response_format: 'mp3' }),
    },
    {
      url: `${baseUrl}/api/tts`,
      body: JSON.stringify({ text, voice: voice || 'default', model: model || 'tts-1' }),
    },
    {
      url: `${baseUrl}/tts`,
      body: JSON.stringify({ text, voice: voice || 'default' }),
    },
  ]

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers,
        body: ep.body,
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) continue

      const contentType = res.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        const data = await res.json()
        const audioB64 = data?.audio || data?.audio_base64 || data?.audioBase64 || data?.data
        if (audioB64 && typeof audioB64 === 'string') {
          return NextResponse.json({ ok: true, audio: audioB64 })
        }
        continue
      }

      if (contentType.startsWith('audio/') || res.headers.get('content-length')) {
        const arrayBuffer = await res.arrayBuffer()
        if (arrayBuffer.byteLength > 0) {
          const base64 = Buffer.from(arrayBuffer).toString('base64')
          return NextResponse.json({ ok: true, audio: base64 })
        }
      }
    } catch {
      continue
    }
  }

  return NextResponse.json({ ok: false, error: 'All TTS endpoints failed. Check if your TTS server is running and the URL is correct.' })
}
