import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeCrops } from '../common/cropFiles.js'

/**
 * Persist a flattened annotation image and its crops to a fresh temp
 * directory so the agent can read them directly. Each call gets its own
 * directory. Nothing here is ever overwritten mid-session.
 */
export async function writeAnnotatedImage(buffer, crops = []) {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-'))
  const path = join(dir, 'annotated.png')
  try {
    await writeFile(path, buffer)
  } catch (error) {
    // A directory without the annotated image would only ever be found by accident.
    await rm(dir, { recursive: true, force: true })
    throw error
  }
  return { path, cropsByNumber: await writeCrops(dir, '', crops) }
}
