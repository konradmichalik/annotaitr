import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '..', '..', '..', 'client', 'dist', 'image')
const DEV_DIR = join(__dirname, '..', '..', '..', 'client', 'image')

/** The image client bundle every image-mode adapter serves: the build if there is one, else the dev sources. */
export const imageBundleDir = existsSync(join(DIST_DIR, 'index.html')) ? DIST_DIR : DEV_DIR
