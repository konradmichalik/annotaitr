// test/e2e/changes.spec.js
// `annotaitr changes`: the walkthrough of a repository's uncommitted changes, laid out like a pull request.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

      await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Change' }).click()
      const field = page.getByRole('dialog', { name: 'Comment on selection' }).getByRole('textbox', { name: 'Comment on selection' })
      await field.fill('Use the language too')
      await page.keyboard.press('ControlOrMeta+Enter')
      await expect(tree.getByRole('button', { name: /^cache\.js, 1 note/ })).toBeVisible()

      await page.getByRole('button', { name: /^Send feedback/ }).click()
      expect(await cli.exited).toBe(0)
      expect(cli.stdout()).toMatch(/## 1\. Change · Text \(new Line 1 in cache\.js\) \[#[0-9a-f]{8}\]/)
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

/** A repository whose committed `before` files turn into `after` (null deletes one), with an explanation. */
async function withDocs({ before, after, explanation }, run) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'annotaitr-read-e2e-')))
  const explain = join(dir, '.git', 'explain.json')
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: gitEnv })
  try {
    git('init', '-q', '-b', 'main')
    for (const [path, text] of Object.entries(before)) { await writeFile(join(dir, path), text) }
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
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: /^Change/ }).click()
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

      await comment(page, '.change-read .block-paragraph >> nth=1', 'line\nsecond', 'Keep it on one line')
      const tree = page.getByRole('navigation', { name: 'Changed files' })
      await expect(tree.getByRole('button', { name: /^guide\.md, 1 note/ })).toBeVisible()
      await expect(page.locator('.note-card', { hasText: 'Keep it on one line' })).toContainText('guide.md · new L5-6')

      await page.getByRole('button', { name: /^Send feedback/ }).click()
      expect(await cli.exited).toBe(0)
      expect(cli.stdout()).toMatch(/## 1\. Change · Text \(new Lines 5-6 in guide\.md\) \[#[0-9a-f]{8}\]\n```\nline\nsecond\n```\n> Keep it on one line/)
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

      await selectText(page, '.change-read .block-paragraph >> nth=0', 'Intro')
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
      await comment(page, '.change-file[data-path="a.md"] .change-read .block-paragraph >> nth=1', 'paragraph two', 'Merge them')

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
    await comment(page, '.change-file[data-path="a.md"] .change-read .block-paragraph >> nth=1', 'line\nsecond', 'Keep it on one line')
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
