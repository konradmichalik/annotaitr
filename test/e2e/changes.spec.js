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
