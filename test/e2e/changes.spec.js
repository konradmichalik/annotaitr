// test/e2e/changes.spec.js
// `annotaitr changes`: the walkthrough of a repository's uncommitted changes, laid out like a pull request.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test, expect } from '@playwright/test'
import { startCli } from '../helpers/cli.js'

const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' }

async function withRepo(run, extra = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'annotaitr-changes-e2e-')))
  const explain = join(await realpath(tmpdir()), `annotaitr-explain-${process.pid}.json`)
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: gitEnv })
  try {
    git('init', '-q', '-b', 'main')
    await writeFile(join(dir, 'cache.js'), 'const key = page\nexport default key\n')
    await mkdir(join(dir, 'docs'))
    await writeFile(join(dir, 'docs', 'guide.md'), '# Guide\nStays as it is.\n')
    git('add', '.')
    git('commit', '-q', '-m', 'init')
    await writeFile(join(dir, 'cache.js'), 'const key = `${page}_${workspace}`\nexport default key\n')
    await writeFile(join(dir, 'notes.md'), '# Notes\n')
    await writeFile(explain, JSON.stringify({
      title: 'Key the cache per workspace',
      commit: 'fix: key the cache per workspace',
      files: { 'cache.js': 'Adds the workspace to the key.' },
      ...extra
    }))
    await run({ dir, explain })
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(explain, { force: true })
  }
}

test('the agent can ask for a closer look at a file without hiding another', async ({ page }) => {
  await withRepo(async ({ dir, explain }) => {
    const cli = startCli(['changes', '--origin', 'claude-code', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      const overview = page.getByRole('region', { name: 'Overview' })
      const box = overview.getByRole('group', { name: /Review focus: 1 of 2 files to check closely/ })
      await expect(box).toContainText('The key decides which data a user sees.')

      const tree = page.getByRole('navigation', { name: 'Changed files' })
      await expect(tree.getByRole('button', { name: /^cache\.js, check closely, / })).toBeVisible()
      await expect(page.getByRole('region', { name: 'cache.js' }).getByRole('img', { name: 'Check closely' })).toBeVisible()

      const only = page.getByRole('button', { name: /Only files to check closely/ })
      await expect(tree.getByRole('button', { name: /^notes\.md/ })).toBeVisible()
      await only.click()
      await expect(tree.getByRole('button', { name: /^notes\.md/ })).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'notes.md' })).toBeVisible()

      await box.getByRole('button', { name: /cache\.js/ }).click()
      await expect(page.getByRole('region', { name: 'cache.js' })).toBeInViewport()
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  }, { focus: { 'cache.js': 'The key decides which data a user sees.' } })
})

