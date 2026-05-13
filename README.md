# even-voice-shim

Push-to-talk speech-to-text for [Even Realities G2](https://www.evenrealities.com) plugins. Workaround for the missing on-device STT API in `@evenrealities/even_hub_sdk`.

> **Status:** v0.1.0 — pre-stable. Vendor by copy or git submodule. **Not on npm yet** — the API surface is intentionally unstable until either (a) it stabilizes through use, or (b) Even Realities ships a native STT bridge method and this whole package becomes deletable.

## What this is

A small TypeScript library plus a one-file Cloudflare Worker template, together solving the same problem the same way every time:

1. Capture PCM16 mono 16 kHz audio from `bridge.audioControl`.
2. Use VAD (voice activity detection) to close the mic shortly after the user finishes speaking.
3. POST the buffered PCM to your personal Cloudflare Worker.
4. Worker wraps as WAV, hits Deepgram, returns `{ text }`.

End-to-end latency is ~1.0–1.4 s for short utterances ("two twenty-five for five"). Worker hosting is free at Even Hub plugin scale; Deepgram bills per second of audio (~$0.01/day for typical voice-command apps).

## What this isn't

- Not a way for plugins to skip integration. **Each plugin still has to import the library and configure a worker.** A library is never automatic.
- Not a streaming transcription engine. One-shot push-to-talk only. (Use Deepgram's WebSocket interface directly if you need partial transcripts.)
- Not a replacement for an on-device STT API. The whole point of this package is that one of those doesn't exist yet — see [Why this exists](#why-this-exists) below.

## Why this exists

The Even Hub SDK (`@evenrealities/even_hub_sdk@0.0.10` at the time of writing) exposes glasses-mic audio via `bridge.audioControl(true)` + an `onAudioData` event delivering mono 16 kHz PCM. It does **not** expose any speech-to-text method, even though both iOS (`SFSpeechRecognizer`) and Android (`SpeechRecognizer`) ship free, on-device STT primitives that would be straightforward to bridge.

Today, every voice-driven plugin is solving the same problem the same way: deploy a Cloudflare Worker, wire it to a paid STT provider (Deepgram, Whisper, etc.), manage keys and bearer tokens in plugin settings. This package extracts that pattern out of two existing apps so the third, fourth, and fifth voice-driven plugins don't have to redo it from scratch.

A platform-level fix is the right long-term answer. Pinging the [Even Realities developer Discord](https://discord.gg/Y4jHMCU4sv) or filing an issue against the [`even-realities/everything-evenhub`](https://github.com/even-realities/everything-evenhub) docs repo asking for a `bridge.recognizeSpeech()` SDK method is the path to make this package obsolete. Until that lands, this is the best alternative.

## Install

This package is **not on npm**. Vendor it via one of:

**git submodule:**
```bash
git submodule add https://github.com/tntpsu/even-voice-shim vendor/even-voice-shim
```
Then in your `tsconfig.json` add the path:
```json
{ "compilerOptions": { "paths": { "even-voice-shim": ["./vendor/even-voice-shim/src/index.ts"] } } }
```

**Or copy the four files directly:**
```
src/types.ts
src/vad.ts
src/recorder.ts
src/transcribe.ts
```
into your plugin's source tree. They have zero dependencies.

## Plugin-side usage

```ts
import { PttRecorder, transcribe } from 'even-voice-shim'

const recorder = new PttRecorder()

// Wire to whatever ring/glasses gesture your plugin uses for "open mic":
async function startListening() {
  recorder.start({
    onVoice: () => {
      // First voiced frame heard — show "Listening" indicator.
    },
    onClosed: async (pcm, reason, ms) => {
      // Mic closed (silence detected, hard cap, manual abort, etc.).
      if (reason === 'no-speech' || pcm.byteLength === 0) return
      const result = await transcribe(pcm, {
        workerUrl: settings.workerUrl,
        workerSecret: settings.workerSecret,
      })
      if (result.ok) handleTranscript(result.text)
      else showError(result.error ?? 'transcribe failed')
    },
  })
  // Start the bridge mic and forward each PCM frame:
  await bridge.audioControl(true)
  bridge.onEvenHubEvent.audioEvent(({ audioPcm }) => recorder.push(audioPcm))
}
```

`PttRecorder` accepts an optional `VadConfig` to tune the silence-hold, pre-voice timeout, and threshold for noisy environments. Defaults are tuned for typical living-room and gym noise.

## Worker-side usage

See [`worker-template/`](./worker-template/) for the one-file Cloudflare Worker. Deploy it with `wrangler deploy`, set `SHARED_SECRET` and `DEEPGRAM_API_KEY` as Wrangler secrets, paste the deployed URL + secret into your plugin's settings.

## License

MIT.
