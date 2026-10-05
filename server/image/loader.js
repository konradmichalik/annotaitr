/**
 * The image-loading and page-capture functions that actually need
 * playwright and @napi-rs/canvas — both optionalDependencies. Kept out of
 * server/image/capture.js (pure detection helpers) so index.js only loads
 * this module once image mode is already confirmed, via a dynamic import.
 */

import { readFile, stat } from 'node:fs/promises'
import { createCanvas, loadImage, Image } from '@napi-rs/canvas'
import { chromium } from 'playwright'
import { isImageFile, isSvgFile, isSupportedCaptureUrl } from './capture.js'
import { config } from './config.js'
import { collectRawElements, normalizeDomMap, CANDIDATES, PANEL_CANDIDATES, MIN_PANEL_SIDE, MAX_ELEMENTS, CONTAINERS } from './domMap.js'

/**
 * Load and validate a local image file. Rejects unsupported extensions and
 * over-cap byte sizes before a decode is ever attempted, then rejects
 * over-cap pixel dimensions after decoding.
 */
export async function loadImageFromFile(filePath) {
  if (!isImageFile(filePath)) {
    throw new Error(`Unsupported image format: ${filePath}. Supported: .png, .jpg, .jpeg, .webp, .svg`)
  }

  const stats = await stat(filePath)
  if (stats.size > config.maxImageBytes) {
    throw new Error(`Image too large: ${filePath} (${stats.size} bytes, max ${config.maxImageBytes})`)
  }

  const source = await readFile(filePath)
  const { buffer, image } = isSvgFile(filePath)
    ? await rasterizeSvg(source, filePath)
    : { buffer: source, image: await loadImage(source) }

  if (image.width > config.maxImageDimension || image.height > config.maxImageDimension) {
    throw new Error(
      `Image dimensions too large: ${image.width}x${image.height} (max ${config.maxImageDimension}px per side)`
    )
  }

  return { buffer, width: image.width, height: image.height }
}

// Icons often declare a tiny intrinsic size (24x24) that is unusable for
// drawing on, while a 100-byte file can declare 200000x200000. As a vector,
// an SVG re-renders at any size without loss, so its longer side is clamped
// into this range instead of taken as-is.
const MIN_SVG_RASTER_SIDE = 1600
const MAX_SVG_RASTER_SIDE = 8000

const PX_LENGTH = /^\s*([\d.]+(?:e[+-]?\d+)?)\s*(?:px)?\s*$/i

// An overflowing value such as 1e309 parses to Infinity, which would turn
// the raster size into NaN; the Image setters ignore NaN, and Skia then
// falls back to allocating the declared size.
function isUsableLength(value) {
  return Number.isFinite(value) && value > 0
}

function readSvgAttribute(rootTag, name) {
  return rootTag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2]
}

/**
 * Read the declared size from the root <svg> tag. Letting the decoder
 * report it instead is not an option: it allocates a bitmap at the declared
 * size first, and Skia aborts the whole process when that fails.
 */
function readSvgSize(source) {
  const rootTag = source.toString('utf8').replace(/<!--[\s\S]*?-->/g, '').match(/<svg\b(?:[^>"']|"[^"]*"|'[^']*')*>/i)?.[0] ?? ''
  const width = Number(readSvgAttribute(rootTag, 'width')?.match(PX_LENGTH)?.[1])
  const height = Number(readSvgAttribute(rootTag, 'height')?.match(PX_LENGTH)?.[1])
  if (isUsableLength(width) && isUsableLength(height)) { return { width, height } }

  const viewBox = readSvgAttribute(rootTag, 'viewBox')?.trim().split(/[\s,]+/).map(Number) ?? []
  if (viewBox.length === 4 && isUsableLength(viewBox[2]) && isUsableLength(viewBox[3])) {
    return { width: viewBox[2], height: viewBox[3] }
  }
  return null
}

function decodeSvgAt(source, width, height) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.width = width
    image.height = height
    image.src = source
  })
}

