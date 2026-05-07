// One-shot transcribe over HTTP. Sends the assembled PCM buffer to a
// user-deployed Cloudflare Worker (see worker-template/) which proxies
// to Deepgram and returns plain { text }.
//
// Why HTTP and not WebSocket: outbound `new WebSocket()` fails silently
// in the iOS WKWebView the Even Hub uses. Chunked HTTP POST is the only
// reliable path. Adds ~300–800ms latency vs streaming, fine for
// short-utterance push-to-talk patterns ("two twenty-five for five").

import type { TranscribeConfig, TranscribeResult } from './types'

export async function transcribe(
  pcm: Uint8Array,
  cfg: TranscribeConfig,
): Promise<TranscribeResult> {
  if (!cfg.workerUrl || !cfg.workerSecret) {
    return { ok: false, text: '', error: 'Worker URL or secret not configured' }
  }
  if (pcm.byteLength === 0) {
    return { ok: false, text: '', error: 'Empty audio buffer' }
  }
  const url = `${cfg.workerUrl.replace(/\/$/, '')}/transcribe`
  const t0 = Date.now()
  try {
    // Body as Blob, not raw ArrayBuffer — WKWebView's fetch handles
    // Blobs more consistently across iOS versions, especially with
    // CORS preflight where some implementations refuse raw binary.
    const body = new Blob([pcm as BlobPart], { type: 'application/octet-stream' })
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cfg.workerSecret}` },
      body,
    })
    const durationMs = Date.now() - t0
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { ok: false, text: '', error: `HTTP ${res.status}: ${txt.slice(0, 200)}`, durationMs }
    }
    const data = await res.json() as { text?: string; transcript?: string }
    const text = (data.text ?? data.transcript ?? '').toString()
    return { ok: true, text, durationMs }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, text: '', error: msg }
  }
}
