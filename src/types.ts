// Shared types for the shim. Audio frames are PCM16 mono little-endian
// 16 kHz — the only format the Even Hub SDK's audioControl exposes.

/** PCM16 mono 16 kHz audio frame, as delivered by bridge.audioControl. */
export type AudioFrame = Uint8Array

export interface TranscribeConfig {
  /** Cloudflare Worker base URL, e.g. https://my-app.workers.dev */
  workerUrl: string
  /** Bearer token configured as the Worker's SHARED_SECRET. */
  workerSecret: string
}

export interface TranscribeResult {
  ok: boolean
  text: string
  error?: string
  durationMs?: number
}
