import { describe, expect, it } from 'vitest'
import { Vad, _synthFrame, rmsPcm16, frameDurationMs } from '../src/vad'

describe('rmsPcm16', () => {
  it('returns ~0 for silence', () => {
    const silent = new Uint8Array(1600) // 100 ms of zeros
    expect(rmsPcm16(silent)).toBe(0)
  })
  it('returns the synthesized level for a synth frame', () => {
    const frame = _synthFrame(1600, 0.5)
    expect(rmsPcm16(frame)).toBeCloseTo(0.5, 2)
  })
  it('returns 0 for empty input', () => {
    expect(rmsPcm16(new Uint8Array(0))).toBe(0)
  })
})

describe('frameDurationMs', () => {
  it('handles 1600-byte (100ms) frames', () => {
    expect(frameDurationMs(new Uint8Array(1600))).toBeCloseTo(50, 1) // 800 samples / 16k
  })
})

describe('Vad', () => {
  it('closes with no-speech when only silent frames arrive', () => {
    const vad = new Vad({ preVoiceTimeoutMs: 1000 })
    vad.start(0)
    const silent = new Uint8Array(1600)
    expect(vad.push(silent, 0)).toBeNull()
    expect(vad.push(silent, 500)).toBeNull()
    expect(vad.push(silent, 1500)).toBe('no-speech')
  })

  it('transitions PRE_VOICE → VOICE when voiced frame arrives', () => {
    const vad = new Vad()
    vad.start(0)
    expect(vad.current()).toBe('PRE_VOICE')
    vad.push(_synthFrame(1600, 0.2), 0)
    expect(vad.current()).toBe('VOICE')
  })

  it('closes with voice-end after silence-hold of trailing silence', () => {
    const vad = new Vad({ silenceHoldMs: 500 })
    vad.start(0)
    vad.push(_synthFrame(1600, 0.2), 0)
    vad.push(_synthFrame(1600, 0.2), 100)
    expect(vad.push(new Uint8Array(1600), 200)).toBeNull()      // start of silence
    expect(vad.push(new Uint8Array(1600), 800)).toBe('voice-end')
  })

  it('resumes from POST_VOICE if user keeps talking', () => {
    const vad = new Vad({ silenceHoldMs: 500 })
    vad.start(0)
    vad.push(_synthFrame(1600, 0.2), 0)
    vad.push(new Uint8Array(1600), 100)
    expect(vad.current()).toBe('POST_VOICE')
    vad.push(_synthFrame(1600, 0.2), 200)
    expect(vad.current()).toBe('VOICE')
  })

  it('hard-cap closes a runaway recording', () => {
    const vad = new Vad({ maxRecordMs: 500 })
    vad.start(0)
    vad.push(_synthFrame(1600, 0.2), 0)
    expect(vad.push(_synthFrame(1600, 0.2), 600)).toBe('hard-cap')
  })
})
