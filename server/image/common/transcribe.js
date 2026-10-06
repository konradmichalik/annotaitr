/**
 * Optional voice notes: turn a recording from the comment popover into text
 * with whisper.cpp, entirely on this machine. Like playwright for capture,
 * it is only offered when its tools are installed: `whisper-cli`, a ggml
 * model (ANNOTAITR_WHISPER_MODEL) and ffmpeg to convert the browser's audio.
 */

import { execFile } from 'node:child_process'
import { access, constants, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import express, { Router } from 'express'

const run = promisify(execFile)

const UPLOAD_LIMIT = '25mb'
// The client stops recording after 2 minutes; this only bounds what a
// crafted upload could make ffmpeg decode.
const MAX_SECONDS = '300'
// What browsers' MediaRecorder produces, mapped to ffmpeg demuxers. The
// format is always given explicitly: left to probe, ffmpeg also accepts
// playlist formats that make it open URLs or other local files.
const INPUT_FORMATS = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mov' }

export function inputFormatFor(contentType) {
  const mime = contentType?.split(';')[0].trim().toLowerCase()
  return INPUT_FORMATS[mime] ?? null
}

const CONVERT_TIMEOUT_MS = 30_000
const TRANSCRIBE_TIMEOUT_MS = 120_000

export function transcriptionConfig(env = process.env) {
  return {
    bin: env.ANNOTAITR_WHISPER_BIN || 'whisper-cli',
    model: env.ANNOTAITR_WHISPER_MODEL || null,
    language: env.ANNOTAITR_WHISPER_LANG || 'auto',
    ffmpeg: 'ffmpeg'
  }
}

async function isExecutable(path) {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** A bare command name is looked up on PATH, anything with a slash is taken as a path. */
async function resolveCommand(command) {
  if (command.includes('/')) { return isExecutable(command) }
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  for (const dir of dirs) {
    if (await isExecutable(join(dir, command))) { return true }
  }
  return false
}

export async function detectTranscription(config) {
  if (!config.model) { return false }
  try {
    await access(config.model, constants.R_OK)
  } catch {
    return false
  }
  return (await resolveCommand(config.bin)) && (await resolveCommand(config.ffmpeg))
}

/**
 * Convert the recording to the 16 kHz mono WAV whisper.cpp expects, then
 * transcribe it. Commands run without a shell, so no argument is ever
 * interpreted. The temp files are removed whatever happens.
 */
export async function transcribeAudio(buffer, contentType, config) {
  const format = inputFormatFor(contentType)
  if (!format) { throw new Error(`Unsupported recording format: ${contentType}`) }
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-voice-'))
  const input = join(dir, 'note')
  const wav = join(dir, 'note.wav')
  try {
    await writeFile(input, buffer)
    await run(config.ffmpeg, [
      '-nostdin', '-loglevel', 'error', '-protocol_whitelist', 'file', '-f', format, '-i', input,
      '-t', MAX_SECONDS, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav
    ], { timeout: CONVERT_TIMEOUT_MS })
    const { stdout } = await run(config.bin, ['-m', config.model, '-f', wav, '-l', config.language, '-nt', '-np'], {
      timeout: TRANSCRIBE_TIMEOUT_MS
    })
    return stdout.split('\n').map((line) => line.trim()).filter(Boolean).join(' ')
  } catch (error) {
    throw new Error(`Transcription failed: ${error.stderr?.trim() || error.message}`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const isAudio = (req) => (req.headers['content-type'] ?? '').startsWith('audio/')

export function createTranscriptionRouter({ available, config }) {
  const router = Router()
  // One transcription at a time: whisper uses every core it gets.
  let busy = false

  router.post('/api/transcribe', express.raw({ type: isAudio, limit: UPLOAD_LIMIT }), async (req, res) => {
    if (!available) {
      return res.status(404).json({ success: false, error: 'Voice notes need whisper.cpp, see docs/usage.md' })
    }
    if (!inputFormatFor(req.headers['content-type']) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ success: false, error: 'Expected a WebM, Ogg or MP4 audio recording' })
    }
    if (busy) { return res.status(409).json({ success: false, error: 'A voice note is already being transcribed' }) }
    busy = true
    try {
      res.json({ success: true, data: { text: await transcribeAudio(req.body, req.headers['content-type'], config) } })
    } catch (error) {
      console.error(error.message)
      res.status(500).json({ success: false, error: error.message })
    } finally {
      busy = false
    }
  })

  return router
}
