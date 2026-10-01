import { describe, it, expect } from 'vitest'
import { readError } from '../../../client/image/src/utils/readError.js'

describe('readError', () => {
  it('returns the error the server sent', async () => {
    const res = new Response(JSON.stringify({ success: false, error: 'Too many frames' }), { status: 400 })
    expect(await readError(res)).toBe('Too many frames')
  })

  it('falls back to the status for a body without an error or without JSON', async () => {
    expect(await readError(new Response('{}', { status: 409 }))).toBe('Server responded with 409')
    expect(await readError(new Response('<html>', { status: 502 }))).toBe('Server responded with 502')
  })
})
