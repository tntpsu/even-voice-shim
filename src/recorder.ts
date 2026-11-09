// VAD-driven push-to-talk recorder. Wraps the VAD state machine + the
// PCM frame buffer so callers just push frames and get an onClosed
// callback with the assembled audio when speech ends.

import { Vad, type CloseReason, type VadConfig } from './vad'
import type { AudioFrame, RoleSpan, SpeakerRole } from './types'

const BYTES_PER_MS = 32 // 16 kHz mono 16-bit

function concat(frames: AudioFrame[]): Uint8Array {
  let total = 0
  for (const f of frames) total += f.byteLength
  const out = new Uint8Array(total)
  let offset = 0
  for (const f of frames) { out.set(f, offset); offset += f.byteLength }
  return out
}

export interface RecorderHandlers {
  /** Fired the first time voice is detected — useful for showing
   *  "Listening" feedback to the user only once they've actually spoken. */
  onVoice?: () => void
  /** Fired exactly once when the recorder closes, with the assembled
   *  PCM and the reason it closed. `pcm` is empty for `no-speech`.
   *  `roles` is the Even speaker tag of every frame as ms spans from the
   *  start of `pcm` (one span per run of same-tagged frames); untagged
   *  frames are `unknown`. */
  onClosed: (pcm: Uint8Array, reason: CloseReason, ms: number, roles: RoleSpan[]) => void
}

/**
 * VAD-driven recorder.
 *
 * Lifecycle:
 *   const r = new PttRecorder()
 *   r.start({ onVoice, onClosed })
 *   // push frames as they arrive from bridge.audioControl + onAudioData
 *   r.push(frame)
 *   r.push(frame)
 *   // ... onClosed fires when the user finishes speaking
 *
 * Use `closeManual()` to abort (e.g. user double-tapped to cancel).
 */
export class PttRecorder {
  private frames: AudioFrame[] = []
  private spans: RoleSpan[] = []
  private bytes = 0
  private vad: Vad
  private startedAt = 0
  private voicedSeen = false
  private closed = false
  private handlers: RecorderHandlers = { onClosed: () => {} }

  constructor(cfg: VadConfig = {}) {
    this.vad = new Vad(cfg)
  }

  start(handlers: RecorderHandlers): void {
    this.frames = []
    this.spans = []
    this.bytes = 0
    this.startedAt = Date.now()
    this.voicedSeen = false
    this.closed = false
    this.handlers = handlers
    this.vad.start(this.startedAt)
  }

  push(frame: AudioFrame, role: SpeakerRole = 'unknown'): void {
    if (this.closed) return
    this.frames.push(frame)
    const startMs = this.bytes / BYTES_PER_MS
    this.bytes += frame.byteLength
    const endMs = this.bytes / BYTES_PER_MS
    const last = this.spans[this.spans.length - 1]
    if (last && last.role === role) last.endMs = endMs
    else this.spans.push({ startMs, endMs, role })
    const reason = this.vad.push(frame)
    if (this.vad.current() === 'VOICE' && !this.voicedSeen) {
      this.voicedSeen = true
      this.handlers.onVoice?.()
    }
    if (reason !== null) this.close(reason)
  }

  /** Close manually — e.g. user double-tapped to abort. */
  closeManual(): void { this.close('manual') }

  private close(reason: CloseReason): void {
    if (this.closed) return
    this.closed = true
    const pcm = concat(this.frames)
    const ms = Date.now() - this.startedAt
    const roles = this.spans
    this.frames = []
    this.spans = []
    this.bytes = 0
    this.handlers.onClosed(pcm, reason, ms, roles)
  }

  /** Role spans recorded so far, in ms from the start of the clip. */
  roles(): RoleSpan[] { return this.spans.map(s => ({ ...s })) }

  byteLength(): number {
    let n = 0
    for (const f of this.frames) n += f.byteLength
    return n
  }
}
