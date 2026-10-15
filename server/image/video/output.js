import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderAnnotatedWithCrops, composeContactSheet } from '../common/render.js'
import { writeCrops } from '../common/cropFiles.js'
import { formatFileTime, formatTimecode } from './timeline.js'

const STRIP_LAYOUT = { columns: 3, tileWidth: 480 }
const OVERVIEW_LAYOUT = { columns: 4, tileWidth: 360 }

const pad = (number) => String(number).padStart(2, '0')

function overviewLabel(time, numbers) {
  return numbers.length > 0 ? `${formatTimecode(time)}  #${numbers.join(' #')}` : formatTimecode(time)
}

/**
 * Render every file the feedback points at into a fresh temp directory:
 * one frame per annotation time with its markup, legend and crops per note,
 * one strip per span and the overview. `rawFrames` maps each planned time to the PNG the
 * browser grabbed for it.
 */
export async function writeVideoOutput(plan, rawFrames) {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-'))
  try {
    return await renderInto(dir, plan, (time) => readFile(rawFrames.get(time)))
  } catch (error) {
    // A half-written directory would only ever be found by accident.
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

async function renderInto(dir, plan, raw) {
  const frames = new Map()
  const crops = new Map()
  for (const [index, frame] of plan.frames.entries()) {
    const name = `frame-${pad(index + 1)}-${formatFileTime(frame.time)}`
    const { full, crops: frameCrops } = await renderAnnotatedWithCrops(
      await raw(frame.time),
      frame.entries.map((e) => e.annotation),
      frame.entries.map((e) => e.number),
      // A span is also drawn on the later frames it covers; it is cropped only where it was drawn.
      (annotation) => annotation.time === frame.time
    )
    await writeFile(join(dir, `${name}.png`), full)
    frames.set(frame.time, join(dir, `${name}.png`))
    for (const [number, path] of await writeCrops(dir, `${name}-`, frameCrops)) { crops.set(number, path) }
  }

  const strips = new Map()
  for (const strip of plan.strips) {
    const { time, endTime } = strip.annotation
    const path = join(dir, `strip-${pad(strip.number)}-${formatFileTime(time)}-${formatFileTime(endTime)}.png`)
    const tiles = await Promise.all(strip.times.map(async (t) => ({ buffer: await raw(t), label: formatTimecode(t) })))
    await writeFile(path, await composeContactSheet(tiles, STRIP_LAYOUT))
    strips.set(strip.number, path)
  }

  const overview = join(dir, 'overview.png')
  const overviewTiles = await Promise.all(plan.overview.times.map(async (t, i) => ({
    buffer: await raw(t),
    label: overviewLabel(t, plan.overview.numbersByTile[i])
  })))
  await writeFile(overview, await composeContactSheet(overviewTiles, OVERVIEW_LAYOUT))

  return { dir, overview, frames, strips, crops }
}
