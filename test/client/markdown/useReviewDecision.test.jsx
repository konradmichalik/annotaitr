// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useReviewDecision } from '../../../client/markdown/src/hooks/useReviewDecision.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const latest = {}
let host
let root
let fetchMock

function Harness(props) {
  Object.assign(latest, useReviewDecision(props))
  return null
}

const file = (annotations = []) => ({ path: 'a.md', blocks: [], annState: { annotations } })
const question = { handle: 'a3f19c2e', annotation: { text: 'Shorter' }, replies: [{ author: 'agent', status: 'question', text: 'How short?' }] }

function render(extra = {}) {
  const props = { files: [file()], activeFileIndex: 0, annDispatch: () => {}, setErrorStatus: () => {}, ...extra }
  act(() => root.render(<Harness {...props} />))
}

const posted = () => fetchMock.mock.calls.map(([url, init]) => [url, JSON.parse(init.body)])

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true }))
  vi.stubGlobal('fetch', fetchMock)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('useReviewDecision', () => {
  it('opens the dialog instead of deciding while the agent waits for an answer', () => {
    const openDialog = vi.fn()
    render({ unanswered: [question], openDialog })
    act(() => latest.decidePrimary('feedback'))
    expect(openDialog).toHaveBeenCalledWith('feedback')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('decides right away when no question is open', async () => {
    const openDialog = vi.fn()
    render({ openDialog })
    await act(async () => latest.decidePrimary('approve'))
    expect(openDialog).not.toHaveBeenCalled()
    expect(posted()).toEqual([['/api/approve', {}]])
  })

  it('sends replies without notes as feedback and counts them for the done page', async () => {
    render({ replyCount: 2 })
    await act(async () => latest.finish({ choice: 'feedback' }))
    expect(posted()).toEqual([['/api/feedback', { files: [{ path: 'a.md', annotations: [], blocks: [] }] }]])
    expect(latest.decision).toBe('feedback')
    expect(latest.sentReplyCount).toBe(2)
  })
})
