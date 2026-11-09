import { describe, expect, it } from 'vitest'
import { filterWordsByRole, hasOtherAudio, mixOver } from '../src/speaker'
import type { RoleSpan, TranscribedWord } from '../src/types'

// A 3 s clip: the wearer speaks for 1.5 s, a neighbour cuts in for 1 s, then
// the mic is untagged for the tail.
const spans: RoleSpan[] = [
  { startMs: 0, endMs: 1500, role: 'self' },
  { startMs: 1500, endMs: 2500, role: 'other' },
  { startMs: 2500, endMs: 3000, role: 'unknown' },
]
const words: TranscribedWord[] = [
  { word: '225', startMs: 100, endMs: 600 },
  { word: 'for', startMs: 650, endMs: 800 },
  { word: '5', startMs: 850, endMs: 1200 },
  { word: 'nice', startMs: 1600, endMs: 1900 },     // the neighbour
  { word: 'bro', startMs: 1950, endMs: 2300 },      // the neighbour
  { word: 'thanks', startMs: 2600, endMs: 2900 },   // untagged tail
]

describe('mixOver', () => {
  it('sums each role under a window', () => {
    expect(mixOver(spans, 1000, 2000)).toEqual({ self: 500, other: 500, unknown: 0 })
    expect(mixOver(spans, 5000, 6000)).toEqual({ self: 0, other: 0, unknown: 0 })
    expect(mixOver(spans, 2000, 1000)).toEqual({ self: 0, other: 0, unknown: 0 })
  })
})

describe('filterWordsByRole', () => {
  it('drops the words that sit on other-tagged audio and keeps self and untagged words', () => {
    const f = filterWordsByRole(words, spans)
    expect(f.text).toBe('225 for 5 thanks')
    expect(f.kept).toBe(4)
    expect(f.dropped).toBe(2)
    expect(f.mix).toEqual({ self: 1500, other: 1000, unknown: 500 })
  })

  it('passes everything through on the phone mic, where every frame is unknown', () => {
    const phone: RoleSpan[] = [{ startMs: 0, endMs: 3000, role: 'unknown' }]
    const f = filterWordsByRole(words, phone)
    expect(f.text).toBe('225 for 5 nice bro thanks')
    expect(f.dropped).toBe(0)
  })

  it('keeps a word with no span under it and handles an empty span list', () => {
    const f = filterWordsByRole([{ word: 'late', startMs: 4000, endMs: 4200 }], spans)
    expect(f.text).toBe('late')
    const none = filterWordsByRole(words, [])
    expect(none.text).toBe('225 for 5 nice bro thanks')
    expect(none.mix).toEqual({ self: 0, other: 0, unknown: 0 })
  })

  it('judges a word straddling the boundary by its majority role', () => {
    const straddle: TranscribedWord[] = [
      { word: 'mostly-self', startMs: 1200, endMs: 1700 },   // 300 self / 200 other
      { word: 'mostly-other', startMs: 1400, endMs: 1900 },  // 100 self / 400 other
      { word: 'even', startMs: 1300, endMs: 1700 },          // 200 / 200: kept, not above the bar
    ]
    expect(filterWordsByRole(straddle, spans).text).toBe('mostly-self even')
    expect(filterWordsByRole(straddle, spans, { otherShare: 0.45 }).text).toBe('mostly-self')
    expect(filterWordsByRole(straddle, spans, { otherShare: 0.3 }).text).toBe('')
  })

  it('returns an empty text when every word was someone else', () => {
    const f = filterWordsByRole([{ word: 'nice', startMs: 1600, endMs: 1900 }], spans)
    expect(f.text).toBe('')
    expect(f.kept).toBe(0)
  })
})

describe('hasOtherAudio', () => {
  it('needs at least 150 ms of other by default', () => {
    expect(hasOtherAudio(spans)).toBe(true)
    expect(hasOtherAudio([{ startMs: 0, endMs: 100, role: 'other' }])).toBe(false)
    expect(hasOtherAudio([{ startMs: 0, endMs: 100, role: 'other' }], 100)).toBe(true)
    expect(hasOtherAudio([])).toBe(false)
  })
})
