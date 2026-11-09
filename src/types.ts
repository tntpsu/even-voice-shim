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

/** The Even app's per-frame speaker tag (SDK 0.0.16 `audioEvent.speakerRole`).
 *  A heuristic from the glasses' direction sensor, not a firmware identity;
 *  the phone mic never carries one. */
export type SpeakerRole = 'self' | 'other' | 'unknown'

/** One stretch of a clip tagged with a single role, in ms from clip start. */
export interface RoleSpan {
  startMs: number
  endMs: number
  role: SpeakerRole
}

/** One word with Deepgram's timing, in ms from clip start. */
export interface TranscribedWord {
  word: string
  startMs: number
  endMs: number
}

export interface TranscribeResult {
  ok: boolean
  text: string
  error?: string
  durationMs?: number
  /** Present when the Worker returned word timings (worker-template ≥ 0.2.0). */
  words?: TranscribedWord[]
}
