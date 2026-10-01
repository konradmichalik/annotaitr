// test/e2e/image.spec.js
import { spawn } from 'node:child_process'
import { writeFile, rm, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { createCanvas } from '@napi-rs/canvas'

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
    await page.getByRole('toolbar', { name: 'Annotation tools' }).getByText('Box').click()

    const image = page.locator('.image-canvas-wrapper')
    const box = await image.boundingBox()
    await page.mouse.move(box.x + 20, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + 80, box.y + 60)
    await page.mouse.up()

    await page.getByPlaceholder('Add a comment (optional)...').fill('Move this element up')
    // Exact match: the sidebar's "Add general comment" button also matches a
    // loose substring search for "Add".
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByText('1. Box')).toBeVisible()

    await page.getByRole('button', { name: 'Feedback' }).click()
    await expect(page.getByRole('heading', { name: 'Feedback Submitted' })).toBeVisible()

    const exitCode = await new Promise((resolve) => child.on('exit', resolve))
    expect(exitCode).toBe(0)
    expect(stdout).toContain('1 annotation on the screenshot.')
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
    await page.getByRole('button', { name: 'Add general comment' }).click()
    await page.locator('.panel-global-textarea').fill('Overall fine')
    await page.getByRole('button', { name: 'Save' }).click()

    await page.getByRole('button', { name: 'Hide annotations' }).click()
    await page.getByRole('button', { name: 'Show annotations' }).click()

    await expect(page.locator('.panel-comment-text', { hasText: 'Overall fine' })).toBeVisible()
    // The edit mode would come from an effect after mounting, so give it time
    // to run before asserting it did not.
    await page.waitForTimeout(300)
    await expect(page.locator('.panel-global-textarea')).toHaveCount(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (!child.killed && child.exitCode === null) { child.kill() }
  }
})
