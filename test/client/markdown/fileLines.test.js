import { describe, it, expect } from 'vitest'
import { splitLines } from '../../../client/markdown/src/utils/fileLines.js'

describe('splitLines', () => {
  it('splits a file into its lines', () => {
    expect(splitLines('one\ntwo\nthree')).toEqual(['one', 'two', 'three'])
  })

  it('does not count the line break at the end of a file as another line', () => {
    expect(splitLines('one\ntwo\n')).toEqual(['one', 'two'])
  })

  it('keeps an empty line in the middle and at the end before the last break', () => {
    expect(splitLines('one\n\ntwo\n\n')).toEqual(['one', '', 'two', ''])
  })

  it('reads Windows and old Mac line breaks as one break each', () => {
    expect(splitLines('one\r\ntwo\rthree\n')).toEqual(['one', 'two', 'three'])
  })

  it('has no lines in an empty file', () => {
    expect(splitLines('')).toEqual([])
  })
})
