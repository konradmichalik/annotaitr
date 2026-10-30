// test/e2e/markdown-replies.spec.js
// Last round's notes on Markdown files and the agent's replies on them, as the reviewer sees them in round 2.
import { writeFile, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { startCli } from '../helpers/cli.js'

const BEFORE = '# Guide\n\nThe intro says hello to every reader.\n\nRun the installer and restart the shell.\n'
const AFTER = '# Guide\n\nA short welcome comes first now.\n\nThe intro says hello to every reader.\n\nRun the installer.\n'

/** Selects `text` inside the element matching `selector` the way a drag would, and releases the mouse there. */
async function selectText(page, selector, text) {
  await page.locator(selector).evaluate((el, wanted) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const index = walker.currentNode.textContent.indexOf(wanted)
      if (index === -1) { continue }
      const range = document.createRange()
      range.setStart(walker.currentNode, index)
      range.setEnd(walker.currentNode, index + wanted.length)
      window.getSelection().removeAllRanges()
      window.getSelection().addRange(range)
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      return
    }
  }, text)
}

async function comment(page, selector, text, note) {
  await selectText(page, selector, text)
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: /^Comment/ }).click()
  const composer = page.getByRole('dialog', { name: 'Comment on selection' })
  await composer.getByRole('textbox').fill(note)
  await composer.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.note-card', { hasText: note })).toBeVisible()
}

function reply(env, sessionId, handle, status, text) {
  spawnSync('node', ['index.js', 'reply', '--session', sessionId, '--to', handle, '--status', status, '--text', text], {
    env: { ...process.env, ...env }, encoding: 'utf-8'
  })
}

