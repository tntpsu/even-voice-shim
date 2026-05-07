// Voice activity detection on PCM16 mono 16 kHz frames. Closes the mic
// shortly after the user finishes speaking — much better perceived
// latency than a fixed-window capture.
//
// State machine:
//   PRE_VOICE   - mic just opened; waiting for first voiced frame
//                 (timeout: PRE_VOICE_TIMEOUT_MS → close as "no-speech")
//   VOICE       - voice detected; recording
//   POST_VOICE  - voiced → silent transition; counting silence
//                 (silence > SILENCE_HOLD_MS → close as "voice-end")
//                 (voice resumes → back to VOICE)
//   HARD_CAP    - total elapsed > MAX_RECORD_MS → close regardless

const SAMPLE_RATE = 16000
const BYTES_PER_SAMPLE = 2

// Defaults tuned for typical noisy environments. Threshold is normalized
// RMS amplitude (0..1). 0.04 ≈ -28 dBFS — reliably catches conversational
// speech while rejecting moderate ambient noise.
export const DEFAULT_VAD_THRESHOLD = 0.04
export const PRE_VOICE_TIMEOUT_MS = 2500
export const SILENCE_HOLD_MS = 700
export const MAX_RECORD_MS = 8000

export type VadState = 'PRE_VOICE' | 'VOICE' | 'POST_VOICE' | 'CLOSED'
export type CloseReason = 'voice-end' | 'silence-timeout' | 'hard-cap' | 'no-speech' | 'manual'

export interface VadConfig {
  threshold?: number
  preVoiceTimeoutMs?: number
  silenceHoldMs?: number
  maxRecordMs?: number
}

/** Normalized RMS of a PCM16 mono little-endian frame. 0..1. */
export function rmsPcm16(frame: Uint8Array): number {
  const samples = Math.floor(frame.byteLength / BYTES_PER_SAMPLE)
  if (samples === 0) return 0
  // Read int16 LE without allocating a DataView per sample.
  let sumSq = 0
  for (let i = 0; i < samples; i++) {
    const lo = frame[i * 2]!
    const hi = frame[i * 2 + 1]!
    let s = (hi << 8) | lo
    if (s >= 0x8000) s -= 0x10000
    const norm = s / 32768
    sumSq += norm * norm
  }
  return Math.sqrt(sumSq / samples)
}

export class Vad {
  private state: VadState = 'PRE_VOICE'
  private startedAt = 0
  private silentSinceMs = 0
  private threshold: number
  private preVoiceTimeoutMs: number
  private silenceHoldMs: number
  private maxRecordMs: number

  constructor(cfg: VadConfig = {}) {
    this.threshold = cfg.threshold ?? DEFAULT_VAD_THRESHOLD
    this.preVoiceTimeoutMs = cfg.preVoiceTimeoutMs ?? PRE_VOICE_TIMEOUT_MS
    this.silenceHoldMs = cfg.silenceHoldMs ?? SILENCE_HOLD_MS
    this.maxRecordMs = cfg.maxRecordMs ?? MAX_RECORD_MS
  }

  start(now: number = Date.now()): void {
    this.state = 'PRE_VOICE'
    this.startedAt = now
    this.silentSinceMs = 0
  }

  /** Feed a frame. Returns close reason if mic should close, otherwise null. */
  push(frame: Uint8Array, now: number = Date.now()): CloseReason | null {
    if (this.state === 'CLOSED') return 'manual'
    const elapsed = now - this.startedAt
    if (elapsed >= this.maxRecordMs) {
      this.state = 'CLOSED'
      return 'hard-cap'
    }
    const energy = rmsPcm16(frame)
    const voiced = energy >= this.threshold
    switch (this.state) {
      case 'PRE_VOICE': {
        if (voiced) {
          this.state = 'VOICE'
          return null
        }
        if (elapsed >= this.preVoiceTimeoutMs) {
          this.state = 'CLOSED'
          return 'no-speech'
        }
        return null
      }
      case 'VOICE': {
        if (!voiced) {
          this.state = 'POST_VOICE'
          this.silentSinceMs = now
        }
        return null
      }
      case 'POST_VOICE': {
        if (voiced) {
          this.state = 'VOICE'
          this.silentSinceMs = 0
          return null
        }
        if (now - this.silentSinceMs >= this.silenceHoldMs) {
          this.state = 'CLOSED'
          return 'voice-end'
        }
        return null
      }
    }
  }

  current(): VadState { return this.state }
  elapsedMs(now: number = Date.now()): number { return now - this.startedAt }
}

/** Useful for tests + debugging. PCM16 mono, optionally noisy/silent. */
export function _synthFrame(samples: number, level: number): Uint8Array {
  const buf = new Uint8Array(samples * 2)
  const view = new DataView(buf.buffer)
  for (let i = 0; i < samples; i++) {
    // Sine-ish: alternating signs so RMS ≈ level.
    const v = Math.round((i % 2 === 0 ? 1 : -1) * level * 32767)
    view.setInt16(i * 2, v, true)
  }
  return buf
}

/** Approx duration in ms of a PCM16 mono 16 kHz frame. */
export function frameDurationMs(frame: Uint8Array): number {
  const samples = frame.byteLength / BYTES_PER_SAMPLE
  return (samples / SAMPLE_RATE) * 1000
}
