import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, rm, chmod, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import {
  transcriptionConfig, detectTranscription, transcribeAudio, createTranscriptionRouter, inputFormatFor
} from '../../../../server/image/common/transcribe.js'

async function makeScript(dir, name, body) {
  const path = join(dir, name)
  await writeFile(path, `#!/bin/sh\n${body}\n`)
  await chmod(path, 0o755)
  return path
}

describe('transcription', () => {
  let dir
  let config

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-transcribe-test-'))
    const model = join(dir, 'ggml-base.bin')
    await writeFile(model, 'model')
    // Stand-ins for ffmpeg and whisper-cli: ffmpeg writes its last argument
    // (the WAV path), whisper prints its language flag and a transcript.
    const ffmpeg = await makeScript(dir, 'ffmpeg', `echo "$@" > "${join(dir, 'ffmpeg-args')}"\nfor last; do :; done\necho wav > "$last"`)
    const bin = await makeScript(dir, 'whisper-cli', [
      'while [ $# -gt 0 ]; do case "$1" in -l) lang="$2"; shift;; esac; shift; done',
      'echo ""',
      'echo " The button flickers"',
      'echo " when I hover it. [$lang]"'
    ].join('\n'))
    config = { bin, model, language: 'de', ffmpeg }
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  describe('transcriptionConfig', () => {
    it('reads the model, binary and language from the environment', () => {
      expect(transcriptionConfig({ ANNOTAITR_WHISPER_MODEL: '/m.bin', ANNOTAITR_WHISPER_LANG: 'de' })).toEqual({
        bin: 'whisper-cli', model: '/m.bin', language: 'de', ffmpeg: 'ffmpeg'
      })
    })

    it('defaults to automatic language detection and no model', () => {
      expect(transcriptionConfig({})).toMatchObject({ model: null, language: 'auto' })
    })
  })

  describe('detectTranscription', () => {
    it('is available when binary, model and ffmpeg all exist', async () => {
      expect(await detectTranscription(config)).toBe(true)
    })

    it('is unavailable without a model', async () => {
      expect(await detectTranscription({ ...config, model: null })).toBe(false)
      expect(await detectTranscription({ ...config, model: join(dir, 'missing.bin') })).toBe(false)
    })

    it('is unavailable when a binary is missing', async () => {
      expect(await detectTranscription({ ...config, bin: 'definitely-not-installed-whisper' })).toBe(false)
      expect(await detectTranscription({ ...config, ffmpeg: join(dir, 'nope') })).toBe(false)
    })
  })

  describe('transcribeAudio', () => {
    it('returns the transcript as one trimmed line and cleans up its temp files', async () => {
      const before = (await readdir(tmpdir())).filter((n) => n.startsWith('annotaitr-voice-')).length
      expect(await transcribeAudio(Buffer.from('audio'), 'audio/webm;codecs=opus', config)).toBe('The button flickers when I hover it. [de]')
      const after = (await readdir(tmpdir())).filter((n) => n.startsWith('annotaitr-voice-')).length
      expect(after).toBe(before)
    })

    it('rejects when whisper fails', async () => {
      const failing = await makeScript(dir, 'whisper-fail', 'echo boom >&2\nexit 3')
      await expect(transcribeAudio(Buffer.from('audio'), 'audio/webm', { ...config, bin: failing })).rejects.toThrow(/Transcription failed/)
    })

    it('tells ffmpeg the input format, allows only local files and caps the length', async () => {
      await transcribeAudio(Buffer.from('audio'), 'audio/mp4', config)
      const args = await readFile(join(dir, 'ffmpeg-args'), 'utf8')
      expect(args).toMatch(/-protocol_whitelist file -f mov -i \S+/)
      expect(args).toMatch(/-t 300/)
    })
  })

  describe('inputFormatFor', () => {
    it('maps the recorder MIME types of Chrome, Firefox and Safari', () => {
      expect(inputFormatFor('audio/webm;codecs=opus')).toBe('webm')
      expect(inputFormatFor('audio/ogg; codecs=opus')).toBe('ogg')
      expect(inputFormatFor('audio/mp4')).toBe('mov')
    })

    it('knows no other format', () => {
      expect(inputFormatFor('audio/x-mpegurl')).toBeNull()
      expect(inputFormatFor(undefined)).toBeNull()
    })
  })

  describe('POST /api/transcribe', () => {
    async function serve(available) {
      const app = express()
      app.use(createTranscriptionRouter({ available, config }))
      const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
      return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
    }

    it('transcribes uploaded audio', async () => {
      const server = await serve(true)
      try {
        const res = await fetch(`${server.url}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/webm;codecs=opus' }, body: 'audio' })
        expect(res.status).toBe(200)
        expect((await res.json()).data.text).toContain('The button flickers')
      } finally { server.close() }
    })

    it('answers 404 when transcription is not set up', async () => {
      const server = await serve(false)
      try {
        const res = await fetch(`${server.url}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: 'audio' })
        expect(res.status).toBe(404)
      } finally { server.close() }
    })

    it('rejects an audio type ffmpeg is not allowed to read', async () => {
      const server = await serve(true)
      try {
        const res = await fetch(`${server.url}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/x-mpegurl' }, body: '#EXTM3U' })
        expect(res.status).toBe(400)
      } finally { server.close() }
    })

    it('rejects a body that is not audio', async () => {
      const server = await serve(true)
      try {
        const res = await fetch(`${server.url}/api/transcribe`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' })
        expect(res.status).toBe(400)
      } finally { server.close() }
    })
  })
})
