import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('claude-code plugin manifest', () => {
  it('is valid JSON with the required fields', () => {
    const raw = readFileSync('apps/claude-code/.claude-plugin/plugin.json', 'utf-8')
    const manifest = JSON.parse(raw)
    expect(manifest.name).toBe('annotaitr')
    expect(manifest.commands).toBe('./commands/')
    expect(typeof manifest.description).toBe('string')
  })

  it('exposes /annotaitr:md, /annotaitr:image and /annotaitr:review, all shelling out to annotaitr', () => {
    for (const command of ['md', 'image', 'review']) {
      const content = readFileSync(`apps/claude-code/commands/${command}.md`, 'utf-8')
      expect(content).toContain('annotaitr --origin claude-code')
    }
  })

  it('keeps zsh from rejecting a pasted [Image #N] chip in /annotaitr:image and /annotaitr:review', () => {
    for (const command of ['image', 'review']) {
      const content = readFileSync(`apps/claude-code/commands/${command}.md`, 'utf-8')
      expect(content).toContain('!`setopt no_bad_pattern no_nomatch 2>/dev/null; annotaitr --origin claude-code $ARGUMENTS`')
    }
  })
})

describe('marketplace manifest', () => {
  it('lists the plugin at the path the plugin manifest lives in', () => {
    const marketplace = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf-8'))
    expect(marketplace.name).toBe('annotaitr')
    expect(marketplace.plugins).toHaveLength(1)
    expect(marketplace.plugins[0].name).toBe('annotaitr')
    expect(marketplace.plugins[0].source).toBe('./apps/claude-code')
  })
})

describe('codex skill', () => {
  const content = readFileSync('apps/codex/skills/annotaitr/SKILL.md', 'utf-8')

  it('declares the skill name and a description in its frontmatter', () => {
    expect(content).toMatch(/^---\nname: annotaitr\ndescription: .+\n---\n/)
  })

  it('shells out to annotaitr with the codex origin', () => {
    expect(content).toContain('annotaitr --origin codex')
    expect(content).not.toContain('--origin claude-code')
  })
})
