// test/e2e/voice.spec.js
import { writeFile, rm, mkdtemp, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import { test, expect } from '@playwright/test'
import { startCli } from '../helpers/cli.js'
import { createCanvas } from '@napi-rs/canvas'

// Chromium's fake capture device hangs on macOS, so the microphone is a
// generated tone instead: a real MediaStream, recordable by MediaRecorder.
function fakeMicrophone() {
  navigator.mediaDevices.getUserMedia = async () => {
    const context = new AudioContext()
    const tone = context.createOscillator()
    const destination = context.createMediaStreamDestination()
    tone.connect(destination)
    tone.start()
    return destination.stream
  }
}

async function makeScript(dir, name, body) {
  const path = join(dir, name)
  await writeFile(path, `#!/bin/sh\n${body}\n`)
  await chmod(path, 0o755)
  return path
}

/**
 * Stand-ins for whisper-cli and ffmpeg, so the test runs without either
 * installed (CI has neither). ffmpeg is found on PATH, whisper by path.
 */
async function setUpFakeTranscription(dir) {
  await makeScript(dir, 'ffmpeg', 'for last; do :; done\necho wav > "$last"')
  const whisper = await makeScript(dir, 'whisper-cli', 'echo " Move the logo a bit to the left."')
  const model = join(dir, 'ggml-test.bin')
  await writeFile(model, 'model')
  return {
    ANNOTAITR_WHISPER_BIN: whisper,
    ANNOTAITR_WHISPER_MODEL: model,
    PATH: `${dir}${delimiter}${process.env.PATH}`
  }
}

test('a voice note is recorded, transcribed into the comment field and submitted', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-voice-'))
  const imagePath = join(dir, 'shot.png')
  const canvas = createCanvas(200, 150)
  canvas.getContext('2d').fillRect(0, 0, 200, 150)
  await writeFile(imagePath, canvas.toBuffer('image/png'))
  const cli = startCli([imagePath], await setUpFakeTranscription(dir))

  try {
    await page.addInitScript(fakeMicrophone)
    await page.goto(await cli.url)
    await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Pin \(/ }).click()
    const box = await page.locator('.image-canvas-wrapper').boundingBox()
    await page.mouse.click(box.x + 50, box.y + 50)

    const field = page.getByPlaceholder('Add a comment (optional)...')
    await field.fill('Logo:')
    await page.getByRole('button', { name: 'Record a voice note' }).click()
    await expect(page.getByRole('button', { name: /Stop recording/ })).toBeVisible()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /Stop recording/ }).click()

    await expect(field).toHaveValue('Logo: Move the logo a bit to the left.')
    await expect(field).toBeFocused()
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('button', { name: /^Send feedback/ }).click()
    await expect(page.getByRole('heading', { name: 'Feedback Submitted' })).toBeVisible()

    expect(await cli.exited).toBe(0)
    expect(cli.stdout()).toContain('> Logo: Move the logo a bit to the left.')
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (cli.child.exitCode === null) { cli.child.kill() }
  }
})

test('closing the comment box while microphone access is pending leaves the microphone off', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-voice-close-'))
  const imagePath = join(dir, 'shot.png')
  await writeFile(imagePath, createCanvas(200, 150).toBuffer('image/png'))
  const cli = startCli([imagePath], await setUpFakeTranscription(dir))

  try {
    // Access is granted only after the box is already closed.
    await page.addInitScript(() => {
      window.grantedTracks = []
      navigator.mediaDevices.getUserMedia = async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const context = new AudioContext()
        const destination = context.createMediaStreamDestination()
        context.createOscillator().connect(destination)
        window.grantedTracks.push(...destination.stream.getTracks())
        return destination.stream
      }
    })
    await page.goto(await cli.url)
    await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Pin \(/ }).click()
    const box = await page.locator('.image-canvas-wrapper').boundingBox()
    await page.mouse.click(box.x + 50, box.y + 50)
    await page.getByRole('button', { name: 'Record a voice note' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect.poll(() => page.evaluate(() => window.grantedTracks.length)).toBe(1)
    expect(await page.evaluate(() => window.grantedTracks.every((track) => track.readyState === 'ended'))).toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (cli.child.exitCode === null) { cli.child.kill() }
  }
})

test('without whisper.cpp the annotator offers no voice note', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-novoice-'))
  const imagePath = join(dir, 'shot.png')
  await writeFile(imagePath, createCanvas(200, 150).toBuffer('image/png'))
  const cli = startCli([imagePath], { ANNOTAITR_WHISPER_MODEL: '' })

  try {
    await page.goto(await cli.url)
    await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Pin \(/ }).click()
    const box = await page.locator('.image-canvas-wrapper').boundingBox()
    await page.mouse.click(box.x + 50, box.y + 50)
    await expect(page.getByPlaceholder('Add a comment (optional)...')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Record a voice note' })).toHaveCount(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (cli.child.exitCode === null) { cli.child.kill() }
  }
})
