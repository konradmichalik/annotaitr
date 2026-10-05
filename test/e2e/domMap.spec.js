// test/e2e/domMap.spec.js
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { captureUrl } from '../../server/image/loader.js'
import { matchAnnotation } from '../../server/image/elementMatch.js'

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// Fixed bars are the case where a measured box and a full-page screenshot
// disagree, so the map must leave them out. The spacer pushes content below the fold.
const PAGE = `<!doctype html>
<html><head><style>
  body { margin: 0; font: 16px sans-serif; }
  .bar { position: fixed; left: 0; right: 0; height: 40px; background: #333; color: #fff; }
  .top { top: 0; } .bottom { bottom: 0; }
  main { padding: 60px 20px; }
  .spacer { height: 1400px; }
  img { display: block; }
</style></head>
<body>
  <header class="bar top"><a href="#">Home</a></header>
  <main id="content">
    <img id="hero" src="/team.png?v=3" alt="Team photo" width="300" height="200">
    <div class="spacer"></div>
    <section id="pricing"><a class="cta" href="#" role="button" style="display:inline-block;width:120px;height:40px;background:#f00;color:#f00">Start trial</a></section>
    <img src="${PIXEL}" width="50" height="50">
    <div class="card" style="width:400px;height:200px"><button type="button">Buy</button></div>
  </main>
  <footer class="bar bottom"><button type="button">Help</button></footer>
</body></html>`

let server
let baseUrl

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url.startsWith('/team.png')) {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(Buffer.from(PIXEL.split(',')[1], 'base64'))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(PAGE)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}/`
})

test.afterAll(() => new Promise((resolve) => server.close(resolve)))

async function pixelAt(buffer, x, y) {
  const image = await loadImage(buffer)
  const ctx = createCanvas(image.width, image.height).getContext('2d')
  ctx.drawImage(image, 0, 0)
  return [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data]
}

test('a captured page carries a DOM map whose boxes line up with the screenshot', async () => {
  const capture = await captureUrl(baseUrl, { width: 800, height: 600 })
  const byName = (name) => capture.domMap.find((el) => el.name === name)

  expect(byName('Team photo')).toMatchObject({
    tag: 'img', media: 'team.png', selector: '#hero', box: { x: 20, y: 60, width: 300, height: 200 }
  })

  const cta = byName('Start trial')
  expect(cta).toMatchObject({ tag: 'a', role: 'button', selector: '#pricing a.cta' })
  expect(cta.box.y).toBeGreaterThan(1400)
  expect(await pixelAt(capture.buffer, cta.box.x + 2, cta.box.y + 2)).toEqual([255, 0, 0, 255])
  expect(await pixelAt(capture.buffer, cta.box.x + cta.box.width - 2, cta.box.y + cta.box.height - 2)).toEqual([255, 0, 0, 255])

  expect(capture.domMap.find((el) => el.media === 'data:image/png')).toBeTruthy()

  expect(byName('Home')).toBeUndefined()
  expect(byName('Help')).toBeUndefined()

  const card = capture.domMap.find((el) => el.selector.endsWith('div.card'))
  expect(card).toMatchObject({ tag: 'div', name: '', box: { width: 400, height: 200 } })
  const emptySpot = { type: 'pin', geometry: { x: card.box.x + 300, y: card.box.y + 150 } }
  expect(matchAnnotation(capture.domMap, emptySpot)).toEqual([card])

  const pin = { type: 'pin', geometry: { x: cta.box.x + 10, y: cta.box.y + 10 } }
  expect(matchAnnotation(capture.domMap, pin)).toEqual([cta])
})

function startCli(args) {
  const child = spawn('node', [join(process.cwd(), 'index.js'), ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ANNOTAITR_PORT: '0', ANNOTAITR_NO_OPEN: '1' }
  })
  const output = { stdout: '' }
  child.stdout.on('data', (chunk) => { output.stdout += chunk.toString() })
  const url = new Promise((resolve, reject) => {
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      const match = stderr.match(/Server running at (http:\/\/\S+)/)
      if (match) { resolve(match[1]) }
    })
    child.on('exit', (code) => reject(new Error(`CLI exited early with code ${code}: ${stderr}`)))
  })
  return { child, output, url }
}

test('the annotator outlines and names the element under the pointer, and the feedback names the same one', async ({ page }) => {
  const { child, output, url } = startCli([baseUrl, '--viewport', '800x600'])
  try {
    await page.goto(await url)
    await page.getByRole('toolbar', { name: 'Annotation tools' }).getByText('Pin').click()

    const canvas = page.locator('.image-canvas-wrapper')
    const box = await canvas.boundingBox()
    const zoom = box.width / 800
    // The hero image sits at 20,60 with a size of 300x200 in page pixels.
    const spot = { x: box.x + 170 * zoom, y: box.y + 160 * zoom }
    await page.mouse.move(spot.x, spot.y)
    await expect(page.locator('.element-highlight')).toHaveCount(1)
    await expect(page.locator('.element-highlight-label')).toHaveText('img#hero "Team photo" (team.png)')

    await page.mouse.click(spot.x, spot.y)
    await expect(page.locator('.comment-popover-element')).toHaveText('Element: img#hero "Team photo" (team.png)')
    await page.getByPlaceholder('Add a comment (optional)...').fill('Swap the photo')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('.panel-element')).toHaveText('img#hero "Team photo" (team.png)')
    await expect(page.locator('.element-highlight')).toHaveCount(0)

    // Moving the mark away leaves no outline behind at the spot it came from.
    await page.mouse.move(spot.x, spot.y)
    await page.mouse.down()
    await page.mouse.move(spot.x + 200 * zoom, spot.y + 300 * zoom, { steps: 5 })
    await expect(page.locator('.element-highlight')).toHaveCount(0)
    await page.mouse.up()
    await page.mouse.down()
    await page.mouse.move(spot.x, spot.y, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator('.panel-element')).toHaveText('img#hero "Team photo" (team.png)')

    await page.getByRole('button', { name: 'Feedback' }).click()
    await expect(page.getByRole('heading', { name: 'Feedback Submitted' })).toBeVisible()
    expect(await new Promise((resolve) => child.on('exit', resolve))).toBe(0)
    expect(output.stdout).toContain('Element: img "Team photo" ("team.png") · #hero')
  } finally {
    if (child.exitCode === null) { child.kill() }
  }
})
