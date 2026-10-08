// test/e2e/domMap.spec.js
import { createServer } from 'node:http'
import { test, expect } from '@playwright/test'
import { startCli } from '../helpers/cli.js'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { captureUrl } from '../../server/image/still/loader.js'
import { matchAnnotation } from '../../server/image/common/elementMatch.js'

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
    <button type="button" id="contact" style="margin-top:20px">Contact us</button>
    <div class="spacer"></div>
    <section id="pricing"><a class="cta" href="#" role="button" style="display:inline-block;width:120px;height:40px;background:#f00;color:#f00">Start trial</a></section>
    <img src="${PIXEL}" width="50" height="50">
    <div class="card" style="width:400px;height:200px"><h3>Plans</h3><button type="button">Buy</button></div>
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
  expect(card).toMatchObject({ tag: 'div', name: '', heading: 'Plans', box: { width: 400, height: 200 } })
  const emptySpot = { type: 'pin', geometry: { x: card.box.x + 300, y: card.box.y + 150 } }
  expect(matchAnnotation(capture.domMap, emptySpot)).toEqual([card])

  const pin = { type: 'pin', geometry: { x: cta.box.x + 10, y: cta.box.y + 10 } }
  expect(matchAnnotation(capture.domMap, pin)).toEqual([cta])
})

test('a section capture shows only the viewport at the anchor, and the map uses that frame', async () => {
  const capture = await captureUrl(baseUrl, { width: 800, height: 600 }, { section: { anchor: '#pricing' } })
  expect([capture.width, capture.height]).toEqual([800, 600])
  const cta = capture.domMap.find((el) => el.name === 'Start trial')
  expect(cta.box.y).toBeLessThan(600)
  expect(await pixelAt(capture.buffer, cta.box.x + 2, cta.box.y + 2)).toEqual([255, 0, 0, 255])
  // In a section the fixed bars are on screen where they measure, so they belong in the map.
  expect(capture.domMap.find((el) => el.name === 'Home').box.y).toBe(0)
  expect(capture.domMap.find((el) => el.name === 'Team photo')).toBeUndefined()
})

async function canvasPoint(page, box) {
  const canvas = await page.locator('.image-canvas-wrapper').boundingBox()
  const zoom = canvas.width / 800
  return { x: canvas.x + (box.x + box.width / 2) * zoom, y: canvas.y + (box.y + box.height / 2) * zoom, zoom }
}

