import { getItem, setItem } from '../../../shared/utils/storage.js'

// One cookie for the last PDF only: cookies span every port the CLI binds,
// and reopening an older PDF on its last page is not worth a growing list.
const KEY = 'annotaitr-last-page'

export function rememberedValue(hash, page) {
  return `${hash}:${page}`
}

/** The page remembered for the PDF with `hash`, if it is one of the reviewed `pages`. */
export function restoredPage(value, hash, pages) {
  if (!value || !hash) { return null }
  const [storedHash, storedPage] = value.split(':')
  const page = Number(storedPage)
  if (storedHash !== hash || !Number.isInteger(page)) { return null }
  return pages.some((p) => p.number === page) ? page : null
}

export function readLastPage(hash, pages) {
  return restoredPage(getItem(KEY), hash, pages)
}

export function rememberLastPage(hash, page) {
  setItem(KEY, rememberedValue(hash, page))
}
