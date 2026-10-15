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
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: /^Change/ }).click()
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
    expect(out).toContain(`### [#${friendlier}] Change · Text (Line 5, `)
    expect(out).toContain('> Round 1, note 1 (Line 3): Make this friendlier\nAgent (question): Warmer or shorter?\nReviewer: Warmer\n')
    expect(out).toContain(`Session: ${sessionId} (round 2)`)
  })
})
