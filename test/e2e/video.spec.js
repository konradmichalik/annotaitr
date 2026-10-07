// test/e2e/video.spec.js
import { writeFile, rm, mkdtemp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { startCli } from '../helpers/cli.js'
import { GifWriter } from 'omggif'

// 2 s of ffmpeg's testsrc2 at 160x90 and 10 fps, VP8: Playwright's Chromium
// ships no H.264 decoder, so an MP4 fixture would not play there.
const WEBM_FIXTURE = join(process.cwd(), 'test', 'fixtures', 'clip.webm')

function makeGif(path) {
  const palette = [0xff0000, 0x00ff00, 0x0000ff, 0xffffff]
  const buffer = new Uint8Array(16384)
  const writer = new GifWriter(buffer, 40, 30, { palette, loop: 0 })
  for (const color of [0, 1, 2]) {
    writer.addFrame(0, 0, 40, 30, new Array(40 * 30).fill(color), { delay: 20 })
  }
  return writeFile(path, buffer.slice(0, writer.end()))
}

async function drawBox(page, from, to) {
  await page.getByRole('toolbar', { name: 'Annotation tools' }).getByText('Box').click()
  const canvas = await page.locator('.image-canvas-wrapper').boundingBox()
  await page.mouse.move(canvas.x + from[0], canvas.y + from[1])
  await page.mouse.down()
  await page.mouse.move(canvas.x + to[0], canvas.y + to[1])
  await page.mouse.up()
}

async function addComment(page, text) {
  await page.getByPlaceholder('Add a comment (optional)...').fill(text)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
}

test('a video gets a point and a span annotation and the CLI prints frames for both', async ({ page }) => {
  const cli = startCli([WEBM_FIXTURE])
  try {
    await page.goto(await cli.url)
    const time = page.locator('.timeline-time')
    await expect(time).toContainText('/ 00:02.000')

    await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible()
    await page.keyboard.press('m')
    await expect(page.getByRole('button', { name: 'Mute', exact: true })).toBeVisible()
    await page.keyboard.press('m')

    await page.getByRole('button', { name: /Mark span/ }).focus()
    await expect(page.getByRole('tooltip')).toContainText('Comment on something that lasts')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toBeHidden()

    await page.keyboard.press('Shift+ArrowRight')
    await expect(time).toContainText('00:01.000 /')
    await drawBox(page, [20, 20], [80, 60])
    await expect(page.locator('.comment-popover-time')).toHaveText('At 00:01.000')
    await addComment(page, 'Box on the first second')

    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('i')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('o')
    await page.getByRole('button', { name: 'Comment span' }).click()
    await page.locator('.panel-global-textarea').fill('Span without drawing')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('button', { name: /Annotation 1 from 00:00.900 to 00:01.200/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Annotation 2 at 00:01.000/ })).toBeVisible()

    await page.getByRole('button', { name: /^Send feedback/ }).click()
    await expect(page.getByRole('heading', { name: 'Feedback Submitted' })).toBeVisible({ timeout: 20_000 })

    expect(await cli.exited).toBe(0)
    const stdout = cli.stdout()
    expect(stdout).toContain('2 annotations on the recording clip.webm (00:02.000, 160x90).')
    expect(stdout).toMatch(/### 1\. \[#\w+\] from 00:00\.900 to 00:01\.200, Span comment/)
    expect(stdout).toMatch(/### 2\. \[#\w+\] at 00:01\.000, Boxed area/)
    for (const [, path] of stdout.matchAll(/(?:Frame|Strip|Overview): (\S+)/g)) {
      expect(existsSync(path)).toBe(true)
    }
  } finally {
    if (cli.child.exitCode === null) { cli.child.kill() }
  }
})

test('dragging a span marker resizes and moves it, and undo restores it', async ({ page }) => {
  const cli = startCli([WEBM_FIXTURE])
  try {
    await page.goto(await cli.url)
    const time = page.locator('.timeline-time')
    await expect(time).toContainText('/ 00:02.000')

    await page.keyboard.press('i')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('o')
    await page.getByRole('button', { name: 'Comment span' }).click()
    await page.locator('.panel-global-textarea').fill('Span')
    await page.getByRole('button', { name: 'Save' }).click()

    const span = page.getByRole('button', { name: /Annotation 1 from 00:00.000 to 00:01.000/ })
    const box = await span.boundingBox()
    const track = await page.locator('.timeline-track').boundingBox()
    const pxPerSecond = track.width / 2

    // Drag the end edge half a second to the right.
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 2 + pxPerSecond / 2, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: /Annotation 1 from 00:00.000 to 00:01.5/ })).toBeVisible()

    // Drag the whole span a quarter second to the right.
    const moved = await page.getByRole('button', { name: /Annotation 1 from/ }).boundingBox()
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2)
    await page.mouse.down()
    await page.mouse.move(moved.x + moved.width / 2 + pxPerSecond / 4, moved.y + moved.height / 2, { steps: 5 })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: /Annotation 1 from 00:00.2\d\d to 00:01.7/ })).toBeVisible()

    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByRole('button', { name: /Annotation 1 from 00:00.000 to 00:01.5/ })).toBeVisible()

    await page.getByRole('button', { name: /Annotation 1 from/ }).focus()
    await page.keyboard.press('Alt+ArrowRight')
    await expect(page.getByRole('button', { name: /Annotation 1 from 00:00.100/ })).toBeVisible()
  } finally {
    if (cli.child.exitCode === null) { cli.child.kill() }
  }
})

