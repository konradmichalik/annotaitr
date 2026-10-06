import { describe, it, expect, vi, afterEach } from 'vitest'
import { writeFile } from 'node:fs/promises'

const execFileMock = vi.fn()

vi.mock('node:child_process', () => ({
  execFile: (...args) => execFileMock(...args)
}))

function setPlatform(value) {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

describe('saveClipboardImage', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    setPlatform(originalPlatform)
    vi.clearAllMocks()
  })

  it('rejects on a non-macOS platform', async () => {
    setPlatform('linux')
    const { saveClipboardImage } = await import('../../../../server/image/still/clipboard.js')
    await expect(saveClipboardImage()).rejects.toThrow(/only supported on macOS/)
  })

  it('rejects when osascript fails', async () => {
    setPlatform('darwin')
    execFileMock.mockImplementation((command, args, callback) => callback(new Error('boom')))
    const { saveClipboardImage } = await import('../../../../server/image/still/clipboard.js')
    await expect(saveClipboardImage()).rejects.toThrow(/No image found in clipboard/)
  })

  it('rejects when the clipboard has no image', async () => {
    setPlatform('darwin')
    execFileMock.mockImplementation((command, args, callback) => callback(null, '', ''))
    const { saveClipboardImage } = await import('../../../../server/image/still/clipboard.js')
    await expect(saveClipboardImage()).rejects.toThrow(/No image found in clipboard/)
  })

  it('resolves with the temp file path once the AppleScript writes an image', async () => {
    setPlatform('darwin')
    execFileMock.mockImplementation(async (command, args, callback) => {
      const script = args[1]
      const [, path] = script.match(/POSIX file "([^"]+)"/)
      await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      callback(null, '', '')
    })
    const { saveClipboardImage } = await import('../../../../server/image/still/clipboard.js')
    const path = await saveClipboardImage()
    expect(path).toMatch(/clipboard\.png$/)
  })
})
