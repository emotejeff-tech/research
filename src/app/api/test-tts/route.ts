import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { url, apiKey, model, voice, text } = await req.json()

  if (!url) {
    return NextResponse.json({ ok: false, error: 'No TTS server URL provided' })
  }

  const baseUrl = url.replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  // Try multiple TTS endpoint formats — order matters, /speak first (your server)
  const endpoints = [
    // Format 1: /speak with voice_id (Kokoro/F5-TTS style — your server at port 17493)
    {
      url: `${baseUrl}/speak`,
      body: JSON.stringify({
        voice_id: voice || '944602ca-5c6b-42d7-9bf2-a9e7e7425259',
        text: text,
      }),
    },
    // Format 2: /v1/audio/speech (OpenAI-compatible)
    {
      url: `${baseUrl}/v1/audio/speech`,
      body: JSON.stringify({
        model: model || 'tts-1',
        input: text,
        voice: voice || 'af_heart',
        response_format: 'mp3',
      }),
    },
    // Format 3: /api/tts (FastAPI/Piper style)
    {
      url: `${baseUrl}/api/tts`,
      body: JSON.stringify({ text, voice: voice || 'af_heart', model: model || 'kokoro' }),
    },
    // Format 4: /tts (simple style)
    {
      url: `${baseUrl}/tts`,
      body: JSON.stringify({ text, voice: voice || 'af_heart' }),
    },
    // Format 5: Kokoro native — /api/generate
    {
      url: `${baseUrl}/api/generate`,
      body: JSON.stringify({ text, voice: voice || 'af_heart' }),
    },
  ]

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers,
        body: ep.body,
        signal: AbortSignal.timeout(20000),
      })

      if (!res.ok) continue

      const contentType = res.headers.get('content-type') || ''

      // JSON response — might contain base64 audio
      if (contentType.includes('application/json')) {
        const data = await res.json()
        const audioB64 = data?.audio || data?.audio_base64 || data?.audioBase64 || data?.data || data?.audio_content
        if (audioB64 && typeof audioB64 === 'string') {
          return NextResponse.json({ ok: true, audio: audioB64 })
        }
        continue
      }

      // Raw audio response — convert to base64
      if (contentType.startsWith('audio/') || contentType.startsWith('application/octet-stream') || res.headers.get('content-length')) {
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

  return NextResponse.json({ ok: false, error: 'All TTS endpoints failed. Check if your TTS server is running at the configured URL.' })
}
