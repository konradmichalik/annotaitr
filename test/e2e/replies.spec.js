// test/e2e/replies.spec.js
// Last round's marks and the agent's replies on them, as the reviewer sees them in round 2.
import { writeFile, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { startCli } from '../helpers/cli.js'
import { makeFixturePng } from '../helpers/fixtureImage.js'

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

test.describe('replies from the last round', () => {
  let dir, image, env
  test.beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-replies-'))
    image = join(dir, 'shot.png')
    await writeFile(image, makeFixturePng(400, 300))
    env = { ANNOTAITR_SESSION_DIR: join(dir, 'sessions') }
  })
  test.afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  test('shows the mark with its reply, opens the thread from the canvas and hides it on demand', async ({ page }) => {
    await firstRoundWithReply(image, env, { id: UUID, type: 'box', geometry: { x: 40, y: 40, width: 120, height: 80 }, text: 'Button too close', color: '#bf616a' })
    const cli = startCli([image], env)
    try {
      await page.goto(await cli.url)
      const layer = page.locator('.previous-round')
      await expect(layer.getByText('applied')).toBeVisible()

      await page.getByRole('toolbar', { name: 'Annotation tools' }).getByRole('button', { name: 'Select' }).click()
      const box = await page.locator('.image-canvas-wrapper').boundingBox()
      await page.mouse.click(box.x + 100, box.y + 80)
      const dialog = page.getByRole('dialog', { name: 'Round 1, mark 1' })
      await expect(dialog.getByText('Button too close')).toBeVisible()
      await expect(dialog.getByText('Moved the button')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()

      const toggle = page.getByRole('button', { name: 'Previous round' })
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await expect(layer).toHaveCount(0)
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
      await page.getByRole('toolbar', { name: 'Annotation tools' }).getByText('Box').click()
      const box = await page.locator('.image-canvas-wrapper').boundingBox()
      await page.mouse.move(box.x + 60, box.y + 60)
      await page.mouse.down()
      await page.mouse.move(box.x + 140, box.y + 100)
      await page.mouse.up()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.getByPlaceholder('Add a comment (optional)...').fill('New note')
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByRole('button', { name: 'Feedback' }).click()
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
    } finally {
      cli.child.kill()
    }
  })
})
