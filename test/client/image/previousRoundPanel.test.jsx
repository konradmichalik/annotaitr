import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PreviousRoundPanel from '../../../client/image/src/threads/PreviousRoundPanel.jsx'

const entry = (replies) => ({
  handle: 'a3f19c2e', number: 1, anchor: 'exact', reason: null, element: null,
  annotation: { type: 'box', text: 'Fix' }, replies
})
const render = (replies) => renderToStaticMarkup(
  <PreviousRoundPanel round={1} threads={[entry(replies)]} showOnImage onToggleShowOnImage={() => {}} onShow={() => {}} />
)

describe('PreviousRoundPanel', () => {
  it('labels a reviewer last reply with the reviewer, not the agent', () => {
    const html = render([{ author: 'agent', status: 'question', text: '?' }, { author: 'human', text: 'Green' }])
    expect(html).toContain('You: Green')
    expect(html).not.toContain('Agent: Green')
  })

  it('labels an agent last reply with the agent', () => {
    expect(render([{ author: 'agent', status: 'applied', text: 'Done' }])).toContain('Agent: Done')
  })

  it('numbers a carried thread with its origin round', () => {
    const carried = { ...entry([]), number: null, origin: { round: 1, number: 2 } }
    const html = renderToStaticMarkup(
      <PreviousRoundPanel round={2} threads={[carried]} showOnImage onToggleShowOnImage={() => {}} onShow={() => {}} />
    )
    expect(html).toContain('>1·2<')
    expect(html).toContain('Round 1 · note 2.')
  })
})
