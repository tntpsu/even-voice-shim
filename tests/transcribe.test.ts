import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseWords, transcribe } from '../src/transcribe'

const cfg = { workerUrl: 'https://shim.example.workers.dev/', workerSecret: 's3cret' }

afterEach(() => { vi.unstubAllGlobals() })

describe('parseWords', () => {
  it('maps Deepgram seconds to ms and skips malformed entries', () => {
    expect(parseWords([
      { word: '225', start: 0.1, end: 0.62 },
      { word: 'for', start: 0.7 },
      { start: 0.8, end: 0.9 },
      { word: '5', start: 'x', end: 1.2 },
      { word: 'ok', start: 1.3, end: 1.5 },
    ])).toEqual([
      { word: '225', startMs: 100, endMs: 620 },
      { word: 'ok', startMs: 1300, endMs: 1500 },
    ])
  })

  it('returns undefined when the Worker sent no words array (pre-0.2.0 Worker)', () => {
    expect(parseWords(undefined)).toBeUndefined()
    expect(parseWords('nope')).toBeUndefined()
  })
})

describe('transcribe', () => {
  it('returns text and words from a 0.2.0 Worker', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ ok: true, text: '225 for 5', words: [{ word: '225', start: 0, end: 0.5 }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    })
    const r = await transcribe(new Uint8Array(3200), cfg)
    expect(calls[0]!.url).toBe('https://shim.example.workers.dev/transcribe')
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer s3cret')
    expect(r.ok).toBe(true)
    expect(r.text).toBe('225 for 5')
    expect(r.words).toEqual([{ word: '225', startMs: 0, endMs: 500 }])
  })

  it('leaves words off when an older Worker returns only text', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: true, text: 'skip' }), { status: 200 }))
    const r = await transcribe(new Uint8Array(3200), cfg)
    expect(r).toEqual({ ok: true, text: 'skip', durationMs: expect.any(Number) })
    expect('words' in r).toBe(false)
  })

  it('refuses without config or audio, and surfaces HTTP errors', async () => {
    expect((await transcribe(new Uint8Array(10), { workerUrl: '', workerSecret: '' })).ok).toBe(false)
    expect((await transcribe(new Uint8Array(0), cfg)).ok).toBe(false)
    vi.stubGlobal('fetch', async () => new Response('bad key', { status: 401 }))
    const r = await transcribe(new Uint8Array(10), cfg)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/HTTP 401/)
  })
})
