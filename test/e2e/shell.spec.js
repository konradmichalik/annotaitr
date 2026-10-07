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

test('the header names the source, the target and who is waiting', async ({ page }) => {
  await withTargets(async ({ markdown, image }) => {
    const cli = startCli([image, '--origin', 'claude-code'])
    try {
      await page.goto(await cli.url)
      const header = page.locator('.app-header')
      await expect(header.locator('.source-chip')).toHaveText('Image')
      await expect(header.locator('.header-facts')).toHaveText('200 × 150')
      await expect(header.getByText('Claude Code is waiting')).toBeVisible()
      await expect(header.locator('.version-badge')).toHaveCount(0)
      await header.getByRole('button', { name: 'Keyboard shortcuts' }).click()
      await expect(page.getByRole('tab', { name: 'Shortcuts' })).toHaveAttribute('aria-selected', 'true')
    } finally {
      cli.child.kill()
    }

    const markdownCli = startCli([markdown])
    try {
      await page.goto(await markdownCli.url)
      await expect(page.locator('.source-chip')).toHaveText('Markdown')
      await expect(page.getByText('Terminal is waiting')).toBeVisible()
    } finally {
      markdownCli.child.kill()
    }
  })
})

test('the decision dialog sends a summary as the general comment', async ({ page }) => {
  await withTargets(async ({ markdown }) => {
    const cli = startCli([markdown, '--origin', 'opencode'])
    try {
      await page.goto(await cli.url)
      await page.getByRole('button', { name: /General comment/ }).click()
      await page.locator('.app-sidebar textarea, .annotation-panel textarea').first().fill('First pass')
      await page.keyboard.press('ControlOrMeta+Enter')
      await expect(page.getByRole('button', { name: /^Send feedback/ })).toBeVisible()
      await page.keyboard.press('ControlOrMeta+Shift+Enter')
      const decision = page.getByRole('dialog', { name: 'Finish review' })
      await expect(decision.getByRole('group', { name: 'What should OpenCode do?' })).toBeVisible()
      await expect(decision.getByRole('radio', { name: 'Send feedback' })).toBeChecked()
      const summary = decision.getByLabel(/Summary for the agent/)
      await expect(summary).toHaveValue('First pass')
      await summary.fill('Tighten the intro')
      await summary.press('ControlOrMeta+Enter')
      await expect(page.getByRole('heading', { name: 'Feedback Submitted' })).toBeVisible()
      await cli.exited
      expect(cli.stdout()).toContain('Tighten the intro')
      expect(cli.stdout()).not.toContain('First pass')
    } finally {
      cli.child.kill()
    }
  })
})

test('approving from the dialog asks once before discarding notes', async ({ page }) => {
  await withTargets(async ({ markdown }) => {
    const cli = startCli([markdown])
    try {
      await page.goto(await cli.url)
      await page.getByRole('button', { name: /General comment/ }).click()
      await page.locator('.app-sidebar textarea, .annotation-panel textarea').first().fill('Not needed')
      await page.keyboard.press('ControlOrMeta+Enter')
      await page.getByRole('button', { name: 'Other decisions' }).click()
      const decision = page.getByRole('dialog', { name: 'Finish review' })
      await decision.getByRole('radio', { name: 'Approve', exact: true }).check()
      await decision.getByRole('button', { name: 'Approve', exact: true }).click()
      await expect(decision.getByRole('alert')).toHaveText('This discards 1 note. Select Approve again to confirm.')
      await decision.getByRole('button', { name: 'Discard and approve' }).click()
      await expect(page.getByRole('heading', { name: 'Approved' })).toBeVisible()
      await cli.exited
      expect(cli.stdout()).toMatch(/^APPROVED: No changes requested\./)
    } finally {
      cli.child.kill()
    }
  })
})

