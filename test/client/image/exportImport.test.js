import { describe, it, expect } from 'vitest'
import { serializeAnnotations, parseAnnotationsJson } from '../../../client/image/src/utils/exportImport.js'

const sample = [{ id: 'ann-1', type: 'pin', geometry: { x: 1, y: 2 }, text: 'hi', color: '#e11d48', createdAt: 0 }]

describe('serializeAnnotations / parseAnnotationsJson', () => {
  it('round-trips a list of annotations', () => {
    const json = serializeAnnotations(sample)
    expect(parseAnnotationsJson(json)).toEqual(sample)
  })

  it('round-trips an annotation carrying the newer arrowStyle/strokeWidth/dashStyle fields untouched', () => {
    const withStyleFields = [{
      id: 'ann-2', type: 'arrow', geometry: { x1: 0, y1: 0, x2: 10, y2: 10 },
      text: '', color: '#e11d48', createdAt: 0,
      arrowStyle: 'double', strokeWidth: 5, dashStyle: 'dashed'
    }]
    const json = serializeAnnotations(withStyleFields)
    expect(parseAnnotationsJson(json)).toEqual(withStyleFields)
  })

  it('produces indented, readable JSON', () => {
    expect(serializeAnnotations(sample)).toContain('\n  ')
  })

  it('rejects malformed JSON with a clear error', () => {
    expect(() => parseAnnotationsJson('{not json')).toThrow(/Invalid annotations JSON/)
  })

  it('rejects valid JSON that is not an array', () => {
    expect(() => parseAnnotationsJson('{"foo": "bar"}')).toThrow(/must be an array/)
  })

  it('rejects an annotation with no geometry instead of letting it crash the app on render', () => {
    // The exact shape that used to reach state unvalidated and crash the
    // canvas with "Cannot destructure property 'x' of 'o' as it is undefined".
    expect(() => parseAnnotationsJson('[{"id":"x","type":"box"}]')).toThrow(/geometry/)
  })

  it('rejects an unknown annotation type', () => {
    expect(() => parseAnnotationsJson('[{"id":"x","type":"triangle","geometry":{}}]')).toThrow(/unknown type/)
  })

  it('rejects a box with non-numeric geometry fields', () => {
    const json = JSON.stringify([{ id: 'x', type: 'box', geometry: { x: '1', y: 2, width: 3, height: 4 } }])
    expect(() => parseAnnotationsJson(json)).toThrow(/box geometry/)
  })

  it('accepts a general comment with no geometry at all', () => {
    const json = JSON.stringify([{ id: 'x', type: 'comment', geometry: null, text: 'hi' }])
    expect(parseAnnotationsJson(json)).toEqual([{ id: 'x', type: 'comment', geometry: null, text: 'hi' }])
  })

  it('accepts a null color, since a general comment is created with color: null', () => {
    const json = JSON.stringify([{ id: 'x', type: 'comment', geometry: null, text: 'hi', color: null }])
    expect(() => parseAnnotationsJson(json)).not.toThrow()
  })

  it('rejects a freehand/highlighter mark with an empty points array', () => {
    const json = JSON.stringify([{ id: 'x', type: 'freehand', geometry: { points: [] } }])
    expect(() => parseAnnotationsJson(json)).toThrow(/points array/)
  })

  it('rejects a freehand/highlighter mark with an excessive points array', () => {
    const points = Array.from({ length: 5001 }, (_, i) => ({ x: i, y: i }))
    const json = JSON.stringify([{ id: 'x', type: 'freehand', geometry: { points } }])
    expect(() => parseAnnotationsJson(json)).toThrow(/too many points/)
  })

  it('rejects a non-numeric strokeWidth, which would otherwise throw a DOMException from setLineDash at render time', () => {
    const json = JSON.stringify([{ id: 'x', type: 'box', geometry: { x: 0, y: 0, width: 1, height: 1 }, strokeWidth: 'thick' }])
    expect(() => parseAnnotationsJson(json)).toThrow(/strokeWidth/)
  })

  it('accepts an unrecognized dashStyle/arrowStyle string, since both already fall back gracefully at render time', () => {
    const json = JSON.stringify([{ id: 'x', type: 'arrow', geometry: { x1: 0, y1: 0, x2: 1, y2: 1 }, dashStyle: 'wavy', arrowStyle: 'sparkly' }])
    expect(() => parseAnnotationsJson(json)).not.toThrow()
  })

  it('rejects a non-string dashStyle/arrowStyle', () => {
    const json = JSON.stringify([{ id: 'x', type: 'arrow', geometry: { x1: 0, y1: 0, x2: 1, y2: 1 }, dashStyle: 5 }])
    expect(() => parseAnnotationsJson(json)).toThrow(/dashStyle/)
  })
})

describe('parseAnnotationsJson with video times', () => {
  const timed = { id: 't', type: 'box', geometry: { x: 0, y: 0, width: 1, height: 1 }, time: 1.5, endTime: 3 }

  it('keeps time and endTime on import', () => {
    expect(parseAnnotationsJson(JSON.stringify([timed]))).toEqual([timed])
  })

  it('rejects a negative or non-numeric time', () => {
    expect(() => parseAnnotationsJson(JSON.stringify([{ ...timed, time: -1 }]))).toThrow(/time/)
    expect(() => parseAnnotationsJson(JSON.stringify([{ ...timed, time: '1' }]))).toThrow(/time/)
  })

  it('rejects an endTime that is not after time', () => {
    expect(() => parseAnnotationsJson(JSON.stringify([{ ...timed, endTime: 1 }]))).toThrow(/endTime/)
  })
})
