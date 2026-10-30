// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InlineMarkdown } from '../../../client/markdown/src/components/Viewer/InlineMarkdown.jsx'
import { FileRefsContext } from '../../../client/markdown/src/components/Viewer/fileRefsContext.js'
import { createFileLineRefFinder } from '../../../client/markdown/src/utils/fileLineRefs.js'

const refs = { find: createFileLineRefFinder(new Set(['src/Cache.php'])), diffOf: () => '', jump: () => {} }
const render = (text, value = refs) => renderToStaticMarkup(
  <FileRefsContext.Provider value={value}><InlineMarkdown text={text} /></FileRefsContext.Provider>
)

describe('a path:line in the agent text', () => {
  it('becomes one button, with the text around it untouched', () => {
    const html = render('The key in src/Cache.php:42 is now per workspace.')
    expect(html).toContain('The key in ')
    expect(html).toContain('>src/Cache.php:42</button>')
    expect(html).toContain(' is now per workspace.')
    expect(html).toContain('type="button"')
  })

  it('keeps a range as one button', () => {
    expect(render('See src/Cache.php:42-48.')).toContain('>src/Cache.php:42-48</button>')
  })

  it('also becomes a button when it is written as inline code', () => {
    const html = render('Look at `src/Cache.php:42` first.')
    expect(html).toMatch(/<button[^>]*class="file-line-ref-link inline-code"[^>]*>src\/Cache\.php:42<\/button>/)
    expect(html).not.toContain('<code')
  })

  it('leaves inline code with more than the reference alone', () => {
    const html = render('Run `git blame src/Cache.php:42` to see.')
    expect(html).not.toContain('<button')
    expect(html).toContain('git blame src/Cache.php:42')
  })

  it('finds several references in one text', () => {
    const html = render('src/Cache.php:3 and src/Cache.php:9')
    expect(html.match(/<button/g)).toHaveLength(2)
  })

  it('stays text for a file that is not part of the walkthrough', () => {
    expect(render('src/Other.php:42 changed')).not.toContain('<button')
  })

  it('stays text inside a link, which a button would turn into two controls', () => {
    const html = render('See [the key in src/Cache.php:42](https://example.com) now.')
    expect(html).toContain('<a ')
    expect(html).not.toContain('<button')
    expect(html).toContain('src/Cache.php:42')
  })

  it('stays text without a changes view around it', () => {
    const html = renderToStaticMarkup(<InlineMarkdown text="The key in src/Cache.php:42 is now per workspace." />)
    expect(html).not.toContain('<button')
    expect(html).toContain('src/Cache.php')
  })
})
