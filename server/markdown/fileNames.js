import { createHash } from 'node:crypto'
import { relative } from 'node:path'

/** The sha256 of a file's content (or of any text) as hex. */
export const hashOf = (text) => createHash('sha256').update(text).digest('hex')

/** A path as the reviewer and the agent read it: relative to the working directory, or absolute when it is that directory. */
export const displayPath = (absolutePath, base = process.cwd()) => relative(base, absolutePath) || absolutePath
