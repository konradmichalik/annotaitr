// test/e2e/document.spec.js
import { writeFile, rm, mkdtemp, readdir, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { test, expect } from '@playwright/test'
import { startCli } from '../helpers/cli.js'
import { makePdf } from '../helpers/pdfFixtures.js'

async function drawBox(page, from, to) {
  await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Box \(/ }).click()
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

    const nav = page.getByRole('group', { name: 'Page navigation' })
    await expect(nav.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await nav.getByRole('button', { name: 'Next page' }).click()
    await expect(nav).toContainText('Page 2 / 3')
    await nav.getByRole('button', { name: 'Previous page' }).click()
    await expect(nav).toContainText('Page 1 / 3')

    await page.keyboard.press('End')
    await expect(strip.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.app-status')).toContainText('Page 3 of 3')
    await expect(nav.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await drawBox(page, [40, 40], [140, 100])

    await strip.getByRole('button', { name: 'Page 2' }).click()
    await expect(page.locator('.app-status')).toContainText('1413 × 2000px')
    await page.getByRole('button', { name: 'Add comment for page 2' }).click()
    await page.locator('.panel-global-textarea').fill('Too dense')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.locator('.app-sidebar')).toContainText('Page 2')
    await page.getByRole('button', { name: /^Send feedback/ }).click()
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

test('text on a PDF page is selected word by word and quoted in the feedback', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-pdf-text-'))
  const pdfPath = join(dir, 'deck.pdf')
  await writeFile(pdfPath, await makePdf([{ size: 'slide', title: 'Revenue by region', body: ['North grew 12%', 'South stayed flat'] }]))
  const cli = startCli([pdfPath])
  try {
    // The Text tool is offered while the page's words are still on their
    // way, but a drag only selects once they have arrived.
    const textLoaded = page.waitForResponse((res) => res.url().includes('/api/pages/1/elements'))
    await page.goto(await cli.url)
    await textLoaded
    await expect(page.locator('.page-skeleton')).toHaveCount(0)
    const toolbar = page.getByRole('toolbar', { name: 'Annotation tools' })
    await toolbar.getByRole('button', { name: /^Text \(/ }).click()
    // Body lines sit 160pt and 188pt below the top of a 960pt wide slide, in
    // 22pt type from x 60pt. Both points aim at the middle of a word ("North"
    // and "stayed"), since word edges shift with the fonts a system has.
    const canvas = await page.locator('.image-canvas-wrapper').boundingBox()
    const scale = canvas.width / 960
    await page.mouse.move(canvas.x + 85 * scale, canvas.y + 152 * scale)
    await page.mouse.down()
    await page.mouse.move(canvas.x + 155 * scale, canvas.y + 180 * scale, { steps: 4 })
    await page.mouse.up()
    await expect(page.locator('.comment-popover-element')).toContainText('"North grew 12% South stayed"')
    await page.getByPlaceholder('Add a comment (optional)...').fill('Say rose')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('.app-sidebar')).toContainText('“North grew 12% South stayed”')

    await page.getByRole('button', { name: /^Send feedback/ }).click()
    expect(await cli.exited).toBe(0)
    expect(cli.stdout()).toMatch(/### 1\. \[#[0-9a-f]{8}\] Selected text: [^\n]*\nQuote: "North grew 12% South stayed"\n> Say rose/)
    await rm(cli.stdout().match(/Overview: (.*)\/overview\.png/)[1], { recursive: true, force: true })
  } finally {
    cli.child.kill()
    await rm(dir, { recursive: true, force: true })
  }
})

test('a reload keeps the page shown, a regenerated PDF opens on its first page', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-e2e-pdf-reload-'))
  const pdfPath = join(dir, 'deck.pdf')
  await writeFile(pdfPath, await makePdf([{ size: 'slide', title: 'One' }, { size: 'slide', title: 'Two' }, { size: 'slide', title: 'Three' }]))
  const strip = page.getByRole('navigation', { name: 'Pages' })
  let cli = startCli([pdfPath])
  try {
    await page.goto(await cli.url)
    await strip.getByRole('button', { name: 'Page 3' }).click()
    await page.reload()
    await expect(strip.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page')
    cli.child.kill()

    await writeFile(pdfPath, await makePdf([{ size: 'slide', title: 'One' }, { size: 'slide', title: 'Two, fixed' }, { size: 'slide', title: 'Three' }]))
    cli = startCli([pdfPath])
    await page.goto(await cli.url)
    await expect(strip.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
  } finally {
    cli.child.kill()
    await rm(dir, { recursive: true, force: true })
  }
})
