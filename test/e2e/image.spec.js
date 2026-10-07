// test/e2e/image.spec.js
import { spawn } from 'node:child_process'
import { writeFile, rm, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { createCanvas } from '@napi-rs/canvas'
import { startCli } from '../helpers/cli.js'

function makeFixturePngFile(dir) {
  const canvas = createCanvas(200, 150)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#336699'
  ctx.fillRect(0, 0, 200, 150)
  const path = join(dir, 'fixture.png')
  return { path, buffer: canvas.toBuffer('image/png') }
}

test('a full box annotation submits and the CLI prints structured feedback', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-'))
  const { path: imagePath, buffer } = makeFixturePngFile(dir)
  await writeFile(imagePath, buffer)

  const child = spawn('node', [join(process.cwd(), 'index.js'), imagePath], {
    cwd: process.cwd(),
    env: { ...process.env, ANNOTAITR_PORT: '0', ANNOTAITR_NO_OPEN: '1' }
  })

  try {
    let stdout = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })

    const url = await new Promise((resolve, reject) => {
      let stderr = ''
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
        const match = stderr.match(/Server running at (http:\/\/\S+)/)
        if (match) { resolve(match[1]) }
      })
      child.on('exit', (code) => reject(new Error(`CLI exited early with code ${code}: ${stderr}`)))
    })

    await page.goto(url)
    await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Box \(/ }).click()

    const image = page.locator('.image-canvas-wrapper')
    const box = await image.boundingBox()
    await page.mouse.move(box.x + 20, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + 80, box.y + 60)
    await page.mouse.up()

    await page.getByPlaceholder('Add a comment…').fill('Move this element up')
    // Exact match: other buttons, such as a card's, also contain "Add".
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByRole('button', { name: /^1\. Change, Box/ })).toBeVisible()

    await page.getByRole('button', { name: /^Send feedback/ }).click()
    await expect(page.getByRole('heading', { name: /^Sent to / })).toBeVisible()

    const exitCode = await new Promise((resolve) => child.on('exit', resolve))
    expect(exitCode).toBe(0)
    expect(stdout).toContain('1 annotation (1 Change) on the screenshot.')
    expect(stdout).toContain('Annotated screenshot:')
    expect(stdout).toContain('Move this element up')

    const annotatedPathMatch = stdout.match(/Annotated screenshot: (\S+)/)
    const annotatedContent = await readFile(annotatedPathMatch[1])
    expect(annotatedContent.length).toBeGreaterThan(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (!child.killed && child.exitCode === null) { child.kill() }
  }
})

test('a saved general comment does not reopen for editing when the sidebar is shown again', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-'))
  const { path: imagePath, buffer } = makeFixturePngFile(dir)
  await writeFile(imagePath, buffer)

  const child = spawn('node', [join(process.cwd(), 'index.js'), imagePath], {
    cwd: process.cwd(),
    env: { ...process.env, ANNOTAITR_PORT: '0', ANNOTAITR_NO_OPEN: '1' }
  })

  try {
    const url = await new Promise((resolve, reject) => {
      let stderr = ''
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
        const match = stderr.match(/Server running at (http:\/\/\S+)/)
        if (match) { resolve(match[1]) }
      })
      child.on('exit', (code) => reject(new Error(`CLI exited early with code ${code}: ${stderr}`)))
    })

    await page.goto(url)
    await page.getByRole('button', { name: /General comment/ }).click()
    await page.locator('.panel-global-textarea').fill('Overall fine')
    await page.getByRole('button', { name: 'Save' }).click()

    await page.getByRole('button', { name: 'Hide feedback panel' }).click()
    await page.getByRole('button', { name: 'Show feedback panel' }).click()

    await expect(page.locator('.general-comment-preview', { hasText: 'Overall fine' })).toBeVisible()
    // The edit mode would come from an effect after mounting, so give it time
    // to run before asserting it did not.
    await page.waitForTimeout(300)
    await expect(page.locator('.panel-global-textarea')).toHaveCount(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (!child.killed && child.exitCode === null) { child.kill() }
  }
})

async function openBoxComposer(page) {
  await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Box \(/ }).click()
  const box = await page.locator('.image-canvas-wrapper').boundingBox()
  await page.mouse.move(box.x + 20, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + 60)
  await page.mouse.up()
  return box
}