const handles = (out) => [...out.matchAll(/\[#([0-9a-f]{8})\]/g)].map((m) => m[1])

test.describe('replies from the last round of a Markdown review', () => {
  let dir, doc, env
  test.beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-md-replies-'))
    doc = join(dir, 'guide.md')
    await writeFile(doc, BEFORE)
    env = { ANNOTAITR_SESSION_DIR: join(dir, 'sessions') }
  })
  test.afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  test('round 2 finds a moved note, lists a gone one apart and sends an answer alone', async ({ page }) => {
    const first = startCli([doc], env)
    await page.goto(await first.url)
    await comment(page, '[data-block-id="block-1"]', 'intro says hello', 'Make this friendlier')
    await comment(page, '[data-block-id="block-2"]', 'restart the shell', 'Is the restart needed?')
    await page.getByRole('button', { name: /^Send feedback/ }).click()
    await first.exited
    const sessionId = first.stdout().match(/Session: ([0-9a-f]{12}) \(round 1\)/)[1]
    const [friendlier, restart] = handles(first.stdout())
    reply(env, sessionId, friendlier, 'question', 'Warmer or shorter?')
    reply(env, sessionId, restart, 'applied', 'Removed the restart')
    await writeFile(doc, AFTER)

    const second = startCli([doc], env)
    await page.goto(await second.url)
    await expect(page.getByRole('tab', { name: 'Replies · 2' })).toHaveAttribute('aria-selected', 'true')
    const panel = page.getByRole('region', { name: /Round 1 replies/ })
    await expect(panel.getByRole('button', { name: /note 1\..*Line 5 · moved/ })).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'No longer in the document' })).toBeVisible()
    await expect(panel.getByText('“restart the shell”')).toBeVisible()
    await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get('annotaitr-previous') ?? [])].map((r) => r.toString()))).toEqual(['intro says hello'])

    // The agent waits for an answer, so the main button opens the dialog with the question first.
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    const decision = page.getByRole('dialog', { name: 'Finish review' })
    await expect(decision.getByText('The agent asked 1 question you have not answered.')).toBeVisible()
    await decision.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByLabel('Reply to the agent')).toBeFocused()
    await page.getByLabel('Reply to the agent').fill('Warmer')
    await panel.locator('.reply-form-send').click()
    await expect(panel.getByText('1 to send')).toBeVisible()

    const send = page.getByRole('button', { name: /^Send feedback/ })
    await expect(send).toHaveAttribute('title', 'Send 1 reply')
    await send.click()
    await expect(page.getByRole('heading', { name: /^Sent to / })).toBeVisible()
    await second.exited
    const out = second.stdout()
    expect(out).toMatch(/^Feedback: 1 reply to round 1, no new notes\./)
    expect(out).toContain(`### [#${friendlier}] Text (Line 5, `)
    expect(out).toContain('> Round 1, note 1 (Line 3): Make this friendlier\nAgent (question): Warmer or shorter?\nReviewer: Warmer\n')
    expect(out).toContain(`Session: ${sessionId} (round 2)`)
  })

  test('round 2 marks what the agent added, changed and removed, and the normal view comes back with its notes', async ({ page }) => {
    await writeFile(doc, '# Plan\n\nKeep this step.\n\nRun the old installer.\n\nDrop this paragraph.\n\nThe end.\n')
    const first = startCli([doc], env)
    await page.goto(await first.url)
    await comment(page, '[data-block-id="block-1"]', 'Keep this', 'Why keep it?')
    await page.getByRole('button', { name: /^Send feedback/ }).click()
    await first.exited
    await writeFile(doc, '# Plan\n\nA brand new opening.\n\nKeep this step.\n\nRun the new installer.\n\nThe end.\n')

    const second = startCli([doc], env)
    await page.goto(await second.url)
    const toggle = page.getByRole('button', { name: 'Changes since round 1' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.round-diff-counts')).toHaveText('+1 added · ±1 changed · −1 removed')
    await comment(page, '[data-block-id="block-3"]', 'new installer', 'Which version?')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'false')
    const view = page.getByRole('article', { name: 'Changes since round 1' })
    await expect(view.locator('.round-change--added')).toHaveText('+Added since round 1: A brand new opening.')
    await expect(view.locator('.round-change--changed .round-change-before')).toHaveText('Changed since round 1, before: Run the old installer.')
    await expect(view.locator('.round-change--changed .round-change-after')).toHaveText('Now: Run the new installer.')
    await expect(view.locator('.round-change--removed')).toHaveText('−Removed since round 1: Drop this paragraph.')
    await expect(page.locator('.round-diff-hint')).toHaveText('Read only. Turn it off to add notes.')
    await expect(view.locator('mark.annotation-highlight')).toHaveCount(0)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.round-change')).toHaveCount(0)
    await expect(page.locator('mark.annotation-highlight')).toHaveText('new installer')
    await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get('annotaitr-previous') ?? [])].map((r) => r.toString()))).toEqual(['Keep this'])
    await page.getByRole('button', { name: /^Send feedback/ }).click()
    await second.exited
    expect(second.stdout()).toMatch(/## 1\. Text \(Line 7\) \[#[0-9a-f]{8}\]\n```\nnew installer\n```\n> Which version\?\n/)
  })

  test('undo, redo, search and a restored draft leave the changes view for the preview', async ({ page }) => {
    await writeFile(doc, '# Plan\n\nKeep this step.\n\nRun the old installer.\n')
    const first = startCli([doc], env)
    await page.goto(await first.url)
    await comment(page, '[data-block-id="block-1"]', 'Keep this', 'Why keep it?')
    await page.getByRole('button', { name: /^Send feedback/ }).click()
    await first.exited
    await writeFile(doc, '# Plan\n\nKeep this step.\n\nRun the new installer.\n')

    const second = startCli([doc], env)
    const url = await second.url
    await page.goto(url)
    const toggle = page.getByRole('button', { name: 'Changes since round 1' })
    const note = page.locator('.note-card', { hasText: 'Which version?' })
    await comment(page, '[data-block-id="block-2"]', 'new installer', 'Which version?')

    await toggle.click()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(note).toHaveCount(0)
    await expect(page.locator('mark.annotation-highlight')).toHaveCount(0)

    await toggle.click()
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(note).toBeVisible()
    await expect(page.locator('mark.annotation-highlight')).toHaveText('new installer')

    await toggle.click()
    await page.keyboard.press('ControlOrMeta+f')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByLabel('Search in document')).toBeVisible()

    // The draft is written after a short debounce; the same port keeps the origin, and with it the draft.
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((name) => name.startsWith('md-annotator-draft-file-')))).toBe(true)
    second.child.kill()
    await second.exited
    const third = startCli([doc], { ...env, ANNOTAITR_PORT: new URL(url).port })
    try {
      await page.goto(await third.url)
      await toggle.click()
      await page.getByRole('button', { name: 'Restore' }).click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await expect(page.locator('mark.annotation-highlight')).toHaveText('new installer')
      await expect(note).toBeVisible()
    } finally {
      third.child.kill()
      await third.exited
    }
  })
})
