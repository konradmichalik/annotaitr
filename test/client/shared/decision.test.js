import { describe, it, expect } from 'vitest'
import {
  plural, primaryAction, defaultChoice, decisionOptions, submitLabel, needsDiscardConfirm, describeBreakdown, applySummary
} from '../../../client/shared/utils/decision.js'

describe('plural', () => {
  it('picks the singular for one and the plural otherwise', () => {
    expect(plural(1, 'note')).toBe('1 note')
    expect(plural(0, 'note')).toBe('0 notes')
    expect(plural(2, 'reply', 'replies')).toBe('2 replies')
  })
})

describe('primaryAction', () => {
  it('approves while nothing would be sent', () => {
    expect(primaryAction(0)).toEqual({ choice: 'approve', label: 'Approve', count: 0 })
  })

  it('sends feedback with the count once notes or replies exist', () => {
    expect(primaryAction(3)).toEqual({ choice: 'feedback', label: 'Send feedback', count: 3 })
  })
})

describe('defaultChoice', () => {
  it('follows the same state as the main button', () => {
    expect(defaultChoice({ notes: 0, replies: 0 })).toBe('approve')
    expect(defaultChoice({ notes: 2, replies: 0 })).toBe('feedback')
    expect(defaultChoice({ notes: 0, replies: 1 })).toBe('feedback')
  })
})

describe('decisionOptions', () => {
  it('offers the three decisions with one sentence each', () => {
    const options = decisionOptions({ notes: 4, replies: 0, breakdown: '1 change, 3 questions' })
    expect(options.map((o) => o.label)).toEqual(['Send feedback', 'Approve with notes', 'Approve'])
    expect(options[0].description).toBe('Apply 4 notes. 1 change, 3 questions.')
    expect(options[1].description).toBe('Ship as is. The notes are context, not change requests.')
    expect(options[2].description).toBe('Discard the notes and approve without changes.')
    expect(options.every((o) => !o.disabled)).toBe(true)
  })

  it('only offers Approve when there is nothing to send', () => {
    const options = decisionOptions({ notes: 0, replies: 0, breakdown: '' })
    expect(options.map((o) => o.disabled)).toEqual([true, true, false])
    expect(options[2].description).toBe('Approve without changes.')
  })

  it('describes a round that only carries replies', () => {
    const options = decisionOptions({ notes: 0, replies: 2, breakdown: '' })
    expect(options[0].description).toBe('Send 2 replies, no new notes.')
    expect(options[2].description).toBe('Approve without changes. Your replies still go out.')
    expect(options.every((o) => !o.disabled)).toBe(true)
  })
})

describe('submitLabel', () => {
  it('states the action', () => {
    expect(submitLabel('feedback', { notes: 4, replies: 2 })).toBe('Send 4 notes')
    expect(submitLabel('feedback', { notes: 1, replies: 0 })).toBe('Send 1 note')
    expect(submitLabel('feedback', { notes: 0, replies: 1 })).toBe('Send 1 reply')
    expect(submitLabel('approve-notes', { notes: 2, replies: 0 })).toBe('Approve with notes')
    expect(submitLabel('approve', { notes: 2, replies: 0 })).toBe('Approve')
  })
})

describe('needsDiscardConfirm', () => {
  it('asks only before Approve discards notes', () => {
    expect(needsDiscardConfirm('approve', 2)).toBe(true)
    expect(needsDiscardConfirm('approve', 0)).toBe(false)
    expect(needsDiscardConfirm('approve-notes', 2)).toBe(false)
    expect(needsDiscardConfirm('feedback', 2)).toBe(false)
  })
})

describe('describeBreakdown', () => {
  const nouns = { box: ['box', 'boxes'], pin: ['pin'] }

  it('counts per type in order of first appearance', () => {
    expect(describeBreakdown(['pin', 'box', 'pin'], nouns)).toBe('2 pins, 1 box')
  })

  it('calls unknown types notes', () => {
    expect(describeBreakdown(['box', 'zigzag', 'zigzag'], nouns)).toBe('1 box, 2 notes')
  })

  it('is empty without notes', () => {
    expect(describeBreakdown([], nouns)).toBe('')
  })
})

describe('applySummary', () => {
  const isGeneral = (a) => a.general
  const create = (text) => ({ id: 'new', general: true, text })
  const note = { id: 'a', text: 'Fix' }

  it('adds a general comment when none exists', () => {
    expect(applySummary([note], ' Looks good ', { isGeneral, create })).toEqual([note, { id: 'new', general: true, text: 'Looks good' }])
  })

  it('rewrites the existing general comment', () => {
    const general = { id: 'g', general: true, text: 'Old' }
    expect(applySummary([note, general], 'New', { isGeneral, create })).toEqual([note, { ...general, text: 'New' }])
  })

  it('removes the general comment when the summary is cleared', () => {
    const general = { id: 'g', general: true, text: 'Old' }
    expect(applySummary([note, general], '  ', { isGeneral, create })).toEqual([note])
  })

  it('leaves the notes alone without a summary', () => {
    const notes = [note]
    expect(applySummary(notes, '', { isGeneral, create })).toBe(notes)
  })
})