test('the composer keeps a draft on a click outside and discards it on Escape', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-'))
  const { path: imagePath, buffer } = makeFixturePngFile(dir)
  await writeFile(imagePath, buffer)
  const cli = startCli([imagePath])

  try {
    await page.goto(await cli.url)
    const box = await openBoxComposer(page)
    const composer = page.getByRole('dialog', { name: 'Note 1, box' })
    const field = composer.getByRole('textbox', { name: 'Note 1, box' })
    await expect(field).toBeFocused()

    // Untouched, a click outside closes it.
    await page.mouse.click(box.x + 190, box.y + 5)
    await expect(composer).toHaveCount(0)

    await openBoxComposer(page)
    await field.fill('Keep me')
    await page.mouse.click(box.x + 190, box.y + 5)
    await page.getByRole('heading', { name: 'Feedback' }).click()
    await expect(composer).toBeVisible()
    await expect(field).toHaveValue('Keep me')

    await field.focus()
    await page.keyboard.press('Escape')
    await expect(composer).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^1\. Change, Box/ })).toHaveCount(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (cli.child.exitCode === null) { cli.child.kill() }
  }
})

test('Cmd+Shift+Enter in an open composer opens the decision without saving the note', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-'))
  const { path: imagePath, buffer } = makeFixturePngFile(dir)
  await writeFile(imagePath, buffer)
  const cli = startCli([imagePath])

  try {
    await page.goto(await cli.url)
    await openBoxComposer(page)
    await page.getByPlaceholder('Add a comment…').fill('Not yet')
    await page.keyboard.press('ControlOrMeta+Shift+Enter')

    await expect(page.getByRole('dialog', { name: 'Finish review' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^1\. Change, Box/ })).toHaveCount(0)
    await expect(page.getByPlaceholder('Add a comment…')).toHaveValue('Not yet')
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (cli.child.exitCode === null) { cli.child.kill() }
  }
})

test('the composer sets the intent with 1 to 4 outside the field, and a deleted note leaves its number unused', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-'))
  const { path: imagePath, buffer } = makeFixturePngFile(dir)
  await writeFile(imagePath, buffer)
  const cli = startCli([imagePath])

  const drawAndAdd = async (from, to, text, key = null) => {
    await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Box \(/ }).click()
    const canvas = await page.locator('.image-canvas-wrapper').boundingBox()
    await page.mouse.move(canvas.x + from[0], canvas.y + from[1])
    await page.mouse.down()
    await page.mouse.move(canvas.x + to[0], canvas.y + to[1])
    await page.mouse.up()
    const field = page.getByPlaceholder('Add a comment…')
    // A digit typed in the field is text, not an intent.
    await field.fill(`${text} 4`)
    if (key) {
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'Intent: Change' })).toBeFocused()
      await page.keyboard.press(key)
    }
    await page.getByRole('button', { name: 'Add', exact: true }).click()
  }

  try {
    await page.goto(await cli.url)
    await drawAndAdd([10, 10], [40, 40], 'First')
    await drawAndAdd([60, 10], [90, 40], 'Second', '4')
    await drawAndAdd([110, 10], [140, 40], 'Third', '3')
    await expect(page.getByRole('button', { name: /^2\. Question, Box/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^3\. Remove, Box/ })).toBeVisible()

    await page.locator('[data-annotation-id]').filter({ hasText: 'Second' }).getByRole('button', { name: 'Delete annotation' }).click()
    await expect(page.getByRole('button', { name: /^3\. Remove, Box/ })).toBeVisible()

    await page.getByRole('button', { name: /^Send feedback/ }).click()
    expect(await cli.exited).toBe(0)
    const stdout = cli.stdout()
    expect(stdout).toContain('2 annotations (1 Change, 1 Remove) on the screenshot.')
    expect(stdout).toMatch(/### 1\. \[#\w+\] Change · Boxed area: [^\n]*\n> First 4/)
    expect(stdout).toMatch(/### 3\. \[#\w+\] Remove · Boxed area: [^\n]*\n> Third 4/)
    expect(stdout).not.toContain('### 2.')
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (cli.child.exitCode === null) { cli.child.kill() }
  }
})

test('keys 1 to 4 set the intent of the mark selected on the canvas, and undo restores it', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-'))
  const { path: imagePath, buffer } = makeFixturePngFile(dir)
  await writeFile(imagePath, buffer)
  const cli = startCli([imagePath])
  try {
    await page.goto(await cli.url)
    await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Box \(/ }).click()
    const canvas = await page.locator('.image-canvas-wrapper').boundingBox()
    await page.mouse.move(canvas.x + 20, canvas.y + 20)
    await page.mouse.down()
    await page.mouse.move(canvas.x + 90, canvas.y + 70)
    await page.mouse.up()
    await page.getByPlaceholder('Add a comment…').fill('Box note')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('button', { name: /^1\. Change, Box/ })).toBeVisible()

    await page.keyboard.press('v')
    await page.mouse.click(canvas.x + 20, canvas.y + 45)
    await page.keyboard.press('3')
    await expect(page.getByRole('button', { name: /^1\. Remove, Box/ })).toBeVisible()
    await page.keyboard.press('4')
    await expect(page.getByRole('button', { name: /^1\. Question, Box/ })).toBeVisible()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByRole('button', { name: /^1\. Remove, Box/ })).toBeVisible()
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (cli.child.exitCode === null) { cli.child.kill() }
  }
})
