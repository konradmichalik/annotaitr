import { describe, it, expect } from 'vitest'
import { countsLabel, doneOutcome, previewNotes } from '../../../client/shared/utils/done.js'

describe('doneOutcome', () => {
  it('shows nothing while the review runs', () => {
    expect(doneOutcome({ decision: null })).toBeNull()
  })

  it('picks the page for each decision', () => {
    expect(doneOutcome({ decision: 'feedback', notes: 2 })).toBe('feedback')
    expect(doneOutcome({ decision: 'approved' })).toBe('approved')
    expect(doneOutcome({ decision: 'approved', notes: 2 })).toBe('approved-notes')
    expect(doneOutcome({ decision: 'approved', replies: 1 })).toBe('approved-notes')
  })

  it('shows Session gone only when the session ended before a decision', () => {
    expect(doneOutcome({ decision: null, serverGone: true, notes: 3 })).toBe('gone')
    expect(doneOutcome({ decision: 'feedback', serverGone: true })).toBe('feedback')
  })
})

describe('countsLabel', () => {
  it('names notes and replies and leaves out what is zero', () => {
    expect(countsLabel(4, 2)).toBe('4 notes, 2 replies')
    expect(countsLabel(1)).toBe('1 note')
    expect(countsLabel(0, 1)).toBe('1 reply')
    expect(countsLabel(0, 0)).toBe('nothing')
  })
})

describe('previewNotes', () => {
  const notes = [
    { id: 'g', number: null, intent: null, text: 'Overall' },
    { id: 'c', number: 3, intent: 'add', text: 'Third' },
    { id: 'a', number: 1, intent: 'change', text: 'First' },
    { id: 'b', number: 2, intent: 'question', text: 'Second' }
  ]

  it('lists numbered notes by number with the general comment last', () => {
    expect(previewNotes(notes, 0, 10).shown.map((n) => n.id)).toEqual(['a', 'b', 'c', 'g'])
    expect(previewNotes(notes, 0, 10).more).toBeNull()
  })

  it('sums up what does not fit', () => {
    expect(previewNotes(notes, 2, 2).more).toBe('+ 2 more notes, 2 replies')
    expect(previewNotes(notes, 0, 3).more).toBe('+ 1 more note')
    expect(previewNotes(notes.slice(0, 1), 1, 3).more).toBe('+ 1 reply')
  })
})
