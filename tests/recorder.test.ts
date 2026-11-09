import { describe, expect, it } from 'vitest'
import { PttRecorder } from '../src/recorder'
import { _synthFrame } from '../src/vad'
import type { RoleSpan } from '../src/types'

// 800 samples = 1600 bytes = 50 ms at 16 kHz mono 16-bit.
const loud = () => _synthFrame(800, 0.5)

describe('PttRecorder speaker-role spans', () => {
  it('records one span per run of same-tagged frames, in ms from the clip start', () => {
    const r = new PttRecorder({ maxRecordMs: 60_000 })
    r.start({ onClosed: () => {} })
    r.push(loud(), 'self'); r.push(loud(), 'self'); r.push(loud(), 'other'); r.push(loud())
    expect(r.roles()).toEqual([
      { startMs: 0, endMs: 100, role: 'self' },
      { startMs: 100, endMs: 150, role: 'other' },
      { startMs: 150, endMs: 200, role: 'unknown' },
    ])
  })

  it('hands the spans to onClosed and resets them on the next start', () => {
    let got: RoleSpan[] | null = null
    const r = new PttRecorder({ maxRecordMs: 60_000 })
    r.start({ onClosed: (_pcm, _reason, _ms, roles) => { got = roles } })
    r.push(loud(), 'other')
    r.closeManual()
    expect(got).toEqual([{ startMs: 0, endMs: 50, role: 'other' }])
    r.start({ onClosed: () => {} })
    expect(r.roles()).toEqual([])
  })

  it('reports an empty span list for a no-speech close', () => {
    let got: RoleSpan[] | null = null
    const r = new PttRecorder()
    r.start({ onClosed: (_pcm, _reason, _ms, roles) => { got = roles } })
    r.closeManual()
    expect(got).toEqual([])
  })

  it('returns a copy from roles(), not the live array', () => {
    const r = new PttRecorder({ maxRecordMs: 60_000 })
    r.start({ onClosed: () => {} })
    r.push(loud(), 'self')
    const a = r.roles()
    a[0]!.role = 'other'
    expect(r.roles()[0]!.role).toBe('self')
  })
})
