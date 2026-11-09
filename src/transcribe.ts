// One-shot transcribe over HTTP. Sends the assembled PCM buffer to a
// user-deployed Cloudflare Worker (see worker-template/) which proxies
// to Deepgram and returns plain { text }.
//
// Why HTTP and not WebSocket: outbound `new WebSocket()` fails silently
// in the iOS WKWebView the Even Hub uses. Chunked HTTP POST is the only
// reliable path. Adds ~300–800ms latency vs streaming, fine for
// short-utterance push-to-talk patterns ("two twenty-five for five").

import type { TranscribeConfig, TranscribeResult, TranscribedWord } from './types'

/** Deepgram times words in seconds from the top of the audio it was sent,
 *  i.e. from the start of the clip. Words without both times are skipped. */
export function parseWords(raw: unknown): TranscribedWord[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: TranscribedWord[] = []
  for (const w of raw as Array<{ word?: unknown; start?: unknown; end?: unknown }>) {
    if (typeof w?.word !== 'string' || typeof w.start !== 'number' || typeof w.end !== 'number') continue
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end)) continue
    out.push({ word: w.word, startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000) })
  }
  return out
}

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
    const data = await res.json() as { text?: string; transcript?: string; words?: unknown }
    const text = (data.text ?? data.transcript ?? '').toString()
    const words = parseWords(data.words)
    return words ? { ok: true, text, durationMs, words } : { ok: true, text, durationMs }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, text: '', error: msg }
  }
}
