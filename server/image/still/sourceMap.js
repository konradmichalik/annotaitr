/**
 * React 19 dev builds no longer carry a file and line on a DOM node, only the
 * stack of the JSX call. That stack points into the dev server's transformed
 * script, so its line is only right after mapping it through the script's
 * source map, which this module fetches from the captured page's own origin.
 */

import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'

const LIMITS = { maxScripts: 20, maxBytes: 20 * 1024 * 1024, timeoutMs: 3000 }
const SOURCE_MAPPING_URL = /\/\/[#@] sourceMappingURL=(\S+)\s*$/

function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

/** A fetch for text that shares one byte budget and one deadline across all calls. */
function cappedFetcher(maxBytes, signal) {
  let remaining = maxBytes
  return async (url) => {
    // A redirect could leave the page's origin. Node resolves the host anew, so DNS
    // rebinding could answer from elsewhere; only a pattern-checked existing path and a line come out.
    const response = await fetch(url, { signal, redirect: 'error' })
    if (!response.ok || !response.body) { return null }
    const chunks = []
    for await (const chunk of response.body) {
      remaining -= chunk.length
      if (remaining < 0) { return null }
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString('utf8')
  }
}

function inlineMap(reference) {
  const comma = reference.indexOf(',')
  const data = reference.slice(comma + 1)
  return reference.slice(0, comma).endsWith(';base64') ? Buffer.from(data, 'base64').toString('utf8') : decodeURIComponent(data)
}

async function loadMap(scriptUrl, origin, fetchText) {
  const reference = (await fetchText(scriptUrl))?.match(SOURCE_MAPPING_URL)?.[1]
  if (!reference) { return null }
  if (reference.startsWith('data:')) { return new TraceMap(inlineMap(reference), scriptUrl) }
  const mapUrl = new URL(reference, scriptUrl).href
  if (!sameOrigin(mapUrl, origin)) { return null }
  const map = await fetchText(mapUrl)
  return map ? new TraceMap(map, mapUrl) : null
}

function frameUrl(element) {
  return typeof element?.source?.url === 'string' ? element.source.url : ''
}

/** The element with its stack frame swapped for the original file and line, or for the name alone. */
function withMappedSource(element, maps) {
  const url = frameUrl(element)
  if (!url) { return element }
  const { name, line, column } = element.source
  const map = maps.get(url)
  const position = map && Number.isInteger(line) && Number.isInteger(column) && column >= 1
    ? originalPositionFor(map, { line, column: column - 1 })
    : null
  return { ...element, source: position?.source ? { name, file: position.source, line: position.line } : { name } }
}

/**
 * Map the React 19 stack frames among raw DOM map elements to their original
 * source. Only scripts from the page's own origin are fetched, each once,
 * within a cap on scripts, bytes and time; whatever cannot be mapped keeps
 * just its component name.
 */
export async function symbolicateSources(elements, pageUrl, limits = {}) {
  if (!Array.isArray(elements)) { return elements }
  const { maxScripts, maxBytes, timeoutMs } = { ...LIMITS, ...limits }
  const origin = new URL(pageUrl).origin
  const urls = [...new Set(elements.map(frameUrl).filter((url) => sameOrigin(url, origin)))].slice(0, maxScripts)
  const fetchText = cappedFetcher(maxBytes, AbortSignal.timeout(timeoutMs))
  const entries = await Promise.all(urls.map(async (url) => [url, await loadMap(url, origin, fetchText).catch(() => null)]))
  const maps = new Map(entries)
  return elements.map((element) => withMappedSource(element, maps))
}
