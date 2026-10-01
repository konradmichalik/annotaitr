import { describe, it, expect } from 'vitest'
import { isImageFile, isVideoFile, isGifFile, isSupportedCaptureUrl } from '../../../server/image/capture.js'

describe('isImageFile', () => {
  it('accepts supported extensions', () => {
    expect(isImageFile('/a/b/shot.png')).toBe(true)
    expect(isImageFile('/a/b/shot.JPG')).toBe(true)
    expect(isImageFile('/a/b/shot.jpeg')).toBe(true)
    expect(isImageFile('/a/b/shot.webp')).toBe(true)
    expect(isImageFile('/a/b/diagram.SVG')).toBe(true)
  })

  it('rejects unsupported extensions', () => {
    expect(isImageFile('/a/b/shot.gif')).toBe(false)
    expect(isImageFile('/a/b/shot.md')).toBe(false)
  })
})

describe('isSupportedCaptureUrl', () => {
  it('accepts http and https', () => {
    expect(isSupportedCaptureUrl('http://localhost:3000')).toBe(true)
    expect(isSupportedCaptureUrl('https://example.com/page')).toBe(true)
  })

  it('rejects other protocols and malformed URLs', () => {
    expect(isSupportedCaptureUrl('file:///etc/passwd')).toBe(false)
    expect(isSupportedCaptureUrl('not a url')).toBe(false)
    expect(isSupportedCaptureUrl('./relative/path.png')).toBe(false)
  })
})

describe('isVideoFile', () => {
  it('accepts video and GIF extensions', () => {
    for (const name of ['a.mp4', 'a.webm', 'a.MOV', 'a.m4v', 'a.gif']) {
      expect(isVideoFile(`/x/${name}`)).toBe(true)
    }
  })

  it('rejects still images and other files', () => {
    expect(isVideoFile('/x/a.png')).toBe(false)
    expect(isVideoFile('/x/a.md')).toBe(false)
    expect(isVideoFile('/x/a.mkv')).toBe(false)
  })
})

describe('isGifFile', () => {
  it('detects only .gif', () => {
    expect(isGifFile('/x/a.GIF')).toBe(true)
    expect(isGifFile('/x/a.mp4')).toBe(false)
  })
})