test('the Element tool outlines and picks a page element, other tools only name what they hit', async ({ page }) => {
  const { child, stdout, url } = startCli([baseUrl, '--viewport', '800x600'])
  try {
    const appUrl = await url
    await page.goto(appUrl)
    const { elements } = (await (await page.request.get(`${appUrl}/api/elements`)).json()).data
    const hero = elements.find((el) => el.name === 'Team photo')
    const contact = elements.find((el) => el.name === 'Contact us')
    const tools = page.getByRole('toolbar', { name: 'Annotation tools' })

    await tools.getByRole('button', { name: /^Element \(/ }).click()
    const heroSpot = await canvasPoint(page, hero.box)
    await page.mouse.move(heroSpot.x, heroSpot.y)
    await expect(page.locator('.element-highlight')).toHaveCount(1)
    await expect(page.locator('.element-highlight-label')).toHaveText(`${hero.selector} ${Math.round(hero.box.width)}×${Math.round(hero.box.height)}`)
    await page.mouse.click(heroSpot.x, heroSpot.y)
    await expect(page.locator('.comment-popover-element')).toHaveText('Element: img#hero "Team photo" (team.png)')
    await page.getByPlaceholder('Add a comment…').fill('Swap the photo')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('button', { name: /^1\. Change, Element/ })).toBeVisible()
    await expect(page.locator('.element-highlight')).toHaveCount(0)

    // A selected element stays on its element when dragged.
    await page.mouse.down()
    await page.mouse.move(heroSpot.x + 150 * heroSpot.zoom, heroSpot.y + 250 * heroSpot.zoom, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator('.note-quote')).toHaveText('img#hero "Team photo" (team.png)')

    await tools.getByRole('button', { name: /^Pin \(/ }).click()
    const contactSpot = await canvasPoint(page, contact.box)
    await page.mouse.move(contactSpot.x, contactSpot.y)
    await expect(page.locator('.element-highlight')).toHaveCount(0)
    await page.mouse.click(contactSpot.x, contactSpot.y)
    await expect(page.locator('.comment-popover-element')).toHaveText('Element: button#contact "Contact us"')
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await page.getByRole('button', { name: /^Send feedback/ }).click()
    await expect(page.getByRole('heading', { name: /^Sent to / })).toBeVisible()
    expect(await new Promise((resolve) => child.on('exit', resolve))).toBe(0)
    expect(stdout()).toMatch(/### 1\. \[#\w+\] Change · Selected element: .*\nElement: img "Team photo" \("team.png"\) · #hero\n> Swap the photo/)
    expect(stdout()).toMatch(/### 2\. \[#\w+\] Question · Comment pin: .*\nElement: button "Contact us" · #contact/)
  } finally {
    if (child.exitCode === null) { child.kill() }
  }
})

test('the Element tool walks the page elements from the keyboard and annotates one with Enter', async ({ page }) => {
  const { child, url } = startCli([baseUrl, '--viewport', '800x600'])
  try {
    const appUrl = await url
    await page.goto(appUrl)
    const { elements } = (await (await page.request.get(`${appUrl}/api/elements`)).json()).data
    const caption = (el) => `${el.selector} ${Math.round(el.box.width)}×${Math.round(el.box.height)}`
    const label = page.locator('.element-highlight-label')

    // The tool is offered once the app has the element map, which arrives after the image.
    await expect(async () => {
      await page.keyboard.press('e')
      await expect(page.getByRole('button', { name: /^Element \(/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 500 })
    }).toPass()
    // Reached with Tab, as a keyboard user does: a click on the canvas starts no walk.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      if (await page.evaluate(() => document.activeElement?.classList.contains('image-canvas-wrapper'))) { break }
    }
    await expect(label).toHaveText(caption(elements[0]))
    await page.keyboard.press('Tab')
    await expect(label).toHaveText(caption(elements[1]))
    await page.keyboard.press('Shift+Tab')
    await expect(label).toHaveText(caption(elements[0]))

    const contact = elements.find((el) => el.name === 'Contact us')
    for (let i = 0; i < elements.indexOf(contact); i++) { await page.keyboard.press('Tab') }
    await expect(label).toHaveText(caption(contact))
    await page.keyboard.press('ArrowUp')
    await expect(label).not.toHaveText(caption(contact))

    await page.keyboard.press('Enter')
    await expect(page.getByPlaceholder('Add a comment…')).toBeFocused()
    await expect(page.locator('.comment-popover-element')).toContainText('Element: ')
  } finally {
    if (child.exitCode === null) { child.kill() }
  }
})

test('Capture again captures the page anew with the settings it has', async ({ page }) => {
  const { child, url } = startCli([baseUrl, '--viewport', '800x600'])
  try {
    await page.goto(await url)
    await expect(page.locator('.viewport-trigger')).toHaveText('Custom · 800')
    await Promise.all([
      page.waitForResponse('**/api/recapture'),
      page.getByRole('button', { name: 'Capture again', exact: true }).click()
    ])
    await expect(page.locator('.viewport-trigger')).toHaveText('Custom · 800')
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    if (child.exitCode === null) { child.kill() }
  }
})

test('the viewport picker captures the page again in place, after confirming that annotations go', async ({ page }) => {
  const { child, stdout, url } = startCli([baseUrl, '--viewport', '800x600', '--delay', '200'])
  try {
    const appUrl = await url
    await page.goto(appUrl)
    const meta = async () => (await (await page.request.get(`${appUrl}/api/meta`)).json()).data
    const trigger = page.locator('.viewport-trigger')
    // The radios are visually hidden inside their tiles, so pick a tile the way a user does.
    const choose = (name) => page.locator('label', { has: page.getByRole('radio', { name, exact: true }) }).click()
    const captureAgain = () => Promise.all([
      page.waitForResponse('**/api/recapture'),
      page.getByRole('button', { name: 'Capture', exact: true }).click()
    ])
    await expect(trigger).toHaveText('Custom · 800')

    // Measured on every call: a narrower capture is centered somewhere else.
    const pinAt = async (x, y) => {
      const canvas = await page.locator('.image-canvas-wrapper').boundingBox()
      await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Pin \(/ }).click()
      await page.mouse.click(canvas.x + x, canvas.y + y)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
    }
    await pinAt(60, 300)
    await expect(page.getByRole('button', { name: /^1\. Question, Pin/ })).toBeVisible()

    // Declining keeps the annotation and the capture.
    await trigger.click()
    await choose('Tablet')
    await expect(page.getByText('Discards your annotation')).toBeVisible()
    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByRole('button', { name: 'Capture', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Not captured again, your annotation is kept.')
    await expect(page.getByRole('button', { name: /^1\. Question, Pin/ })).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await choose('Phone')
    await captureAgain()
    await expect(trigger).toHaveText('Phone · 375')
    await expect(page.getByRole('button', { name: /^1\. Question, Pin/ })).toHaveCount(0)
    // The fixture's 400px card makes the page wider than the phone, and a full-page capture shows all of it.
    expect((await meta()).capture.viewport).toEqual({ width: 375, height: 812 })

    await trigger.click()
    await page.getByRole('button', { name: 'Landscape' }).click()
    await captureAgain()
    await expect(trigger).toHaveText('Phone landscape · 812')
    expect((await meta()).capture.viewport).toEqual({ width: 812, height: 375 })

    await trigger.click()
    await choose('First screen')
    await captureAgain()
    expect(await meta()).toMatchObject({ width: 812, height: 375, capture: { section: { scrollY: 0 } } })

    await trigger.click()
    await choose('Anchor')
    await page.getByLabel('Anchor id').fill('pricing')
    await captureAgain()
    await expect(trigger).toHaveText('Phone landscape · 812')
    expect(await meta()).toMatchObject({ width: 812, height: 375, capture: { section: { anchor: '#pricing' }, delayMs: 200 } })

    await pinAt(30, 30)
    await page.getByRole('button', { name: /^Send feedback/ }).click()
    await expect(page.getByRole('heading', { name: /^Sent to / })).toBeVisible()
    expect(await new Promise((resolve) => child.on('exit', resolve))).toBe(0)
    expect(stdout()).toContain('Captured at mobile landscape (812×375), section #pricing, after 200 ms\n')
  } finally {
    if (child.exitCode === null) { child.kill() }
  }
})

test('a recapture answered with an error page shows the status instead of a parse error', async ({ page }) => {
  const { child, url } = startCli([baseUrl, '--viewport', '800x600'])
  try {
    await page.goto(await url)
    await page.route('**/api/recapture', (route) => route.fulfill({ status: 500, contentType: 'text/html', body: '<html>Internal Server Error</html>' }))
    await page.locator('.viewport-trigger').click()
    await page.getByRole('button', { name: 'Capture', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Server responded with 500')
  } finally {
    if (child.exitCode === null) { child.kill() }
  }
})

test('the export menu copies the annotated image and the feedback, and saves the image', async ({ page, context }) => {
  const { child, url } = startCli([baseUrl, '--viewport', '800x600'])
  try {
    const appUrl = await url
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(appUrl).origin })
    await page.goto(appUrl)
    await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Pin \(/ }).click()
    const canvas = await page.locator('.image-canvas-wrapper').boundingBox()
    const zoom = canvas.width / 800
    await page.mouse.click(canvas.x + 170 * zoom, canvas.y + 160 * zoom)
    await page.getByPlaceholder('Add a comment…').fill('Swap the photo')
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    const menu = page.getByRole('button', { name: 'More actions', exact: true })
    await menu.click()
    await expect(page.getByRole('menuitem', { name: 'Copy annotated image' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Save annotated image' })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('menuitem', { name: /Export \/ import/ })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeFocused()

    await menu.click()
    await page.getByRole('menuitem', { name: 'Copy feedback as Markdown' }).click()
    await expect(page.locator('.toast')).toHaveText('Feedback copied as Markdown')
    const text = await page.evaluate(() => navigator.clipboard.readText())
    expect(text).toContain('> Swap the photo')
    expect(text).toContain('Element: img "Team photo" ("team.png") · #hero')
    expect(text).not.toContain('Annotated screenshot:')

    await menu.click()
    await page.getByRole('menuitem', { name: 'Copy annotated image' }).click()
    await expect(page.locator('.toast')).toHaveText('Annotated image copied')
    const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types))
    expect(types).toContain('image/png')

    await menu.click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Save annotated image' }).click()
    ])
    expect(download.suggestedFilename()).toMatch(/^annotated-127-0-0-1-\d+\.png$/)

    // Exporting decides nothing: the CLI is still waiting.
    expect(child.exitCode).toBeNull()
  } finally {
    if (child.exitCode === null) { child.kill() }
  }
})
