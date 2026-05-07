# even-voice-shim-worker

Minimal Cloudflare Worker that proxies a single endpoint:

- `POST /transcribe` — body is raw PCM16 mono 16 kHz audio (matching what `bridge.audioControl` delivers). Worker wraps as WAV, calls Deepgram's HTTP `/v1/listen`, returns `{ ok: true, text }`.

## Deploy

```bash
cd worker-template
npm install
npx wrangler login
npx wrangler secret put SHARED_SECRET     # any long random string; paste this into your plugin's settings
npx wrangler secret put DEEPGRAM_API_KEY  # from https://console.deepgram.com
npx wrangler deploy
```

Wrangler prints the deployed URL (e.g. `https://even-voice-shim-worker.<your-subdomain>.workers.dev`). Paste that into your plugin's "Worker URL" setting and the SHARED_SECRET into "Worker secret".

## Health check

```bash
curl https://<your-worker>.workers.dev/healthz   # → "ok"
```

## Tail logs while debugging

```bash
npx wrangler tail
```

## Costs at low usage

- Cloudflare Workers: free tier covers up to 100k requests/day
- Deepgram nova-2: ~$0.0043 / minute of audio at the time of writing

For a workout-logging app that records ~5 s × 30 sets/day, that's ~$0.01/day. For a live-captioning app it scales with conversation length.

## Why a personal worker

The Even Hub SDK doesn't expose on-device STT, so plugins must ship audio to *somewhere*. A user-deployed worker keeps your Deepgram key out of the plugin bundle and gives you control of your own billing. The shim's `transcribe()` client expects the worker to live at the URL you paste into your plugin settings; it sends the bearer token verbatim as `Authorization: Bearer <SHARED_SECRET>`.

When (if) Even Realities ships a `bridge.recognizeSpeech()` API, this whole worker becomes deletable.
