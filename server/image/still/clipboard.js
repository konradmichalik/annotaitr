import { execFile } from 'node:child_process'
import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (error, stdout, stderr) => {
      if (error) {
        reject(error)
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
}

/**
 * Save the current macOS clipboard image to a fresh temp PNG file, using the
 * same AppleScript pattern Claude Code itself uses to read pasted
 * screenshots (`the clipboard as «class PNGf»`). Lets annotaitr be invoked
 * with no target and pick up whatever screenshot is on the clipboard, as a
 * stand-in for pasting the image directly.
 */
export async function saveClipboardImage() {
  if (process.platform !== 'darwin') {
    throw new Error(`Reading the clipboard is only supported on macOS, not ${process.platform}.`)
  }

  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-clipboard-'))
  const path = join(dir, 'clipboard.png')

  try {
    await runAppleScript([
      'set pngData to (the clipboard as «class PNGf»)',
      `set theFile to open for access (POSIX file "${path}") with write permission`,
      'set eof of theFile to 0',
      'write pngData to theFile',
      'close access theFile'
    ].join('\n'))
  } catch {
    throw new Error('No image found in clipboard.')
  }

  const stats = await stat(path).catch(() => null)
  if (!stats || stats.size === 0) {
    throw new Error('No image found in clipboard.')
  }

  return path
}
