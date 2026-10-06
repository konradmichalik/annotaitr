// test/e2e/document.spec.js
import { spawn } from 'node:child_process'
import { writeFile, rm, mkdtemp, readdir, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { test, expect } from '@playwright/test'
import { makePdf } from '../helpers/pdfFixtures.js'

function startCli(args) {
  const child = spawn('node', [join(process.cwd(), 'index.js'), ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ANNOTAITR_PORT: '0', ANNOTAITR_NO_OPEN: '1' }
  })
  let stdout = ''
  child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
  const url = new Promise((resolve, reject) => {
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      const match = stderr.match(/Server running at (http:\/\/\S+)/)
      if (match) { resolve(match[1]) }
    })
    child.on('exit', (code) => reject(new Error(`CLI exited early with code ${code}: ${stderr}`)))
  })
  const exited = new Promise((resolve) => child.on('exit', resolve))
  return { child, url, exited, stdout: () => stdout }
}

async function drawBox(page, from, to) {
  await page.getByRole('toolbar', { name: 'Annotation tools' }).getByText('Box').click()
  const canvas = await page.locator('.image-canvas-wrapper').boundingBox()
  await page.mouse.move(canvas.x + from[0], canvas.y + from[1])
  await page.mouse.down()
  await page.mouse.move(canvas.x + to[0], canvas.y + to[1])
  await page.mouse.up()
  await page.getByPlaceholder('Add a comment (optional)...').fill(`box ${from[0]}`)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
}

test('a PDF is annotated page by page and the CLI prints per-page feedback with images', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-pdf-'))
  const pdfPath = join(dir, 'deck.pdf')
  const sourcePath = join(dir, 'deck.pptx')
  await writeFile(sourcePath, 'x')
  await utimes(sourcePath, new Date(1000), new Date(1000))
  await writeFile(pdfPath, await makePdf([
    { size: 'slide', title: 'One' }, { size: 'portrait', title: 'Two' }, { size: 'slide', title: 'Three' }
  ]))
  const cli = startCli([pdfPath, '--source', sourcePath])
  try {
    await page.goto(await cli.url)
    const strip = page.getByRole('navigation', { name: 'Pages' })
    await expect(strip.getByRole('button')).toHaveCount(3)
    await expect(strip.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.document-banner')).toHaveCount(0)

    await drawBox(page, [20, 20], [120, 80])
    await expect(strip.getByRole('button', { name: 'Page 1, 1 annotation' })).toBeVisible()

    await page.keyboard.press('End')
    await expect(strip.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.app-status')).toContainText('Page 3 of 3')
    await drawBox(page, [40, 40], [140, 100])

    await strip.getByRole('button', { name: 'Page 2' }).click()
    await expect(page.locator('.app-status')).toContainText('1413 × 2000px')
    await page.getByRole('button', { name: 'Add comment for page 2' }).click()
    await page.locator('.panel-global-textarea').fill('Too dense')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.locator('.app-sidebar')).toContainText('Page 2')
    await page.getByRole('button', { name: /^Feedback/ }).click()
    await expect(page.getByText('Feedback Submitted')).toBeVisible()

    expect(await cli.exited).toBe(0)
    const output = cli.stdout()
    expect(output).toMatch(/^3 annotations on 3 of 3 pages\.\n\nSource: deck\.pptx \(rendered as deck\.pdf\)\n/)
    expect(output).toMatch(/## Page 1\n[\s\S]*### 1\. \[#[0-9a-f]{8}\] Boxed area/)
    expect(output).toMatch(/## Page 2\n[\s\S]*### 2\. \[#[0-9a-f]{8}\] Page comment\n> Too dense/)
    expect(output).toMatch(/## Page 3\n[\s\S]*### 3\. \[#[0-9a-f]{8}\] Boxed area/)
    const overview = output.match(/Overview: (.*)\n/)[1]
    expect((await readdir(dirname(overview))).sort()).toEqual(['overview.png', 'page-01.png', 'page-02.png', 'page-03.png'])
    await rm(dirname(overview), { recursive: true, force: true })
  } finally {
    cli.child.kill()
    await rm(dir, { recursive: true, force: true })
  }
})

test('a PDF whose source changed after the export shows the stale banner', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-pdf-stale-'))
  const pdfPath = join(dir, 'deck.pdf')
  await writeFile(pdfPath, await makePdf())
  await utimes(pdfPath, new Date(1000), new Date(1000))
  await writeFile(join(dir, 'deck.pptx'), 'x')
  const cli = startCli([pdfPath, '--source', join(dir, 'deck.pptx')])
  try {
    await page.goto(await cli.url)
    await expect(page.locator('.document-banner')).toHaveText(/deck\.pptx is newer than deck\.pdf/)
  } finally {
    cli.child.kill()
    await rm(dir, { recursive: true, force: true })
  }
})
