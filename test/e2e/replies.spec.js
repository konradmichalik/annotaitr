// test/e2e/replies.spec.js
// Last round's marks and the agent's replies on them, as the reviewer sees them in round 2.
import { writeFile, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { test, expect } from '@playwright/test'
import { startCli } from '../helpers/cli.js'
import { makeFixturePng } from '../helpers/fixtureImage.js'
import { makePdf } from '../helpers/pdfFixtures.js'

const WEBM_FIXTURE = join(process.cwd(), 'test', 'fixtures', 'clip.webm')

const UUID = 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d'

async function firstRoundWithReply(target, env, annotation, status = 'applied', text = 'Moved the button') {
  const cli = startCli([target], env)
  const url = await cli.url
  const post = (path, body) => fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  await post('/api/annotations', { annotations: [annotation] })
  await post('/api/feedback', {})
  const sessionId = (await cli.exited, cli.stdout()).match(/Session: ([0-9a-f]{12})/)[1]
  spawnSync('node', ['index.js', 'reply', '--session', sessionId, '--to', annotation.id.slice(0, 8), '--status', status, '--text', text], {
    env: { ...process.env, ...env }, encoding: 'utf-8'
  })
}

// Round 1 of the video fixture: a box at 1 s with an applied reply. Round 2 is then a fresh CLI on the same session dir.
async function firstVideoRoundWithReply(page, env) {
    const first = startCli([WEBM_FIXTURE], env)
    await page.goto(await first.url)
    await expect(page.locator('.timeline-time')).toContainText('/ 00:02.000')
    await page.keyboard.press('Shift+ArrowRight')
    await expect(page.locator('.timeline-time')).toContainText('00:01.000 /')
    await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Box \(/ }).click()
    const canvas = await page.locator('.image-canvas-wrapper').boundingBox()
    await page.mouse.move(canvas.x + 20, canvas.y + 20)
    await page.mouse.down()
    await page.mouse.move(canvas.x + 80, canvas.y + 60)
    await page.mouse.up()
    await page.getByPlaceholder('Add a comment…').fill('Box on the first second')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const saved = async () => (await (await fetch(`${await first.url}/api/annotations`)).json()).data.annotations
    await expect.poll(async () => (await saved()).length).toBe(1)
    const id = (await saved())[0].id
    await page.getByRole('button', { name: /^Send feedback/ }).click()
    await expect(page.getByRole('heading', { name: 'Feedback Submitted' })).toBeVisible({ timeout: 20_000 })
    const sessionId = (await first.exited, first.stdout()).match(/Session: ([0-9a-f]{12})/)[1]
    spawnSync('node', ['index.js', 'reply', '--session', sessionId, '--to', id.slice(0, 8), '--status', 'applied', '--text', 'Moved the button'], {
      env: { ...process.env, ...env }, encoding: 'utf-8'
    })
}

