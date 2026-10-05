import { describe, it, expect } from 'vitest'
import { exportFileName } from '../../../client/image/src/utils/exportFile.js'

describe('exportFileName', () => {
  it('names the file after the captured host and path', () => {
    expect(exportFileName('https://typo3.org/')).toBe('annotated-typo3-org.png')
    expect(exportFileName('http://localhost:3000/checkout?step=2')).toBe('annotated-localhost-3000-checkout.png')
  })

  it('names it after a local file without its extension', () => {
    expect(exportFileName('/Users/me/Desktop/Screenshot 2026.png')).toBe('annotated-screenshot-2026.png')
  })

  it('takes only the file name from a Windows path', () => {
    expect(exportFileName('C:\\Users\\me\\Desktop\\shot.png')).toBe('annotated-shot.png')
  })

  it('falls back to a plain name', () => {
    expect(exportFileName(null)).toBe('annotated.png')
    expect(exportFileName('clipboard image')).toBe('annotated-clipboard-image.png')
  })
})