test('a point annotation becomes a span by dragging its handle or with Alt+Shift+Right', async ({ page }) => {
  const cli = startCli([WEBM_FIXTURE])
  try {
    await page.goto(await cli.url)
    await expect(page.locator('.timeline-time')).toContainText('/ 00:02.000')

    await drawBox(page, [20, 20], [80, 60])
    await addComment(page, 'First')
    const point = page.getByRole('button', { name: /Annotation 1 at 00:00.000/ })
    const dot = await point.boundingBox()
    const track = await page.locator('.timeline-track').boundingBox()

    await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2)
    await page.mouse.move(dot.x + dot.width + 6, dot.y + dot.height / 2)
    await page.mouse.down()
    await page.mouse.move(dot.x + dot.width + 6 + track.width / 4, dot.y + dot.height / 2, { steps: 5 })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: /Annotation 1 from 00:00.000 to 00:00.5/ })).toBeVisible()

    // Dragging an end leaves the player on that end, at 0.5 s.
    await expect(page.locator('.timeline-time')).toContainText('00:00.500 /')
    await page.keyboard.press('Shift+ArrowRight')
    await drawBox(page, [20, 20], [80, 60])
    await addComment(page, 'Second')
    await page.getByRole('button', { name: /Annotation 2 at 00:01.500/ }).focus()
    await page.keyboard.press('Alt+Shift+ArrowRight')
    await expect(page.getByRole('button', { name: /Annotation 2 from 00:01.500 to 00:01.600/ })).toBeVisible()
  } finally {
    if (cli.child.exitCode === null) { cli.child.kill() }
  }
})

test('a GIF steps frame by frame and exports the annotated frame', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-gif-'))
  const gifPath = join(dir, 'anim.gif')
  await makeGif(gifPath)
  const cli = startCli([gifPath])
  try {
    await page.goto(await cli.url)
    const time = page.locator('.timeline-time')
    await expect(time).toContainText('00:00.000 / 00:00.600')

    await page.keyboard.press('ArrowRight')
    await expect(time).toContainText('00:00.200 /')
    await drawBox(page, [5, 5], [30, 25])
    await addComment(page, 'Second frame')

    await page.getByRole('button', { name: /^Send feedback/ }).click()
    await expect(page.getByRole('heading', { name: 'Feedback Submitted' })).toBeVisible({ timeout: 20_000 })

    expect(await cli.exited).toBe(0)
    expect(cli.stdout()).toMatch(/### 1\. \[#\w+\] at 00:00\.200, Boxed area/)
    expect(cli.stdout()).toMatch(/Frame: \S+frame-01-00m00\.200s\.png/)
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (cli.child.exitCode === null) { cli.child.kill() }
  }
})