test.describe('replies from the last round', () => {
  let dir, image, env
  test.beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-replies-'))
    image = join(dir, 'shot.png')
    await writeFile(image, makeFixturePng(400, 300))
    env = { ANNOTAITR_SESSION_DIR: join(dir, 'sessions') }
  })
  test.afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  test('submits a round that only carries a reply', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Button colour', color: '#bf616a' }, 'question', 'Green or blue?')
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      const section = page.getByRole('region', { name: /Round 1 replies/ })
      await section.getByRole('button', { name: /1\..*question/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Round 1, mark 1' })
      await dialog.getByLabel('Reply to the agent').fill('Green')
      await dialog.getByRole('button', { name: 'Send' }).click()
      await page.keyboard.press('Escape')
      await expect(section.getByText('You: Green')).toBeVisible()
      await expect(section.getByText('1 to send')).toBeVisible()
      await expect(page.locator('.previous-round-badge[aria-label*="reply pending"]')).toHaveCount(1)
      const feedback = page.getByRole('button', { name: /^Send feedback/ })
      await expect(feedback).toBeEnabled()
      await expect(feedback).toHaveAttribute('title', 'Submit 1 reply')
      await feedback.click()
      await expect(page.getByRole('heading', { name: 'Feedback Submitted' })).toBeVisible()
      await expect(page.getByText(/^1 reply (sent to|submitted)/)).toBeVisible()
      await cli.exited
      const out = cli.stdout()
      expect(out).toMatch(/^Feedback: 1 reply to round 1, no new marks\./)
      expect(out).toContain('Reviewer: Green')

      const sessionId = out.match(/Session: ([0-9a-f]{12})/)[1]
      spawnSync('node', ['index.js', 'reply', '--session', sessionId, '--to', UUID.slice(0, 8), '--status', 'applied', '--text', 'Green it is'], {
        env: { ...process.env, ...env }, encoding: 'utf-8'
      })
      const third = startCli([image], env)
      try {
        await page.goto(await third.url)
        await page.getByRole('region', { name: /replies/ }).getByRole('button', { name: /1\./ }).click()
        await expect(page.getByRole('dialog', { name: 'Round 1, mark 1' })).toBeVisible()
      } finally {
        third.child.kill()
      }
    } finally {
      cli.child.kill()
    }
  })

  test('answers the agent in the popover, removes and resends the reply', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Button colour', color: '#bf616a' }, 'question', 'Green or blue?')
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      await page.getByRole('region', { name: /Round 1 replies/ }).getByRole('button', { name: /1\..*question/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Round 1, mark 1' })
      const field = dialog.getByLabel('Reply to the agent')
      await field.fill('x'.repeat(4001))
      await dialog.getByRole('button', { name: 'Send' }).click()
      await expect(dialog.getByRole('alert')).toContainText('longer than 4000')
      await expect(field).toHaveValue('x'.repeat(4001))
      await field.fill('Green, the dark one')
      await field.press('Control+Enter')
      await expect(dialog.getByText('pending, sent with your decision')).toBeVisible()
      await expect(field).toHaveValue('')
      await dialog.getByRole('button', { name: 'Remove your reply' }).click()
      await expect(dialog.getByText('pending, sent with your decision')).toHaveCount(0)
      await field.fill('Green')
      await dialog.getByRole('button', { name: 'Send' }).click()
      await expect(dialog.getByText('Green', { exact: true })).toBeVisible()
    } finally {
      cli.child.kill()
    }
  })

  test('keeps a popover opened from the panel in sync when replying to a mark outside the image', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'pin', geometry: { x: 380, y: 280 }, text: 'Corner', color: '#bf616a' }, 'question', 'Which corner?')
    await writeFile(image, makeFixturePng(200, 150))
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      await page.getByRole('region', { name: /Round 1 replies/ }).getByRole('button', { name: /1\./ }).click()
      const dialog = page.getByRole('dialog', { name: 'Round 1, mark 1' })
      const field = dialog.getByLabel('Reply to the agent')
      await field.fill('The top one')
      await field.press('Control+Enter')
      await expect(dialog.getByText('pending, sent with your decision')).toBeVisible()
      await dialog.getByRole('button', { name: 'Remove your reply' }).click()
      await expect(dialog.getByText('pending, sent with your decision')).toHaveCount(0)
    } finally {
      cli.child.kill()
    }
  })

  test('shows the mark with its reply, opens the thread from the canvas and hides it on demand', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Button too close', color: '#bf616a' })
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      const layer = page.locator('.previous-round')
      await expect(layer.getByText('applied')).toBeVisible()
      const badge = layer.locator('.previous-round-badge').first()
      await expect(badge.locator('.previous-round-badge-number')).toHaveText('1')
      await expect(badge.locator('.previous-round-badge-label')).toHaveText('applied')

      await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Select \(/ }).click()
      const box = await page.locator('.image-canvas-wrapper').boundingBox()
      await page.mouse.click(box.x + 100, box.y + 80)
      const dialog = page.getByRole('dialog', { name: 'Round 1, mark 1' })
      await expect(dialog.getByText('Button too close')).toBeVisible()
      await expect(dialog.getByText('Moved the button')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()

      const toggle = page.getByRole('switch', { name: 'Show on image' })
      await expect(toggle).toHaveAttribute('aria-checked', 'true')
      await expect(toggle).not.toHaveAttribute('title', /.*/)
      expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(44)
      await expect(page.getByRole('button', { name: 'Previous round' })).toHaveCount(0)
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
      await expect(layer).toHaveCount(0)
      await expect(page.locator('.previous-round-panel details')).toHaveAttribute('open', '')
    } finally {
      cli.child.kill()
    }
  })

  test('drawing over a previous mark creates a new mark and keeps the old one out of the feedback', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Old note', color: '#bf616a' })
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      await expect(page.locator('.previous-round').getByText('applied')).toBeVisible()
      await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: /^Box \(/ }).click()
      const box = await page.locator('.image-canvas-wrapper').boundingBox()
      await page.mouse.move(box.x + 60, box.y + 60)
      await page.mouse.down()
      await page.mouse.move(box.x + 140, box.y + 100)
      await page.mouse.up()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.getByPlaceholder('Add a comment…').fill('New note')
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByRole('button', { name: /^Send feedback/ }).click()
      await expect(page.getByRole('heading', { name: 'Feedback Submitted' })).toBeVisible()
      await cli.exited
      const stdout = cli.stdout()
      expect(stdout).toContain('New note')
      expect(stdout).not.toContain('Old note')
    } finally {
      cli.child.kill()
    }
  })

  test('greys out a ghost pin instead of keeping its mark colour', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'pin', geometry: { x: 100, y: 100 }, text: 'Pin note', color: '#bf616a' })
    await writeFile(image, makeFixturePng(400, 300, '#aa0000'))
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      const circle = page.locator('.previous-round--ghost .previous-round-shape circle')
      await expect(circle).toBeVisible()
      const muted = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim())
      const fill = await circle.evaluate((el) => getComputedStyle(el).fill)
      const probe = await page.evaluate((c) => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v }, muted)
      expect(fill).toBe(probe)
      // The pin draws its own number, so the badge is the chip alone, without a leading glyph, and it is not faded with the shape.
      const badge = page.locator('.previous-round--ghost .previous-round-badge')
      await expect(badge).toHaveText('applied')
      // The fade sits on .previous-round-shape, so the badge must stay outside it and no ancestor up to the layer may fade it either.
      await expect(page.locator('.previous-round-shape .previous-round-badge')).toHaveCount(0)
      const opacities = await badge.evaluate((el) => {
        const found = []
        for (let node = el; node && !node.classList.contains('previous-round'); node = node.parentElement) {
          found.push(getComputedStyle(node).opacity)
        }
        return found
      })
      expect(opacities.length).toBeGreaterThan(1)
      expect(opacities.every((o) => o === '1')).toBe(true)
    } finally {
      cli.child.kill()
    }
  })

  test('lists the replies in the panel and opens a thread from the keyboard', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Button too close', color: '#bf616a' }, 'question', 'Left or right aligned?')
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      const section = page.getByRole('region', { name: /Round 1 replies/ })
      const entry = section.getByRole('button', { name: /1\..*question/ })
      await expect(entry.locator('.previous-round-entry-reply')).toHaveText('Agent: Left or right aligned?')
      const marker = () => section.locator('summary').evaluate((el) => getComputedStyle(el, '::before').content)
      const openMarker = await marker()
      expect(openMarker).not.toBe('none')
      await section.locator('summary').click()
      await expect(section.locator('details')).not.toHaveAttribute('open')
      const closedMarker = await marker()
      expect(closedMarker).not.toBe('none')
      expect(closedMarker).not.toBe(openMarker)
      await section.locator('summary').click()
      await entry.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog', { name: 'Round 1, mark 1' }).getByText('Left or right aligned?')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(entry).toBeFocused()
    } finally {
      cli.child.kill()
    }
  })

  test('shows no agent preview for a thread without a reply', async ({ page }) => {
    const cli0 = startCli([image], env)
    const url0 = await cli0.url
    const post = (path, body) => fetch(`${url0}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    await post('/api/annotations', { annotations: [{ id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Unanswered', color: '#bf616a' }] })
    await post('/api/feedback', {})
    await cli0.exited
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      const section = page.getByRole('region', { name: /Round 1 replies/ })
      await expect(section.getByRole('button', { name: /1\..*no reply/ })).toBeVisible()
      await expect(section.locator('.previous-round-entry-reply')).toHaveCount(0)
    } finally {
      cli.child.kill()
    }
  })

  test('lists a mark outside a smaller image as no longer in the target', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'pin', geometry: { x: 380, y: 280 }, text: 'Corner', color: '#bf616a' })
    await writeFile(image, makeFixturePng(200, 150))
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      const section = page.getByRole('region', { name: /Round 1 replies/ })
      await expect(section.getByText('No longer in the target')).toBeVisible()
      await expect(section.getByText('The mark lies outside the current image')).toBeVisible()
      const entry = section.getByRole('button', { name: /1\./ })
      await entry.click()
      await expect(page.getByRole('dialog', { name: 'Round 1, mark 1' }).getByText('Corner')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(entry).toBeFocused()
    } finally {
      cli.child.kill()
    }
  })

  test('does not reopen a thread after the previous round was hidden and shown again', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Button too close', color: '#bf616a' })
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      await page.getByRole('region', { name: /Round 1 replies/ }).getByRole('button', { name: /1\./ }).click()
      const dialog = page.getByRole('dialog', { name: 'Round 1, mark 1' })
      await expect(dialog).toBeVisible()
      const toggle = page.getByRole('switch', { name: 'Show on image' })
      await toggle.click()
      await expect(dialog).toBeHidden()
      await toggle.click()
      await expect(page.locator('.previous-round')).toBeVisible()
      await expect(dialog).toHaveCount(0)
    } finally {
      cli.child.kill()
    }
  })

  test('keeps a single thread popover open when switching between canvas and panel', async ({ page }) => {
    const cli0 = startCli([image], env)
    const url0 = await cli0.url
    const post = (path, body) => fetch(`${url0}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const ID2 = 'b4a29d3f-2c5e-4a8b-8d4f-3e6a9b2c7d5e'
    await post('/api/annotations', { annotations: [
      { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Inside', color: '#bf616a' },
      { id: ID2, type: 'pin', geometry: { x: 380, y: 280 }, text: 'Corner', color: '#bf616a' }
    ] })
    await post('/api/feedback', {})
    const sessionId = (await cli0.exited, cli0.stdout()).match(/Session: ([0-9a-f]{12})/)[1]
    for (const id of [UUID, ID2]) {
      spawnSync('node', ['index.js', 'reply', '--session', sessionId, '--to', id.slice(0, 8), '--status', 'applied', '--text', 'Done'], { env: { ...process.env, ...env }, encoding: 'utf-8' })
    }
    await writeFile(image, makeFixturePng(200, 150))
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      const section = page.getByRole('region', { name: /Round 1 replies/ })
      const dialogs = page.getByRole('dialog')
      // Keyboard activation, since a mouse press outside would close the other popover on its own.
      const open = async (entry) => { await entry.focus(); await page.keyboard.press('Enter') }
      await open(section.getByRole('button', { name: /Inside/ }))
      await expect(dialogs).toHaveCount(1)
      await open(section.getByRole('button', { name: /Corner/ }))
      await expect(dialogs).toHaveCount(1)
      await expect(dialogs.getByText('Corner')).toBeVisible()
      await open(section.getByRole('button', { name: /Inside/ }))
      await expect(dialogs).toHaveCount(1)
      await expect(dialogs.getByText('Inside')).toBeVisible()
      // Entry A, then entry B: Escape returns focus to B, the one that opened the visible popover.
      await page.keyboard.press('Escape')
      await expect(dialogs).toHaveCount(0)
      await open(section.getByRole('button', { name: /Corner/ }))
      await open(section.getByRole('button', { name: /Inside/ }))
      await expect(dialogs.getByText('Inside')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialogs).toHaveCount(0)
      await expect(section.getByRole('button', { name: /Inside/ })).toBeFocused()
    } finally {
      cli.child.kill()
    }
  })

  test('hiding the previous round closes a popover opened from the panel', async ({ page }) => {
    const cli0 = startCli([image], env)
    const url0 = await cli0.url
    const post = (path, body) => fetch(`${url0}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const ID2 = 'b4a29d3f-2c5e-4a8b-8d4f-3e6a9b2c7d5e'
    await post('/api/annotations', { annotations: [
      { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Inside', color: '#bf616a' },
      { id: ID2, type: 'pin', geometry: { x: 380, y: 280 }, text: 'Corner', color: '#bf616a' }
    ] })
    await post('/api/feedback', {})
    const sessionId = (await cli0.exited, cli0.stdout()).match(/Session: ([0-9a-f]{12})/)[1]
    spawnSync('node', ['index.js', 'reply', '--session', sessionId, '--to', ID2.slice(0, 8), '--status', 'applied', '--text', 'Done'], { env: { ...process.env, ...env }, encoding: 'utf-8' })
    await writeFile(image, makeFixturePng(200, 150))
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      await page.getByRole('region', { name: /Round 1 replies/ }).getByRole('button', { name: /Corner/ }).click()
      await expect(page.getByRole('dialog')).toHaveCount(1)
      // A mouse press on the toggle is an outside click, so activate it from the keyboard.
      await page.getByRole('switch', { name: 'Show on image' }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    } finally {
      cli.child.kill()
    }
  })

  test('marks a PDF page that carries last round replies and opens its mark', async ({ page }) => {
    const pdf = join(dir, 'deck.pdf')
    await writeFile(pdf, await makePdf([{ size: 'slide', title: 'One' }, { size: 'slide', title: 'Two' }]))
    await firstRoundWithReply(pdf, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Too dense', color: '#bf616a', page: 2 })
    const cli = startCli([pdf], env)
    try {
      await page.goto(await cli.url)
      const strip = page.getByRole('navigation', { name: 'Pages' })
      await expect(strip.getByRole('button', { name: /Page 2.*1 from last round/ })).toBeVisible()
      await expect(strip.getByRole('button', { name: 'Page 1' })).toBeVisible()
      await expect(page.locator('.previous-round')).toHaveCount(0)
      await strip.getByRole('button', { name: /Page 2/ }).click()
      await expect(page.locator('.previous-round').getByText('applied')).toBeVisible()
    } finally {
      cli.child.kill()
    }
  })

  test('does not reopen a PDF thread after leaving its page and coming back', async ({ page }) => {
    const pdf = join(dir, 'deck.pdf')
    await writeFile(pdf, await makePdf([{ size: 'slide', title: 'One' }, { size: 'slide', title: 'Two' }, { size: 'slide', title: 'Three' }]))
    await firstRoundWithReply(pdf, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Too dense', color: '#bf616a', page: 2 })
    const cli = startCli([pdf], env)
    try {
      await page.goto(await cli.url)
      await page.getByRole('region', { name: /Round 1 replies/ }).getByRole('button', { name: /Too dense/ }).click()
      await expect(page.getByRole('dialog')).toHaveCount(1)
      const strip = page.getByRole('navigation', { name: 'Pages' })
      // A page key is not a click, so nothing but the page change itself can close the popover.
      await page.keyboard.press('PageDown')
      await expect(strip.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await strip.getByRole('button', { name: /Page 2/ }).click()
      await expect(page.locator('.previous-round').getByText('applied')).toBeVisible()
      // A popover that was going to reappear would do so right after the canvas mounted, give it that long.
      await page.waitForTimeout(500)
      await expect(page.getByRole('dialog')).toHaveCount(0)
    } finally {
      cli.child.kill()
    }
  })

  test('puts last round on the video timeline and opens the thread from its tick', async ({ page }) => {
    await firstVideoRoundWithReply(page, env)

    const cli = startCli([WEBM_FIXTURE], env)
    try {
      await page.goto(await cli.url)
      await expect(page.locator('.timeline-time')).toContainText('/ 00:02.000')
      const tick = page.getByRole('button', { name: /Round 1 mark 1, applied/ })
      await expect(tick).toHaveClass(/timeline-marker--previous/)
      await expect(page.locator('.previous-round')).toHaveCount(0)
      await tick.click()
      await expect(page.locator('.timeline-time')).toContainText('00:01.000 /')
      await expect(page.getByRole('dialog', { name: 'Round 1, mark 1' }).getByText('Moved the button')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(tick).toBeFocused()
    } finally {
      cli.child.kill()
    }
  })

  test('does not pull focus to the panel entry when a video thread closes itself by leaving its mark', async ({ page }) => {
    await firstVideoRoundWithReply(page, env)
    const cli = startCli([WEBM_FIXTURE], env)
    try {
      await page.goto(await cli.url)
      await expect(page.locator('.timeline-time')).toContainText('/ 00:02.000')
      const entry = page.getByRole('region', { name: /Round 1 replies/ }).getByRole('button', { name: /Box on the first second/ })
      await entry.click()
      await expect(page.getByRole('dialog')).toHaveCount(1)
      await expect(page.locator('.timeline-time')).toContainText('00:01.000 /')
      // A frame step by key is not an outside click, so only the mark leaving the view can close the popover.
      await page.keyboard.press('ArrowRight')
      await expect(page.locator('.timeline-time')).not.toContainText('00:01.000 /')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(entry).not.toBeFocused()
    } finally {
      cli.child.kill()
    }
  })

  test('warns before approving with an unanswered question and lets the reviewer answer or approve anyway', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Button colour', color: '#bf616a' }, 'question', 'Green or blue?')
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      const approve = page.getByRole('button', { name: 'Approve', exact: true })
      await approve.click()
      const decision = page.getByRole('dialog', { name: 'Finish review' })
      await expect(decision.getByRole('radio', { name: 'Approve', exact: true })).toBeChecked()
      await expect(decision.getByText('The agent asked 1 question you have not answered.')).toBeVisible()
      await expect(decision.getByText('Green or blue?')).toBeVisible()
      await decision.getByRole('button', { name: 'Answer' }).click()
      await expect(page.getByRole('dialog', { name: 'Round 1, mark 1' })).toBeVisible()
      await page.keyboard.press('Escape')
      await approve.click()
      await decision.getByRole('button', { name: 'Approve', exact: true }).click()
      await expect(page.getByRole('heading', { name: /Approved/ })).toBeVisible()
      await cli.exited
      expect(cli.stdout()).toMatch(/^APPROVED/)
    } finally {
      cli.child.kill()
    }
  })

  test('answers a question on a general comment from the gate', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'comment', geometry: null, text: 'Overall' }, 'question', 'Which tone?')
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      await page.getByRole('button', { name: /^Approve/ }).click()
      await page.getByRole('dialog', { name: /question.*not answered/ }).getByRole('button', { name: 'Answer' }).click()
      await expect(page.getByRole('dialog', { name: 'Round 1, mark 1' })).toBeVisible()
    } finally {
      cli.child.kill()
    }
  })

  test('keeps the reply form inside a short viewport as the thread grows', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 })
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 200, width: 120, height: 90 }, text: 'Button colour', color: '#bf616a' }, 'question', 'Green or blue?')
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      await page.getByRole('region', { name: /Round 1 replies/ }).getByRole('button', { name: /1\..*question/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Round 1, mark 1' })
      const field = dialog.getByLabel('Reply to the agent')
      for (const text of ['Green', 'Dark green please', 'Really the dark one']) {
        await field.fill(text)
        await dialog.getByRole('button', { name: 'Send' }).click()
        await expect(dialog.getByText(text, { exact: true })).toBeVisible()
      }
      const box = await field.boundingBox()
      const popover = await dialog.boundingBox()
      expect(box.y + box.height).toBeLessThanOrEqual(640)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(popover.y).toBeGreaterThanOrEqual(0)
      expect(popover.y + popover.height).toBeLessThanOrEqual(640)
    } finally {
      cli.child.kill()
    }
  })

  test('keeps the round title readable with a reply to send, focuses the field after Remove and removes once', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Button colour', color: '#bf616a' }, 'question', 'Green or blue?')
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      const section = page.getByRole('region', { name: /Round 1 replies/ })
      await section.getByRole('button', { name: /1\..*question/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Round 1, mark 1' })
      const field = dialog.getByLabel('Reply to the agent')
      await field.fill('Green')
      await dialog.getByRole('button', { name: 'Send' }).click()
      await expect(section.getByText('1 to send')).toBeVisible()
      const fits = await section.locator('.previous-round-title').evaluate((el) => el.scrollWidth <= el.clientWidth)
      expect(fits).toBe(true)
      for (const selector of ['.reply-list-remove', '.reply-form-send']) {
        expect((await dialog.locator(selector).boundingBox()).height).toBeGreaterThanOrEqual(44)
      }
      let deletes = 0
      page.on('request', (req) => { if (req.method() === 'DELETE') { deletes += 1 } })
      await dialog.getByRole('button', { name: 'Remove your reply' }).dblclick()
      await expect(dialog.getByText('pending, sent with your decision')).toHaveCount(0)
      await expect(field).toBeFocused()
      await expect(dialog.getByRole('alert')).toHaveCount(0)
      expect(deletes).toBe(1)
    } finally {
      cli.child.kill()
    }
  })

  test('does not warn when every question has a pending reply', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Button colour', color: '#bf616a' }, 'question', 'Green or blue?')
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      await page.getByRole('region', { name: /Round 1 replies/ }).getByRole('button', { name: /1\..*question/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Round 1, mark 1' })
      await dialog.getByLabel('Reply to the agent').fill('Green')
      await dialog.getByRole('button', { name: 'Send' }).click()
      await expect(dialog.getByText('pending, sent with your decision')).toBeVisible()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Other decisions' }).click()
      const decision = page.getByRole('dialog', { name: 'Finish review' })
      await expect(decision.getByText('1 pending reply to round 1 goes out with this.')).toBeVisible()
      await decision.getByRole('radio', { name: 'Approve with notes' }).check()
      await expect(decision.getByText(/not answered/)).toHaveCount(0)
      await decision.getByRole('button', { name: 'Approve with notes' }).click()
      await expect(page.getByRole('heading', { name: 'Approved with Notes' })).toBeVisible()
      await expect(page.getByText(/1 reply passed along as notes/)).toBeVisible()
      await cli.exited
      expect(cli.stdout()).toMatch(/^APPROVED WITH NOTES: 1 reply to round 1\./)
    } finally {
      cli.child.kill()
    }
  })

  test('keeps focus inside the decision dialog and returns it to the split button', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Button colour', color: '#bf616a' }, 'question', 'Green or blue?')
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      const approve = page.getByRole('button', { name: 'Approve', exact: true })
      await approve.click()
      const decision = page.getByRole('dialog', { name: 'Finish review' })
      const option = decision.getByRole('radio', { name: 'Approve', exact: true })
      await expect(option).toBeFocused()
      // An app re-render behind the dialog must not move focus.
      await page.getByRole('button', { name: /zoom in/i }).evaluate((b) => b.click())
      await expect(option).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(decision.getByRole('button', { name: 'Approve', exact: true })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(option).toBeFocused()
      await decision.getByRole('button', { name: 'Answer' }).click()
      await expect(page.getByRole('dialog', { name: 'Round 1, mark 1' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(approve).toBeFocused()
      await page.keyboard.press('ControlOrMeta+Shift+Enter')
      await expect(decision).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(decision).toHaveCount(0)
      await expect(approve).toBeFocused()
    } finally {
      cli.child.kill()
    }
  })

  test('anchors last round again after the page is captured at another viewport', async ({ page }) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<!doctype html><body style="margin:0;height:600px;background:#eceff4"><h1>Pricing</h1></body>')
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const target = `http://127.0.0.1:${server.address().port}/`
    try {
      const first = startCli([target, '--viewport', '800x600'], env)
      const firstUrl = await first.url
      const post = (path, body) => fetch(`${firstUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      await post('/api/annotations', { annotations: [{ id: UUID, type: 'pin', geometry: { x: 700, y: 100 }, text: 'Right edge', color: '#bf616a' }] })
      await post('/api/feedback', {})
      await first.exited

      const cli = startCli([target, '--viewport', '800x600'], env)
      try {
        await page.goto(await cli.url)
        const section = page.getByRole('region', { name: /Round 1 replies/ })
        await expect(section).toBeVisible()
        await expect(section.getByText('No longer in the target')).toHaveCount(0)

        // A phone capture (375 px) is narrower than the pin's x position, so the mark now lies outside the image.
        await page.locator('.viewport-trigger').click()
        await page.locator('label', { has: page.getByRole('radio', { name: 'Phone', exact: true }) }).click()
        await Promise.all([
          page.waitForResponse('**/api/recapture'),
          page.getByRole('button', { name: 'Capture again' }).click()
        ])
        await expect(section.getByText('No longer in the target')).toBeVisible()
      } finally {
        cli.child.kill()
      }
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
