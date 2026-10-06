import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Persist a flattened annotation image to a fresh temp file so the agent can
 * read it directly. Each call gets its own directory. Nothing here is ever
 * overwritten mid-session.
 */
export async function writeAnnotatedImage(buffer) {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-'))
  const path = join(dir, 'annotated.png')
  await writeFile(path, buffer)
  return path
}
