// Minimal Cloudflare Worker: receives PCM16 mono 16 kHz audio at
// POST /transcribe, wraps as WAV, calls Deepgram's HTTP /v1/listen
// endpoint, returns { ok: true, text }.
//
// Bearer-gated by SHARED_SECRET (configure with `wrangler secret put`).
// CORS-permissive so the plugin's WebView can hit it from any origin.

interface Env {
  SHARED_SECRET: string
  DEEPGRAM_API_KEY: string
}

const DEEPGRAM_HTTP =
  'https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&smart_format=true'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }
    const url = new URL(request.url)
    if (url.pathname === '/healthz') return new Response('ok', { headers: corsHeaders() })
    if (url.pathname === '/transcribe') return handleTranscribe(request, env)
    return jsonResponse(404, { ok: false, error: 'not found' })
  },
}

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'POST only' })
  }
  const auth = request.headers.get('Authorization') ?? ''
  if (!env.SHARED_SECRET || auth !== `Bearer ${env.SHARED_SECRET}`) {
    return jsonResponse(401, { ok: false, error: 'unauthorized' })
  }
  if (!env.DEEPGRAM_API_KEY) {
    return jsonResponse(500, { ok: false, error: 'DEEPGRAM_API_KEY not configured' })
  }
  const pcm = new Uint8Array(await request.arrayBuffer())
  if (pcm.byteLength < 1600) {
    // < ~50 ms of audio at 16 kHz. Don't burn quota on near-empty chunks.
    return jsonResponse(200, { ok: true, text: '' })
  }
  const wav = wavWrap(pcm)
  const dgRes = await fetch(DEEPGRAM_HTTP, {
    method: 'POST',
    headers: {
      Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
      'Content-Type': 'audio/wav',
    },
    body: wav,
  })
  if (!dgRes.ok) {
    const errText = await dgRes.text()
    return jsonResponse(dgRes.status, {
      ok: false,
      error: `deepgram ${dgRes.status}: ${errText.slice(0, 200)}`,
    })
  }
  const json = (await dgRes.json()) as {
    results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> }
  }
  const text = (json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim()
  return jsonResponse(200, { ok: true, text })
}

/** Wrap raw PCM16 mono 16 kHz as a WAV blob (44-byte header + samples). */
function wavWrap(pcm: Uint8Array): Uint8Array {
  const sampleRate = 16000
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcm.byteLength
  const buffer = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buffer)
  let o = 0
  const writeStr = (s: string): void => { for (const c of s) v.setUint8(o++, c.charCodeAt(0)) }
  writeStr('RIFF'); v.setUint32(o, 36 + dataSize, true); o += 4
  writeStr('WAVE')
  writeStr('fmt '); v.setUint32(o, 16, true); o += 4
  v.setUint16(o, 1, true); o += 2                  // PCM
  v.setUint16(o, numChannels, true); o += 2
  v.setUint32(o, sampleRate, true); o += 4
  v.setUint32(o, byteRate, true); o += 4
  v.setUint16(o, blockAlign, true); o += 2
  v.setUint16(o, bitsPerSample, true); o += 2
  writeStr('data'); v.setUint32(o, dataSize, true); o += 4
  new Uint8Array(buffer, 44).set(pcm)
  return new Uint8Array(buffer)
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}
