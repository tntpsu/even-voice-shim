// Keep the wearer's words, drop the room's. The Even app tags every audio
// frame as self / other / unknown; the recorder keeps those tags as ms
// spans per clip, Deepgram times every word, and this lays one over the
// other. Nothing is dropped before transcription, so the caller can always
// fall back to the full transcript when the filtered one makes no sense.

import type { RoleSpan, SpeakerRole, TranscribedWord } from './types'

export type RoleMix = Record<SpeakerRole, number>

export function mixOver(spans: readonly RoleSpan[], startMs: number, endMs: number): RoleMix {
  const mix: RoleMix = { self: 0, other: 0, unknown: 0 }
  if (!(endMs > startMs)) return mix
  for (const s of spans) {
    const overlap = Math.min(s.endMs, endMs) - Math.max(s.startMs, startMs)
    if (overlap > 0) mix[s.role] += overlap
  }
  return mix
}

export interface FilterWordsConfig {
  /** Share of a word's duration tagged `other` above which the word is dropped. */
  otherShare: number
}

export const DEFAULT_FILTER_WORDS: FilterWordsConfig = { otherShare: 0.5 }

export interface FilteredWords {
  text: string
  kept: number
  dropped: number
  /** Ms of the clip tagged other, self, unknown: for logs and field judgement. */
  mix: RoleMix
}

/** Drop words that fall mostly on `other`-tagged audio. Untagged (`unknown`)
 *  and self audio both keep their words, so the phone mic, where every frame
 *  is unknown, passes everything through unchanged. A word with no span under
 *  it at all is kept. */
export function filterWordsByRole(
  words: readonly TranscribedWord[],
  spans: readonly RoleSpan[],
  cfg: FilterWordsConfig = DEFAULT_FILTER_WORDS,
): FilteredWords {
  const kept: string[] = []
  let dropped = 0
  for (const w of words) {
    const m = mixOver(spans, w.startMs, w.endMs)
    const total = m.self + m.other + m.unknown
    if (total > 0 && m.other / total > cfg.otherShare) dropped += 1
    else kept.push(w.word)
  }
  const whole = spans.length ? mixOver(spans, spans[0]!.startMs, spans[spans.length - 1]!.endMs) : { self: 0, other: 0, unknown: 0 }
  return { text: kept.join(' '), kept: kept.length, dropped, mix: whole }
}

/** True when the clip carries enough `other`-tagged audio for filtering to
 *  change anything worth logging. */
export function hasOtherAudio(spans: readonly RoleSpan[], minMs = 150): boolean {
  let other = 0
  for (const s of spans) if (s.role === 'other') other += s.endMs - s.startMs
  return other >= minMs
}
