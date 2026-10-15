import { writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { cropFileName } from './crops.js'

/** Crops are optional, so their failure is reported on stderr and never blocks a decision. */
export function warnWithoutCrops(error) {
  process.stderr.write(`annotaitr: could not write the crops per note, the feedback goes without them (${error.message})\n`)
}

/**
 * Write the crops from `renderAnnotatedWithCrops` into `dir`, each name
 * starting with `prefix`, and map every note number to its crop's path.
 * On a failed write no crop is kept and the map is empty.
 */
export async function writeCrops(dir, prefix, crops) {
  const byNumber = new Map()
  try {
    for (const { numbers, buffer } of crops) {
      const path = join(dir, cropFileName(prefix, numbers))
      await writeFile(path, buffer)
      for (const number of numbers) { byNumber.set(number, path) }
    }
    return byNumber
  } catch (error) {
    await Promise.all([...new Set(byNumber.values())].map((path) => rm(path, { force: true })))
    warnWithoutCrops(error)
    return new Map()
  }
}
