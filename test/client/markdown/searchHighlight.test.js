// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { highlightMatches, setActiveMatch, clearSearchHighlights } from '../../../client/markdown/src/utils/searchHighlight.js'

function createContainer(html) {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

describe('highlightMatches on invisible text', () => {
  it('skips text inside a hidden element and a visually hidden label', () => {
    const container = createContainer('<p>word</p><div hidden><p>word</p></div><span class="visually-hidden">word </span><p>word</p>')
    expect(highlightMatches(container, 'word')).toHaveLength(2)
  })
})

describe('highlightMatches', () => {
  it('finds a single match in a text node', () => {
    const container = createContainer('<p>Hello world</p>')
    const marks = highlightMatches(container, 'world')

    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('world')
    expect(marks[0].className).toBe('search-match')
    expect(container.querySelector('p').textContent).toBe('Hello world')
  })

  it('finds multiple matches across text nodes', () => {
    const container = createContainer('<p>foo bar</p><p>foo baz foo</p>')
    const marks = highlightMatches(container, 'foo')

    expect(marks).toHaveLength(3)
    marks.forEach(m => expect(m.textContent).toBe('foo'))
  })

  it('is case-insensitive', () => {
    const container = createContainer('<p>Hello HELLO hello</p>')
    const marks = highlightMatches(container, 'hello')

    expect(marks).toHaveLength(3)
    // Preserves original casing
    expect(marks[0].textContent).toBe('Hello')
    expect(marks[1].textContent).toBe('HELLO')
    expect(marks[2].textContent).toBe('hello')
  })

  it('skips text nodes inside <mark> elements', () => {
    const container = createContainer('<p>before <mark>inside mark</mark> after</p>')
    const marks = highlightMatches(container, 'mark')

    // Should not match "mark" inside the existing <mark> — only in "after" if present
    // "mark" does not appear in "before" or "after", so 0 matches
    expect(marks).toHaveLength(0)
  })

  it('returns empty array for empty query', () => {
    const container = createContainer('<p>Hello</p>')
    expect(highlightMatches(container, '')).toHaveLength(0)
  })

  it('returns empty array for null query', () => {
    const container = createContainer('<p>Hello</p>')
    expect(highlightMatches(container, null)).toHaveLength(0)
  })

  it('returns empty array when no matches found', () => {
    const container = createContainer('<p>Hello world</p>')
    expect(highlightMatches(container, 'xyz')).toHaveLength(0)
  })

  it('returns empty array for null container', () => {
    expect(highlightMatches(null, 'test')).toHaveLength(0)
  })

  it('does not disturb [data-highlight-id] spans', () => {
    const container = createContainer(
      '<p><span data-highlight-id="abc">annotated text</span> normal text</p>'
    )
    const marks = highlightMatches(container, 'text')

    expect(marks).toHaveLength(2)
    // The annotation span should still be present
    expect(container.querySelector('[data-highlight-id="abc"]')).not.toBeNull()
  })

  it('skips text nodes inside SVG elements', () => {
    const container = createContainer('<p>api call</p><svg><text>api endpoint</text></svg>')
    const marks = highlightMatches(container, 'api')

    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('api')
  })

  it('skips text nodes inside .diagram-render-area', () => {
    const container = createContainer(
      '<p>api usage</p><div class="diagram-render-area"><span>api flow</span></div>'
    )
    const marks = highlightMatches(container, 'api')

    expect(marks).toHaveLength(1)
  })

  it('skips text nodes inside .source-line-number', () => {
    const container = createContainer(
      '<table><tr><td class="source-line-number">1</td><td>line 1 content</td></tr></table>'
    )
    const marks = highlightMatches(container, '1')

    expect(marks).toHaveLength(1)
    expect(marks[0].closest('.source-line-number')).toBeNull()
  })

  it('skips text nodes inside .diagram-source', () => {
    const container = createContainer(
      '<p>api call</p><pre class="diagram-source">api definition</pre>'
    )
    const marks = highlightMatches(container, 'api')

    expect(marks).toHaveLength(1)
  })

  it('handles multiple matches within a single text node', () => {
    const container = createContainer('<p>abcabc</p>')
    const marks = highlightMatches(container, 'abc')

    expect(marks).toHaveLength(2)
  })
})

describe('setActiveMatch', () => {
  it('sets active class on the correct match', () => {
    const container = createContainer('<p>foo foo foo</p>')
    const marks = highlightMatches(container, 'foo')

    marks.forEach(m => { m.scrollIntoView = vi.fn() })
    setActiveMatch(marks, 1)

    expect(marks[0].classList.contains('search-match-active')).toBe(false)
    expect(marks[1].classList.contains('search-match-active')).toBe(true)
    expect(marks[2].classList.contains('search-match-active')).toBe(false)
    expect(marks[1].scrollIntoView).toHaveBeenCalled()
  })

  it('removes previous active class when changing active index', () => {
    const container = createContainer('<p>foo foo</p>')
    const marks = highlightMatches(container, 'foo')
    marks.forEach(m => { m.scrollIntoView = vi.fn() })

    setActiveMatch(marks, 0)
    expect(marks[0].classList.contains('search-match-active')).toBe(true)

    setActiveMatch(marks, 1)
    expect(marks[0].classList.contains('search-match-active')).toBe(false)
    expect(marks[1].classList.contains('search-match-active')).toBe(true)
  })

  it('handles empty matches array', () => {
    expect(() => setActiveMatch([], 0)).not.toThrow()
  })
})

describe('clearSearchHighlights', () => {
  it('removes all search marks and restores text', () => {
    const container = createContainer('<p>Hello world</p>')
    highlightMatches(container, 'world')

    expect(container.querySelectorAll('mark.search-match')).toHaveLength(1)

    clearSearchHighlights(container)

    expect(container.querySelectorAll('mark')).toHaveLength(0)
    expect(container.querySelector('p').textContent).toBe('Hello world')
  })

  it('normalizes text nodes after cleanup', () => {
    const container = createContainer('<p>Hello world here</p>')
    highlightMatches(container, 'world')
    clearSearchHighlights(container)

    // After normalize, should have a single text node
    const p = container.querySelector('p')
    expect(p.childNodes).toHaveLength(1)
    expect(p.childNodes[0].nodeType).toBe(Node.TEXT_NODE)
  })

  it('preserves [data-highlight-id] spans', () => {
    const container = createContainer(
      '<p><span data-highlight-id="abc">annotated</span> normal</p>'
    )
    highlightMatches(container, 'normal')
    clearSearchHighlights(container)

    expect(container.querySelector('[data-highlight-id="abc"]')).not.toBeNull()
    expect(container.querySelector('[data-highlight-id="abc"]').textContent).toBe('annotated')
  })

  it('handles null container', () => {
    expect(() => clearSearchHighlights(null)).not.toThrow()
  })

  it('handles container with no search marks', () => {
    const container = createContainer('<p>Hello world</p>')
    expect(() => clearSearchHighlights(container)).not.toThrow()
    expect(container.querySelector('p').textContent).toBe('Hello world')
  })
})
