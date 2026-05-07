// VAD-driven push-to-talk recorder. Wraps the VAD state machine + the
// PCM frame buffer so callers just push frames and get an onClosed
// callback with the assembled audio when speech ends.

import { Vad, type CloseReason, type VadConfig } from './vad'
import type { AudioFrame } from './types'

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
   *  PCM and the reason it closed. `pcm` is empty for `no-speech`. */
  onClosed: (pcm: Uint8Array, reason: CloseReason, ms: number) => void
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
    this.startedAt = Date.now()
    this.voicedSeen = false
    this.closed = false
    this.handlers = handlers
    this.vad.start(this.startedAt)
  }

  push(frame: AudioFrame): void {
    if (this.closed) return
    this.frames.push(frame)
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
    this.frames = []
    this.handlers.onClosed(pcm, reason, ms)
  }

  byteLength(): number {
    let n = 0
    for (const f of this.frames) n += f.byteLength
    return n
  }
}