/**
 * Render an SVG to an opaque PNG. Skia's SVG renderer runs no scripts and
 * fetches no external resources, unlike loading the file in a browser.
 * Setting the size before `src` renders the vectors at that size instead of
 * stretching a small bitmap. The white background matches how a browser
 * shows a standalone SVG, so dark strokes stay visible in a dark theme.
 */
async function rasterizeSvg(source, filePath) {
  const declared = readSvgSize(source)
  if (!declared) {
    throw new Error(`SVG has no usable size: ${filePath}. Add a px width/height or a viewBox.`)
  }

  const longerSide = Math.max(declared.width, declared.height)
  const targetSide = Math.min(Math.max(longerSide, MIN_SVG_RASTER_SIDE), MAX_SVG_RASTER_SIDE)
  const scale = targetSide / longerSide
  const width = Math.max(1, Math.round(declared.width * scale))
  const height = Math.max(1, Math.round(declared.height * scale))

  const image = await decodeSvgAt(source, width, height)
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  return { buffer: canvas.toBuffer('image/png'), image: { width, height } }
}

/**
 * Measured after the screenshot without scrolling, so boxes line up with the
 * full-page image. The map is a bonus: a page that breaks the evaluate still
 * gets captured, just without element lines in the feedback.
 */
async function collectDomMap(page, viewportOnly) {
  try {
    const options = {
      candidates: CANDIDATES,
      fallbacks: PANEL_CANDIDATES,
      minPanelSide: MIN_PANEL_SIDE,
      limit: MAX_ELEMENTS,
      containers: [...CONTAINERS, 'div'],
      viewportOnly
    }
    return normalizeDomMap(await page.evaluate(collectRawElements, options))
  } catch {
    return []
  }
}

// Runs in the page. "instant" overrides a site's smooth scrolling, which
// would otherwise still be moving when the screenshot is taken.
function scrollInPage(section) {
  if (section.anchor) {
    const target = document.querySelector(section.anchor)
    if (!target) { return false }
    target.scrollIntoView({ block: 'start', behavior: 'instant' })
    return true
  }
  window.scrollTo({ top: section.scrollY, behavior: 'instant' })
  return true
}

async function scrollToSection(page, section) {
  if (!section) { return }
  if (!(await page.evaluate(scrollInPage, section))) {
    throw new Error(`Anchor ${section.anchor} not found on the page`)
  }
}

function assertWithinLimits(buffer, box) {
  if (buffer.length > config.maxImageBytes) {
    throw new Error(`Screenshot too large: ${buffer.length} bytes, max ${config.maxImageBytes}`)
  }
  if (box.width > config.maxImageDimension || box.height > config.maxImageDimension) {
    throw new Error(
      `Screenshot dimensions too large: ${box.width}x${box.height} (max ${config.maxImageDimension}px per side)`
    )
  }
}

/**
 * Capture a screenshot of `url` at the given viewport size: the full page,
 * or with a `section` only the visible viewport after scrolling to an
 * anchor or a pixel offset. `delayMs` waits after load (and the scroll)
 * for animations and lazy content to settle.
 * Redirects are followed by the browser itself; each hop is a real
 * navigation the browser re-validates against its own protocol rules, so no
 * separate redirect-chain check is needed here.
 */
export async function captureUrl(url, viewport, { delayMs = 0, section = null } = {}) {
  if (!isSupportedCaptureUrl(url)) {
    throw new Error(`Unsupported URL: ${url}. Only http:// and https:// are accepted.`)
  }

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport })
    await page.goto(url, { timeout: config.captureTimeoutMs, waitUntil: 'load' })
    await scrollToSection(page, section)
    if (delayMs > 0) { await page.waitForTimeout(delayMs) }
    const buffer = await page.screenshot({ fullPage: !section, type: 'png' })
    const box = section ? viewport : await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    }))
    assertWithinLimits(buffer, box)
    return { buffer, width: box.width, height: box.height, domMap: await collectDomMap(page, Boolean(section)) }
  } finally {
    await browser.close()
  }
}
