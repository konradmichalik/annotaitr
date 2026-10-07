// test/e2e/markdown.spec.js
// Markdown mode details: the insertion point and the files overview.
import { writeFile, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { startCli } from '../helpers/cli.js'

async function withFiles(files, run) {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-md-'))
  const paths = []
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name)
    await writeFile(path, content)
    paths.push(path)
  }
  try {
    await run(paths)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('Alt+click opens the insertion bar and its composer at the insertion point', async ({ page }) => {
  await withFiles({ 'notes.md': '# Notes\n\nA paragraph to review.\n' }, async (paths) => {
    const cli = startCli(paths)
    try {
      await page.goto(await cli.url)
      const paragraph = page.getByText('A paragraph to review.')
      const rect = await paragraph.boundingBox()
      await page.keyboard.down('Alt')
      const clickX = rect.x + 60
      await page.mouse.click(clickX, rect.y + rect.height / 2)
      await page.keyboard.up('Alt')

      const bar = page.getByRole('toolbar', { name: 'Selection' })
      const barBox = await bar.boundingBox()
      expect(Math.abs(barBox.y + barBox.height - rect.y)).toBeLessThan(60)
      expect(Math.abs(barBox.x + barBox.width / 2 - clickX)).toBeLessThan(20)

      await bar.getByRole('button', { name: 'Add' }).click()
      const composer = page.getByRole('dialog', { name: 'Text to insert' })
      const composerBox = await composer.boundingBox()
      expect(composerBox.y).toBeGreaterThan(rect.y)
      expect(composerBox.y).toBeLessThan(rect.y + rect.height + 60)
    } finally {
      if (cli.child.exitCode === null) { cli.child.kill() }
    }
  })
})
