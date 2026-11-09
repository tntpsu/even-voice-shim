// Public surface. Vendor by copy or git submodule until v1; npm publish
// is intentionally deferred so consumers don't depend on a stable API
// before the underlying Even Hub SDK gap (no on-device STT) is resolved.

export { Vad, rmsPcm16, frameDurationMs, _synthFrame } from './vad'
export type {
  VadState, VadConfig, CloseReason,
} from './vad'
export {
  DEFAULT_VAD_THRESHOLD, PRE_VOICE_TIMEOUT_MS, SILENCE_HOLD_MS, MAX_RECORD_MS,
} from './vad'

export { PttRecorder } from './recorder'
export type { RecorderHandlers } from './recorder'

export { transcribe, parseWords } from './transcribe'
export {
  filterWordsByRole, hasOtherAudio, mixOver, DEFAULT_FILTER_WORDS,
} from './speaker'
export type { FilterWordsConfig, FilteredWords, RoleMix } from './speaker'
export type {
  AudioFrame, TranscribeConfig, TranscribeResult, TranscribedWord,
  SpeakerRole, RoleSpan,
} from './types'