test('a note on a diff line names the file and its new line', async ({ page }) => {
  await withRepo(async ({ dir, explain }) => {
    const cli = startCli(['changes', '--origin', 'claude-code', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      await expect(page.getByRole('region', { name: 'Overview' })).toContainText('Key the cache per workspace')
      const tree = page.getByRole('navigation', { name: 'Changed files' })
      await expect(tree.getByRole('button', { name: 'notes.md, 0 notes, +1 \u22120, added, not explained' })).toBeVisible()

      const card = page.getByRole('region', { name: 'cache.js' })
      await expect(card).toContainText('Adds the workspace to the key.')
      const added = card.locator('.diff-add').first()
      const rect = await added.boundingBox()
      await page.mouse.move(rect.x + 90, rect.y + rect.height / 2)
      await page.mouse.down()
      await page.mouse.move(rect.x + 200, rect.y + rect.height / 2, { steps: 4 })
      await page.mouse.up()

      await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Comment' }).click()
      const field = page.getByRole('dialog', { name: 'Comment on selection' }).getByRole('textbox', { name: 'Comment on selection' })
      await field.fill('Use the language too')
      await page.keyboard.press('ControlOrMeta+Enter')
      await expect(tree.getByRole('button', { name: /^cache\.js, 1 note/ })).toBeVisible()

      await page.getByRole('button', { name: /^Send feedback/ }).click()
      expect(await cli.exited).toBe(0)
      expect(cli.stdout()).toMatch(/## 1\. Text \(new Line 1 in cache\.js\) \[#[0-9a-f]{8}\]/)
      expect(cli.stdout()).toContain('> Use the language too')
      expect(existsSync(join(dir, '.git', 'annotaitr', 'changes.md'))).toBe(false)
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

test('the header names what is compared and a card opens its whole file to read', async ({ page }) => {
  await withRepo(async ({ dir, explain }) => {
    const cli = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      await expect(page.locator('.app-target')).toHaveText('main · uncommitted')
      await expect(page.locator('.header-facts')).toHaveText('2 files · +2 \u22121')

      const card = page.getByRole('region', { name: 'cache.js' })
      const whole = card.getByRole('button', { name: 'Whole file' })
      await whole.click()
      await expect(whole).toHaveAttribute('aria-pressed', 'true')
      await expect(card.locator('.change-whole')).toContainText('export default key')
      await expect(card.locator('.block-diff-wrapper')).toBeHidden()
      await whole.click()
      await expect(card.locator('.change-whole')).toHaveCount(0)
      await expect(card.locator('.block-diff-wrapper')).toBeVisible()
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

test('a whole file that failed to load is requested again on the next open', async ({ page }) => {
  await withRepo(async ({ dir, explain }) => {
    const cli = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      let failed = false
      await page.route('**/api/changes/full?*', (route) => {
        if (failed) { return route.continue() }
        failed = true
        return route.abort()
      })
      await page.goto(await cli.url)

      const card = page.getByRole('region', { name: 'cache.js' })
      const whole = card.getByRole('button', { name: 'Whole file' })
      await whole.click()
      await expect(card.getByRole('status')).toHaveText('Could not load the whole file.')
      await whole.click()
      await expect(card.getByRole('status')).toHaveCount(0)
      await whole.click()
      await expect(card.locator('.change-whole')).toContainText('export default key')
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

test('marking a file as reviewed folds its card to the explanation', async ({ page }) => {
  await withRepo(async ({ dir, explain }) => {
    const cli = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      const tree = page.getByRole('navigation', { name: 'Changed files' })
      await tree.getByRole('button', { name: /^cache\.js/ }).click()
      await page.getByRole('button', { name: 'Mark file as reviewed' }).click()

      const card = page.getByRole('region', { name: 'cache.js' })
      await expect(card.getByRole('button', { name: /cache\.js/ })).toHaveAttribute('aria-expanded', 'false')
      await expect(card.getByRole('button', { name: 'Reviewed' })).toHaveAttribute('aria-pressed', 'true')
      await expect(card.locator('.diff-add').first()).toBeHidden()
      await expect(card).toContainText('Adds the workspace to the key.')
      await expect(page.getByText('1 of 2 reviewed')).toBeVisible()

      await page.keyboard.press('j')
      await expect(tree.getByRole('button', { name: /^notes\.md/ })).toHaveAttribute('aria-current', 'true')

      const notes = page.getByRole('region', { name: 'notes.md' })
      await notes.getByRole('button', { name: 'Mark as reviewed' }).click()
      await expect(page.getByText('2 of 2 reviewed')).toBeVisible()
      await expect(notes.getByRole('button', { name: /notes\.md/ })).toHaveAttribute('aria-expanded', 'false')
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

test('a second round of the same changes shows the agent\'s reply and sends the answer', async ({ page }) => {
  const sessions = await mkdtemp(join(tmpdir(), 'annotaitr-changes-sessions-'))
  const env = { ANNOTAITR_SESSION_DIR: join(sessions, 'store') }
  try {
    await withRepo(async ({ dir }) => {
      const first = startCli(['changes'], env, { cwd: dir })
      const url = await first.url
      const { data: { files: [walkthrough] } } = await (await fetch(`${url}/api/files`)).json()
      const general = { id: 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d', type: 'COMMENT', targetType: 'global', blockId: '', startOffset: 0, endOffset: 0, originalText: '', text: 'Why per workspace?' }
      await fetch(`${url}/api/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ path: walkthrough.path, blocks: [], annotations: [general] }] }) })
      await first.exited
      const sessionId = first.stdout().match(/Session: ([0-9a-f]{12}) \(round 1\)/)[1]
      execFileSync('node', [join(process.cwd(), 'index.js'), 'reply', '--session', sessionId, '--to', 'a3f19c2e', '--status', 'question', '--text', 'Per user too?'], { env: { ...process.env, ...env } })

      const second = startCli(['changes'], env, { cwd: dir })
      try {
        await page.goto(await second.url)
        const panel = page.getByRole('region', { name: /Round 1 replies/ })
        await panel.getByRole('button', { name: /general comment.*question/ }).click()
        await page.getByLabel('Reply to the agent').fill('Per workspace is enough')
        await panel.locator('.reply-form-send').click()
        await page.getByRole('button', { name: /^Send feedback/ }).click()
        await expect(page.getByRole('heading', { name: /^Sent to / })).toBeVisible()
        await second.exited
        expect(second.stdout()).toContain('### [#a3f19c2e] General comment\n> Round 1, general comment: Why per workspace?\nAgent (question): Per user too?\nReviewer: Per workspace is enough\n')
        expect(second.stdout()).toContain(`Session: ${sessionId} (round 2)`)
      } finally {
        if (second.child.exitCode === null) { second.child.kill() }
      }
    })
  } finally {
    await rm(sessions, { recursive: true, force: true })
  }
})

/** A repository whose committed `before` files turn into `after` (null deletes one), with an explanation. */
async function withDocs({ before, after, explanation }, run) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'annotaitr-read-e2e-')))
  const explain = join(dir, '.git', 'explain.json')
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: gitEnv })
  try {
    git('init', '-q', '-b', 'main')
    for (const [path, text] of Object.entries(before)) {
      await mkdir(dirname(join(dir, path)), { recursive: true })
      await writeFile(join(dir, path), text)
    }
    git('add', '.')
    git('commit', '-q', '-m', 'init')
    for (const [path, text] of Object.entries(after)) {
      if (text === null) { await rm(join(dir, path)) } else { await writeFile(join(dir, path), text) }
    }
    await writeFile(explain, JSON.stringify({ title: 'Rework the guide', commit: 'docs: rework the guide', ...explanation }))
    await run({ dir, explain })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Selects `text` inside the element matching `selector` the way a drag would, and releases the mouse there. */
async function selectText(page, selector, text) {
  await page.locator(selector).first().evaluate((el, wanted) => {
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
    throw new Error(`"${wanted}" not found`)
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

const GUIDE_BEFORE = '# Guide\n\nIntro text.\n\nOld line.\n'
const GUIDE_AFTER = '# Guide\n\nIntro text.\n\nFirst line\nsecond line.\n\n```mermaid\ngraph TD; A-->B\n```\n'

test('a markdown card reads as rendered markdown and a note there names the new line', async ({ page }) => {
  await withDocs({ before: { 'guide.md': GUIDE_BEFORE }, after: { 'guide.md': GUIDE_AFTER }, explanation: { files: { 'guide.md': 'Splits the line.' } } }, async ({ dir, explain }) => {
    const cli = startCli(['changes', '--origin', 'claude-code', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      const card = page.getByRole('region', { name: 'guide.md' })
      const view = card.getByRole('group', { name: 'View' })
      await expect(view.getByRole('button', { name: 'Diff' })).toHaveAttribute('aria-pressed', 'true')
      await view.getByRole('button', { name: 'Read' }).click()
      await expect(view.getByRole('button', { name: 'Read' })).toHaveAttribute('aria-pressed', 'true')
      await expect(card.locator('.change-read h1')).toHaveText('Guide')
      await expect(card.locator('.block-diff-wrapper').first()).toBeHidden()
      await expect(card.getByRole('button', { name: 'Whole file' })).toHaveCount(0)
      // A diagram stays code, so nothing of the file goes to a render server.
      await expect(card.locator('.change-read code')).toContainText('graph TD; A-->B')
      await expect(card.locator('.change-read .mermaid-diagram')).toHaveCount(0)

      await comment(page, '.change-read .block-paragraph:visible >> nth=1', 'line\nsecond', 'Keep it on one line')
      const tree = page.getByRole('navigation', { name: 'Changed files' })
      await expect(tree.getByRole('button', { name: /^guide\.md, 1 note/ })).toBeVisible()
      await expect(page.locator('.note-card', { hasText: 'Keep it on one line' })).toContainText('guide.md · new L5-6')

      await page.getByRole('button', { name: /^Send feedback/ }).click()
      expect(await cli.exited).toBe(0)
      expect(cli.stdout()).toMatch(/## 1\. Text \(new Lines 5-6 in guide\.md\) \[#[0-9a-f]{8}\]\n```\nline\nsecond\n```\n> Keep it on one line/)
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

test('P switches the current markdown file between Diff and Read, not while a comment is open', async ({ page }) => {
  await withDocs({ before: { 'guide.md': GUIDE_BEFORE }, after: { 'guide.md': GUIDE_AFTER }, explanation: {} }, async ({ dir, explain }) => {
    const cli = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      const card = page.getByRole('region', { name: 'guide.md' })
      const read = card.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Read' })
      await page.getByRole('navigation', { name: 'Changed files' }).getByRole('button', { name: /^guide\.md/ }).click()
      await page.keyboard.press('p')
      await expect(read).toHaveAttribute('aria-pressed', 'true')

      await selectText(page, '.change-read .block-paragraph:visible >> nth=0', 'Intro')
      await expect(page.getByRole('toolbar', { name: 'Selection' })).toBeVisible()
      await page.keyboard.press('p')
      await expect(read).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.press('Escape')
      await expect(page.locator('.annotation-toolbar, .comment-popover')).toHaveCount(0)

      await page.keyboard.press('p')
      await expect(read).toHaveAttribute('aria-pressed', 'false')
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

const STEPS_BEFORE = '# Guide\n\nOne.\n\nTwo.\n\nThree.\n\nFour.\n\nOld step here.\n\nGone block.\n'
const STEPS_AFTER = '# Guide\n\nOne.\n\nTwo.\n\nThree.\n\nFour.\n\nNew step here.\n\nBrand new text.\n'
const STEPS = {
  before: { 'guide.md': STEPS_BEFORE, 'z.md': '# Beta\n\nBeta old.\n' },
  after: { 'guide.md': STEPS_AFTER, 'z.md': '# Beta\n\nBeta new.\n' },
  explanation: { files: { 'guide.md': 'Rewrites a step.', 'z.md': 'Rewrites beta with care.' } }
}

test('the Changes view marks what changed in a markdown file, folds the rest and takes notes on both sides', async ({ page }) => {
  await withDocs(STEPS, async ({ dir, explain }) => {
    const cli = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      await comment(page, '.change-file[data-path="z.md"] .change-why .block-paragraph', 'with care', 'Which care?')
      const card = page.getByRole('region', { name: 'guide.md' })
      const view = card.getByRole('group', { name: 'View' })
      await view.getByRole('button', { name: 'Changes', exact: true }).click()
      await expect(view.getByRole('button', { name: 'Changes', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(card.locator('.block-diff-wrapper').first()).toBeHidden()

      const changed = card.locator('.round-change--changed')
      await expect(changed.locator('.round-change-sign')).toHaveText('±')
      await expect(changed.locator('del')).toContainText('Changed, before: Old step here.')
      await expect(changed.locator('ins')).toContainText('Now: New step here.')
      await expect(card.locator('.round-change--removed del')).toContainText('Removed: Gone block.')
      await expect(card.locator('.round-change--added ins')).toContainText('Added: Brand new text.')

      const fold = card.getByRole('button', { name: '4 unchanged blocks' })
      await expect(fold).toHaveAttribute('aria-expanded', 'false')
      await expect(card.locator('.change-read p', { hasText: 'One.' })).toBeHidden()
      await expect(card.locator('.change-read p', { hasText: 'Four.' })).toBeVisible()
      await fold.click()
      await expect(fold).toHaveAttribute('aria-expanded', 'true')
      await expect(card.locator('.change-read p', { hasText: 'One.' })).toBeVisible()

      // A selection out of view closes its toolbar, so the blocks come into view first.
      await card.locator('.round-change--added').scrollIntoViewIfNeeded()
      await comment(page, '.change-file[data-path="guide.md"] .round-change--removed .block-paragraph', 'Gone', 'Keep this one')
      await comment(page, '.change-file[data-path="guide.md"] .round-change-after .block-paragraph', 'New step', 'Say which step')
      await expect(page.locator('.note-card', { hasText: 'Keep this one' })).toContainText('guide.md · old L13')
      await expect(page.locator('.note-card', { hasText: 'Say which step' })).toContainText('guide.md · new L11')
      await expect(page.locator('.change-file[data-path="z.md"] mark.annotation-highlight')).toHaveText('with care')

      // Read shows the same rendering without the old file, Changes brings its note back.
      await view.getByRole('button', { name: 'Read', exact: true }).click()
      await expect(card.locator('mark.annotation-highlight', { hasText: 'Gone' })).toBeHidden()
      await expect(card.locator('mark.annotation-highlight', { hasText: 'New step' })).toBeVisible()
      await page.locator('.note-card', { hasText: 'Keep this one' }).click()
      await expect(view.getByRole('button', { name: 'Changes', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(card.locator('mark.annotation-highlight', { hasText: 'Gone' })).toBeVisible()

      await page.getByRole('button', { name: /^Send feedback/ }).click()
      expect(await cli.exited).toBe(0)
      expect(cli.stdout()).toMatch(/## \d+\. Text \(old Line 13 in guide\.md\) \[#[0-9a-f]{8}\]\n```\nGone\n```\n> Keep this one/)
      expect(cli.stdout()).toMatch(/## \d+\. Text \(new Line 11 in guide\.md\) \[#[0-9a-f]{8}\]\n```\nNew step\n```\n> Say which step/)
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

/** Selects from `fromText` in one visible paragraph of guide.md to the end of `toText` in another, as a drag across blocks would, and adds a Change note. */
async function commentAcross(page, fromText, toText, note) {
  await page.evaluate(([from, to]) => {
    const visible = [...document.querySelectorAll('.change-file[data-path="guide.md"] .change-read p')].filter((el) => !el.closest('[hidden]') && !el.closest('.visually-hidden'))
    const place = (text) => {
      const el = visible.find((p) => p.textContent.includes(text))
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const index = walker.currentNode.textContent.indexOf(text)
        if (index !== -1) { return { el, node: walker.currentNode, index } }
      }
      throw new Error(`"${text}" not found`)
    }
    const [start, end] = [place(from), place(to)]
    const range = document.createRange()
    range.setStart(start.node, start.index)
    range.setEnd(end.node, end.index + to.length)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)
    end.el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  }, [fromText, toText])
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: /^Comment/ }).click()
  const composer = page.getByRole('dialog', { name: 'Comment on selection' })
  await composer.getByRole('textbox').fill(note)
  await composer.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.note-card', { hasText: note })).toBeVisible()
}

test('a selection across a changed block quotes only what is shown: Read leaves out the old text, Changes the labels', async ({ page }) => {
  for (const [view, quote] of [['Read', 'Four.New step'], ['Changes', 'Four.Old step here.New step']]) {
    await withDocs(STEPS, async ({ dir, explain }) => {
      const cli = startCli(['changes', '--explain', explain], {}, { cwd: dir })
      try {
        await page.goto(await cli.url)
        const card = page.getByRole('region', { name: 'guide.md' })
        await card.getByRole('button', { name: view, exact: true }).click()
        await card.locator('.change-read').getByText('Four.').first().waitFor()
        if (view === 'Changes') { await card.getByRole('button', { name: '4 unchanged blocks' }).click() }
        await card.locator('.change-read').getByText('Brand new text.').scrollIntoViewIfNeeded()
        await commentAcross(page, 'Four.', 'New step', `across in ${view}`)
        await expect(page.locator('.note-card', { hasText: `across in ${view}` })).toContainText('guide.md · new L9')
        await page.getByRole('button', { name: /^Send feedback/ }).click()
        expect(await cli.exited).toBe(0)
        const out = cli.stdout()
        expect(out).toContain(`(new Line 9 in guide.md)`)
        expect(out).toContain(`\`\`\`\n${quote}\n\`\`\``)
        for (const leaked of view === 'Read' ? ['Old step', 'Changed, before', 'Now:', '±'] : ['Changed, before', 'Now:', '±']) { expect(out).not.toContain(leaked) }
      } finally {
        if (cli.child.exitCode === null) { cli.child.kill() }
      }
    })
  }
})

test('P cycles a markdown file through Diff, Read and Changes, and Changes opens the next walkthrough', async ({ page }) => {
  await withDocs(STEPS, async ({ dir, explain }) => {
    const first = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    const button = (name) => page.getByRole('region', { name: 'guide.md' }).getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true })
    try {
      await page.goto(await first.url)
      await page.getByRole('navigation', { name: 'Changed files' }).getByRole('button', { name: /^guide\.md/ }).click()
      for (const name of ['Read', 'Changes', 'Diff', 'Read', 'Changes']) {
        await page.keyboard.press('p')
        await expect(button(name)).toHaveAttribute('aria-pressed', 'true')
      }
      await page.getByRole('button', { name: /^Approve/ }).first().click()
      expect(await first.exited).toBe(0)
    } finally {
      if (first.child.exitCode === null) { first.child.kill() }
    }

    const second = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await second.url)
      await expect(button('Changes')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('region', { name: 'guide.md' }).locator('.round-change--removed')).toContainText('Gone block.')
    } finally {
      if (second.child.exitCode === null) { second.child.kill() }
    }
  })
})

test('the picked view opens the next walkthrough, a deleted or non-markdown file has no switch', async ({ page }) => {
  const files = { before: { 'guide.md': GUIDE_BEFORE, 'old.md': '# Old\n', 'a.js': 'a\n' }, after: { 'guide.md': GUIDE_AFTER, 'old.md': null, 'a.js': 'b\n' }, explanation: {} }
  await withDocs(files, async ({ dir, explain }) => {
    const first = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await first.url)
      await expect(page.getByRole('region', { name: 'old.md' }).getByRole('group', { name: 'View' })).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'a.js' }).getByRole('group', { name: 'View' })).toHaveCount(0)
      await page.getByRole('region', { name: 'guide.md' }).getByRole('button', { name: 'Read' }).click()
      await expect(page.locator('.change-read h1')).toHaveText('Guide')
      await page.getByRole('button', { name: /^Approve/ }).first().click()
      expect(await first.exited).toBe(0)
    } finally {
      if (first.child.exitCode === null) { first.child.kill() }
    }

    const second = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await second.url)
      const card = page.getByRole('region', { name: 'guide.md' })
      await expect(card.getByRole('button', { name: 'Read' })).toHaveAttribute('aria-pressed', 'true')
      await expect(card.locator('.change-read h1')).toHaveText('Guide')
    } finally {
      if (second.child.exitCode === null) { second.child.kill() }
    }
  })
})

test('a Read view opened above another card keeps the highlights of both in place', async ({ page }) => {
  const files = {
    before: { 'a.md': '# Alpha\n\nAlpha old.\n', 'b.md': '# Beta\n\nBeta old.\n' },
    after: { 'a.md': '# Alpha\n\nAlpha paragraph one.\n\nAlpha paragraph two.\n', 'b.md': '# Beta\n\nBeta new.\n' },
    explanation: { files: { 'a.md': 'Rewrites alpha.', 'b.md': 'Rewrites beta with care.' } }
  }
  await withDocs(files, async ({ dir, explain }) => {
    const cli = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      await comment(page, '.change-file[data-path="b.md"] .change-why .block-paragraph', 'with care', 'Which care?')
      await page.getByRole('region', { name: 'a.md' }).getByRole('button', { name: 'Read' }).click()
      await comment(page, '.change-file[data-path="a.md"] .change-read .block-paragraph:visible >> nth=1', 'paragraph two', 'Merge them')

      // Source and back remounts the page, and every highlight is restored from what its note stored.
      await page.getByRole('button', { name: 'Source', exact: true }).click()
      await page.getByRole('button', { name: 'Preview', exact: true }).click()
      await expect(page.locator('.change-file[data-path="b.md"] mark.annotation-highlight')).toHaveText('with care')
      await expect(page.locator('.change-file[data-path="a.md"] mark.annotation-highlight')).toHaveText('paragraph two')
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

const TWO_DOCS = {
  before: { 'a.md': GUIDE_BEFORE, 'b.md': '# Beta\n\nBeta old.\n' },
  after: { 'a.md': GUIDE_AFTER, 'b.md': '# Beta\n\nBeta new.\n' },
  explanation: { files: { 'a.md': 'Splits the line.', 'b.md': 'Rewrites beta with care.' } }
}

/** One walkthrough with a note in a.md's Read view and one on b.md's explanation; returns the drafted notes and the port. */
async function noteInReadAndDiff(page, { dir, explain }) {
  const first = startCli(['changes', '--explain', explain], {}, { cwd: dir })
  const url = await first.url
  try {
    await page.goto(url)
    await page.getByRole('region', { name: 'a.md' }).getByRole('button', { name: 'Read' }).click()
    await comment(page, '.change-file[data-path="a.md"] .change-read .block-paragraph:visible >> nth=1', 'line\nsecond', 'Keep it on one line')
    await comment(page, '.change-file[data-path="b.md"] .change-why .block-paragraph', 'with care', 'Which care?')
    // A walkthrough has no file id, so its draft lives under the content hash only.
    const draft = () => page.evaluate(() => {
      const key = Object.keys(localStorage).find((name) => name.startsWith('md-annotator-draft-'))
      return key ? JSON.parse(localStorage.getItem(key)).annotations : []
    })
    await expect.poll(async () => (await draft()).length).toBe(2)
    return { annotations: await draft(), port: new URL(url).port }
  } finally {
    first.child.kill()
    await first.exited
    // Without the stored pick the file opens on Diff, so nothing has loaded its Read view yet.
    await page.context().clearCookies()
  }
}

/** The notes of noteInReadAndDiff are placed: a.md's in its Read view once its card opens it, b.md's on its text. */
async function expectPlaced(page) {
  await expect(page.locator('.note-card', { hasText: 'Keep it on one line' })).toContainText('a.md · new L5-6')
  await expect(page.locator('.note-tag')).toHaveCount(0)
  await expect(page.locator('.change-file[data-path="b.md"] mark.annotation-highlight')).toHaveText('with care')
  await page.locator('.note-card', { hasText: 'Keep it on one line' }).click()
  await expect(page.getByRole('region', { name: 'a.md' }).getByRole('button', { name: 'Read' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.change-file[data-path="a.md"] mark.annotation-highlight')).toHaveText('line\nsecond')
}

test('a draft with a note in a Read view loads that view before its notes are placed', async ({ page }) => {
  await withDocs(TWO_DOCS, async (repo) => {
    const { port } = await noteInReadAndDiff(page, repo)
    const second = startCli(['changes', '--explain', repo.explain], { ANNOTAITR_PORT: port }, { cwd: repo.dir })
    try {
      await page.goto(await second.url)
      await expect(page.getByRole('region', { name: 'a.md' }).getByRole('button', { name: 'Diff' })).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: 'Restore' }).click()
      await expectPlaced(page)
      await page.getByRole('button', { name: /^Send feedback/ }).click()
      expect(await second.exited).toBe(0)
      expect(second.stdout()).toMatch(/Text \(new Lines 5-6 in a\.md\)/)
    } finally {
      if (second.child.exitCode === null) { second.child.kill() }
    }
  })
})

test('imported notes in a Read view wait for that view before they are placed', async ({ page }) => {
  await withDocs(TWO_DOCS, async (repo) => {
    const { annotations } = await noteInReadAndDiff(page, repo)
    const second = startCli(['changes', '--explain', repo.explain], {}, { cwd: repo.dir })
    try {
      await page.goto(await second.url)
      await expect(page.getByRole('region', { name: 'a.md' }).getByRole('button', { name: 'Diff' })).toHaveAttribute('aria-pressed', 'true')
      await page.locator('input[type="file"][accept=".json"]').setInputFiles({
        name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, annotations }))
      })
      await expectPlaced(page)
    } finally {
      if (second.child.exitCode === null) { second.child.kill() }
    }
  })
})

test('a file that cannot be loaded stays on Diff, says so and does not become the default', async ({ page }) => {
  await withDocs({ before: { 'guide.md': GUIDE_BEFORE }, after: { 'guide.md': GUIDE_AFTER }, explanation: {} }, async ({ dir, explain }) => {
    const first = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.route('**/api/changes/full?*', (route) => route.fulfill({ status: 404, json: { success: false, error: 'Not found' } }))
      await page.goto(await first.url)
      const card = page.getByRole('region', { name: 'guide.md' })
      await card.getByRole('button', { name: 'Read' }).click()
      await expect(card.getByRole('status')).toHaveText('The whole file is not available. The diff stays.')
      await expect(card.getByRole('button', { name: 'Diff' })).toHaveAttribute('aria-pressed', 'true')
      await expect(card.locator('.block-diff-wrapper').first()).toBeVisible()
      await page.getByRole('button', { name: /^Approve/ }).first().click()
      expect(await first.exited).toBe(0)
    } finally {
      if (first.child.exitCode === null) { first.child.kill() }
      await page.unroute('**/api/changes/full?*')
    }

    const second = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await second.url)
      await expect(page.getByRole('region', { name: 'guide.md' }).getByRole('button', { name: 'Diff' })).toHaveAttribute('aria-pressed', 'true')
    } finally {
      second.child.kill()
    }
  })
})

test('a note on the hunks of a card on Read or Whole file is shown from the panel', async ({ page }) => {
  await withDocs({ before: { 'guide.md': GUIDE_BEFORE }, after: { 'guide.md': GUIDE_AFTER }, explanation: {} }, async ({ dir, explain }) => {
    const cli = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      const card = page.getByRole('region', { name: 'guide.md' })
      await comment(page, '.change-file[data-path="guide.md"] .block-diff-wrapper', 'second line', 'Why split?')
      const mark = card.locator('.block-diff-wrapper mark.annotation-highlight')

      await card.getByRole('button', { name: 'Read' }).click()
      await expect(mark).toBeHidden()
      await page.locator('.note-card', { hasText: 'Why split?' }).click()
      await expect(card.getByRole('button', { name: 'Diff' })).toHaveAttribute('aria-pressed', 'true')
      await expect(mark).toBeVisible()

      await card.getByRole('button', { name: 'Whole file' }).click()
      await expect(mark).toBeHidden()
      await page.locator('.note-card', { hasText: 'Why split?' }).click()
      await expect(card.getByRole('button', { name: 'Whole file' })).toHaveAttribute('aria-pressed', 'false')
      await expect(mark).toBeVisible()
    } finally {
      cli.child.kill()
    }
  })
})

test('P, J and K leave the walkthrough alone while a dialog or menu is open', async ({ page }) => {
  await withDocs({ before: { 'guide.md': GUIDE_BEFORE }, after: { 'guide.md': GUIDE_AFTER }, explanation: {} }, async ({ dir, explain }) => {
    const cli = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      const read = page.getByRole('region', { name: 'guide.md' }).getByRole('button', { name: 'Read' })
      const tree = page.getByRole('navigation', { name: 'Changed files' })
      await tree.getByRole('button', { name: /^guide\.md/ }).click()
      for (const [opener, open] of [['Settings', page.getByRole('dialog', { name: 'Settings' })], ['More actions', page.getByRole('menu')]]) {
        await page.getByRole('button', { name: opener, exact: true }).click()
        await expect(open).toBeVisible()
        await page.keyboard.press('p')
        await page.keyboard.press('k')
        await expect(read).toHaveAttribute('aria-pressed', 'false')
        await page.keyboard.press('Escape')
        await expect(open).toBeHidden()
      }
      // K was ignored too: guide.md is still the current file.
      await page.keyboard.press('p')
      await expect(read).toHaveAttribute('aria-pressed', 'true')
    } finally {
      cli.child.kill()
    }
  })
})

test('a link to a file in a Read view offers no Open, a web link still does', async ({ page }) => {
  const after = { 'docs/guide.md': '# Guide\n\nSee [the setup](setup.md) or [the site](https://example.com).\n' }
  await withDocs({ before: { 'docs/guide.md': '# Guide\n' }, after, explanation: {} }, async ({ dir, explain }) => {
    const cli = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      await page.getByRole('region', { name: 'docs/guide.md' }).getByRole('button', { name: 'Read' }).click()
      const bar = page.getByRole('toolbar', { name: 'Selection' })
      await page.locator('.change-read a', { hasText: 'the setup' }).click()
      await expect(bar).toBeVisible()
      await expect(bar.getByRole('button', { name: /^Open/ })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await page.locator('.change-read a', { hasText: 'the site' }).click()
      await expect(bar.getByRole('button', { name: /^Open/ })).toHaveCount(1)
    } finally {
      cli.child.kill()
    }
  })
})

test('a note in the Read view of a file whose name holds a quote or a backslash keeps its highlight', async ({ page }) => {
  const names = ['say "hi".md', 'back\\slash.md']
  const before = Object.fromEntries(names.map((name) => [name, '# Doc\n']))
  const after = Object.fromEntries(names.map((name) => [name, '# Doc\n\nFresh words here.\n']))
  await withDocs({ before, after, explanation: {} }, async ({ dir, explain }) => {
    const cli = startCli(['changes', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      for (const name of names) {
        const card = page.getByRole('region', { name, exact: true })
        await card.getByRole('button', { name: 'Read' }).click()
        await expect(card.locator('.change-read h1')).toHaveText('Doc')
        // The selection bar closes itself over text that is out of view.
        await card.locator('.change-read .block-paragraph:visible').scrollIntoViewIfNeeded()
        await selectText(page, `.change-file[data-path="${name.replace(/["\\]/g, '\\$&')}"] .change-read .block-paragraph:visible`, 'Fresh')
        await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: /^Comment/ }).click()
        const composer = page.getByRole('dialog', { name: 'Comment on selection' })
        await composer.getByRole('textbox').fill(`Note on ${name}`)
        await composer.getByRole('button', { name: 'Add', exact: true }).click()
        await expect(card.locator('.change-read mark.annotation-highlight')).toHaveText('Fresh')
      }
      await page.getByRole('button', { name: 'Source', exact: true }).click()
      await page.getByRole('button', { name: 'Preview', exact: true }).click()
      await expect(page.locator('.change-read mark.annotation-highlight')).toHaveCount(2)
      await page.locator('.note-card', { hasText: 'Note on say "hi".md' }).click()
      await page.getByRole('button', { name: /^Send feedback/ }).click()
      expect(await cli.exited).toBe(0)
      expect(cli.stdout()).toContain('(new Line 3 in say "hi".md)')
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

test('every file of the repository can be read next to the changes, except the ones it does not read', async ({ page }) => {
  await withRepo(async ({ dir, explain }) => {
    await writeFile(join(dir, '.env.local'), 'TOKEN=abc\n')
    const cli = startCli(['changes', '--origin', 'claude-code', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      await page.getByRole('button', { name: 'All files' }).click()
      const tree = page.getByRole('navigation', { name: 'All files' })
      await expect(tree.getByRole('button', { name: 'cache.js' })).toBeVisible()

      await tree.getByRole('button', { name: 'guide.md' }).click()
      const file = page.getByRole('region', { name: 'docs/guide.md' })
      await expect(file).toContainText('Stays as it is.')
      await expect(file.getByRole('rowheader', { name: '2' })).toBeVisible()
      await expect(file).toBeFocused()
      await expect(page.getByRole('region', { name: 'Overview' })).toBeHidden()

      await tree.getByRole('button', { name: /^\.env\.local, not shown: possible secret/ }).click()
      await expect(page.getByRole('region', { name: '.env.local' })).toContainText('This file is not shown: possible secret.')
      await expect(page.locator('body')).not.toContainText('TOKEN=abc')

      await page.getByRole('button', { name: 'Back to changes' }).click()
      await expect(page.locator('.repo-file')).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible()

      await page.getByRole('group', { name: 'Files to show' }).getByRole('button', { name: 'Changes' }).click()
      await expect(page.getByRole('navigation', { name: 'Changed files' })).toBeVisible()
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

test('a file of the repository gives way to the walkthrough on K at the start of the list and on picking a note', async ({ page }) => {
  await withRepo(async ({ dir, explain }) => {
    const cli = startCli(['changes', '--origin', 'claude-code', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      await page.getByRole('button', { name: 'All files' }).click()
      const tree = page.getByRole('navigation', { name: 'All files' })

      // The overview is current, so K selects it again: the file view must still close.
      await tree.getByRole('button', { name: 'guide.md' }).click()
      await expect(page.locator('.repo-file')).toHaveCount(1)
      await page.locator('body').press('k')
      await expect(page.locator('.repo-file')).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible()

      // A note made on the walkthrough leads back to it from the file view.
      const added = page.getByRole('region', { name: 'cache.js' }).locator('.diff-add').first()
      await added.scrollIntoViewIfNeeded()
      const rect = await added.boundingBox()
      await page.mouse.move(rect.x + 90, rect.y + rect.height / 2)
      await page.mouse.down()
      await page.mouse.move(rect.x + 200, rect.y + rect.height / 2, { steps: 4 })
      await page.mouse.up()
      await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Comment' }).click()
      await page.getByRole('dialog', { name: 'Comment on selection' }).getByRole('textbox', { name: 'Comment on selection' }).fill('Rename this')
      await page.keyboard.press('ControlOrMeta+Enter')
      await expect(page.locator('.note-card', { hasText: 'Rename this' })).toBeVisible()

      await tree.getByRole('button', { name: 'guide.md' }).click()
      await expect(page.locator('.repo-file')).toHaveCount(1)
      await page.locator('.note-card', { hasText: 'Rename this' }).click()
      await expect(page.locator('.repo-file')).toHaveCount(0)
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})

test('a path:line in the explanation shows the code around it on hover and on keyboard focus', async ({ page }) => {
  await withRepo(async ({ dir, explain }) => {
    const cli = startCli(['changes', '--origin', 'claude-code', '--explain', explain], {}, { cwd: dir })
    try {
      await page.goto(await cli.url)
      const overview = page.getByRole('region', { name: 'Overview' })
      const reference = overview.getByRole('button', { name: 'cache.js:1' })

      await reference.hover()
      const card = page.getByRole('tooltip')
      await expect(card).toContainText('cache.js:1')
      await expect(card).toContainText('const key = `${page}_${workspace}`')
      await expect(card).toContainText('export default key')
      // Outside every file card, which would clip it.
      await expect(page.locator('body > .file-line-ref-card')).toHaveCount(1)
      const placed = await card.boundingBox()
      const anchor = await reference.boundingBox()
      expect(placed.y).toBeGreaterThanOrEqual(anchor.y + anchor.height - 1)
      expect(placed.x).toBeGreaterThanOrEqual(0)

      await card.hover()
      await page.waitForTimeout(300)
      await expect(card).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('tooltip')).toHaveCount(0)

      await page.mouse.move(0, 0)
      await reference.focus()
      await expect(page.getByRole('tooltip')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('tooltip')).toHaveCount(0)

      await reference.click()
      await expect(page.getByRole('region', { name: 'cache.js' })).toBeFocused()
      // The card of the clicked reference closes on its own time, a second one must not be read as it.
      await expect(page.getByRole('tooltip')).toHaveCount(0)

      await overview.getByRole('button', { name: 'notes.md:9' }).hover()
      await expect(page.getByRole('tooltip')).toContainText('Line 9 is not part of the diff')
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  }, { summary: 'The key is built in cache.js:1, see also notes.md:9.' })
})
