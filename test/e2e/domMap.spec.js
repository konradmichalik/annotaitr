// test/e2e/domMap.spec.js
import { createServer } from 'node:http'
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
