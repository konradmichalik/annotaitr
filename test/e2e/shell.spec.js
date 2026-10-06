// test/e2e/shell.spec.js
// The chrome both modes share: the panel menu, the settings that carry over
// from one mode to the other, and the done screen.
import { writeFile, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { startCli } from '../helpers/cli.js'
import { makeFixturePng } from '../helpers/fixtureImage.js'

async function withTargets(run) {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-shell-'))
  const markdown = join(dir, 'notes.md')
  const image = join(dir, 'shot.png')
  await writeFile(markdown, '# Notes\n\nA paragraph to review.\n')
  await writeFile(image, makeFixturePng(200, 150))
  try {
    await run({ markdown, image })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('the markdown panel menu works from the keyboard and returns focus', async ({ page }) => {
  await withTargets(async ({ markdown }) => {
    const cli = startCli([markdown])
    try {
      await page.goto(await cli.url)
      const menu = page.getByRole('button', { name: 'More actions', exact: true })
      await menu.click()
      await expect(page.getByRole('menuitem', { name: 'Export annotations' })).toBeDisabled()
      await expect(page.getByRole('menuitem', { name: 'Import annotations (JSON)' })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(menu).toBeFocused()
    } finally {
      cli.child.kill()
    }
  })
})

test('a theme picked in image mode applies in markdown mode', async ({ page }) => {
  await withTargets(async ({ markdown, image }) => {
    const imageCli = startCli([image])
    const imageUrl = await imageCli.url
    try {
      await page.goto(imageUrl)
      await page.getByRole('button', { name: 'Settings' }).click()
      await page.getByRole('radio', { name: 'Dark' }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    } finally {
      imageCli.child.kill()
    }

    const markdownCli = startCli([markdown])
    const markdownUrl = await markdownCli.url
    try {
      // Cookies are scoped by host, so both modes must serve from the same one.
      expect(new URL(markdownUrl).hostname).toBe(new URL(imageUrl).hostname)
      await page.goto(markdownUrl)
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await page.getByRole('button', { name: 'Settings' }).click()
      await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    } finally {
      markdownCli.child.kill()
    }
  })
})

test('approving shows the shared done screen', async ({ page }) => {
  await withTargets(async ({ markdown }) => {
    const cli = startCli([markdown])
    try {
      await page.goto(await cli.url)
      await page.getByRole('button', { name: 'Approve', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Approved' })).toBeVisible()
      await expect(page.locator('.done-screen')).toHaveClass(/canvas-surface/)
      expect(await cli.exited).toBe(0)
      expect(cli.stdout()).toContain('APPROVED')
    } finally {
      cli.child.kill()
    }
  })
})