test('tool letters, the dock and the general comment work from the keyboard', async ({ page }) => {
  await withTargets(async ({ markdown, image }) => {
    const imageCli = startCli([image])
    try {
      await page.goto(await imageCli.url)
      const dock = page.getByRole('toolbar', { name: 'Annotation tools' })
      await expect(page.locator('.image-canvas-wrapper')).toBeVisible()
      await page.keyboard.press('r')
      await expect(dock.getByRole('button', { name: 'Box (R)' })).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.press('Escape')
      await expect(dock.getByRole('button', { name: 'Select (V)' })).toHaveAttribute('aria-pressed', 'true')
      // One tab stop on the pressed tool, the arrow keys move along the dock.
      await dock.getByRole('button', { name: 'Select (V)' }).focus()
      await page.keyboard.press('ArrowRight')
      await expect(dock.getByRole('button', { name: 'Box (R)' })).toBeFocused()
      await expect(dock.locator('[tabindex="0"]')).toHaveCount(1)
      await page.keyboard.press('g')
      const field = page.getByLabel('General comment', { exact: true })
      await expect(field).toBeFocused()
      // Letters typed into the field are text, not tool keys.
      await field.pressSequentially('crop')
      await expect(dock.getByRole('button', { name: 'Select (V)' })).toHaveAttribute('aria-pressed', 'true')
      await field.press('ControlOrMeta+Enter')
      await expect(page.locator('.general-comment-preview')).toHaveText('crop')
    } finally {
      imageCli.child.kill()
    }

    const markdownCli = startCli([markdown])
    try {
      await page.goto(await markdownCli.url)
      const dock = page.getByRole('toolbar', { name: 'Annotation mode' })
      await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible()
      await page.keyboard.press('c')
      await expect(dock.getByRole('button', { name: 'Pinpoint (C)' })).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.press('v')
      await expect(dock.getByRole('button', { name: 'Select text (V)' })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByText('With no notes the main button reads')).toBeVisible()
    } finally {
      markdownCli.child.kill()
    }
  })
})

test('the markdown selection bar opens the composer, which keeps a draft on a click outside', async ({ page }) => {
  await withTargets(async ({ markdown }) => {
    const cli = startCli([markdown])
    try {
      await page.goto(await cli.url)
      const paragraph = page.getByText('A paragraph to review.')
      const rect = await paragraph.boundingBox()
      await page.mouse.move(rect.x + 2, rect.y + rect.height / 2)
      await page.mouse.down()
      await page.mouse.move(rect.x + 80, rect.y + rect.height / 2, { steps: 4 })
      await page.mouse.up()

      const bar = page.getByRole('toolbar', { name: 'Selection' })
      await expect(bar.getByRole('button', { name: 'Remove' })).toHaveAttribute('type', 'button')
      await bar.getByRole('button', { name: 'Change' }).click()

      const composer = page.getByRole('dialog', { name: 'Comment on selection' })
      const field = composer.getByRole('textbox', { name: 'Comment on selection' })
      await expect(field).toBeFocused()
      await field.fill('Name the paragraph')
      await page.mouse.click(5, 300)
      await expect(composer).toBeVisible()

      await field.focus()
      await page.keyboard.press('ControlOrMeta+Enter')
      await expect(composer).toHaveCount(0)
      await page.getByRole('button', { name: /^Send feedback/ }).click()
      await cli.exited
      expect(cli.stdout()).toContain('> Name the paragraph')
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

test('the markdown selection bar asks with 4 and adds after the selection with 2', async ({ page }) => {
  await withTargets(async ({ markdown }) => {
    const cli = startCli([markdown])
    const select = async (from, to) => {
      const rect = await page.getByText('A paragraph to review.').boundingBox()
      await page.mouse.move(rect.x + from, rect.y + rect.height / 2)
      await page.mouse.down()
      await page.mouse.move(rect.x + to, rect.y + rect.height / 2, { steps: 4 })
      await page.mouse.up()
      await expect(page.getByRole('toolbar', { name: 'Selection' })).toBeVisible()
    }
    try {
      await page.goto(await cli.url)
      await select(2, 40)
      await page.keyboard.press('4')
      const ask = page.getByRole('dialog', { name: 'Question on selection' })
      await expect(ask.getByRole('button', { name: 'Intent: Question' })).toBeVisible()
      await ask.getByRole('textbox').fill('Which paragraph?')
      await page.keyboard.press('ControlOrMeta+Enter')
      await expect(page.getByRole('button', { name: /^1\. Question/ })).toBeVisible()

      await select(60, 110)
      await page.keyboard.press('2')
      const add = page.getByRole('dialog', { name: 'Text to insert' })
      await expect(add.getByRole('button', { name: /^Intent/ })).toHaveCount(0)
      await add.getByRole('textbox').fill(' Mind the gap.')
      await page.keyboard.press('ControlOrMeta+Enter')
      await expect(page.getByRole('button', { name: /^2\. Add/ })).toBeVisible()

      await page.getByRole('button', { name: /^Send feedback/ }).click()
      await cli.exited
      const stdout = cli.stdout()
      expect(stdout).toContain('2 annotations (1 Add, 1 Question):')
      expect(stdout).toMatch(/## 1\. Question · Text \(Line 3\)[^\n]*\n```\n[^\n]+\n```\n> Which paragraph\?/)
      expect(stdout).toMatch(/## 2\. Add · Insertion \(Line 3\)[^\n]*\nAfter: `[^`]+`\n```\nMind the gap\.\n```/)
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})
