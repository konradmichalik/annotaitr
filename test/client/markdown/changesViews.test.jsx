// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useChangesReview } from '../../../client/markdown/src/hooks/useChangesReview.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const latest = {}
let root = null
let container = null

function Harness(props) {
  latest.review = useChangesReview(props)
  return null
}

function render(props) {
  container = document.createElement('div')
  root = createRoot(container)
  act(() => root.render(<Harness {...props} />))
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
})

describe('useChangesReview views', () => {
  it('starts with no file set by hand and the stored default', () => {
    render({ defaultView: 'read' })
    expect([...latest.review.views]).toEqual([])
    expect(latest.review.defaultView).toBe('read')
  })

  it('sets the view of one file and stores the pick as the default', () => {
    const picks = []
    render({ defaultView: 'diff', onPickView: (view) => picks.push(view) })
    const before = latest.review.views
    act(() => latest.review.setView('docs/usage.md', 'read'))
    expect([...latest.review.views]).toEqual([['docs/usage.md', 'read']])
    expect(before.size).toBe(0)
    expect(picks).toEqual(['read'])
  })

  it('can open a view without storing it as the default', () => {
    const picks = []
    render({ defaultView: 'diff', onPickView: (view) => picks.push(view) })
    act(() => latest.review.setView('a.md', 'read', false))
    expect(latest.review.views.get('a.md')).toBe('read')
    expect(picks).toEqual([])
  })

  it('keeps the default it started with for the rest of the walkthrough', () => {
    render({ defaultView: 'diff', onPickView: () => {} })
    act(() => latest.review.setView('a.md', 'read'))
    expect(latest.review.defaultView).toBe('diff')
  })
})
