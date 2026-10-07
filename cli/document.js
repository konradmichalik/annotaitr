import { resolve as resolvePath, basename } from 'node:path'
import { createRequire } from 'node:module'
import { isSourceNewer, siblingPdf, pdfPathFor } from '../server/image/document/source.js'
import { captureFlagError } from './args.js'
import { fileExists } from './detect.js'
import { fail } from './help.js'
import { serveUntilDecision } from './outcome.js'
import { openSession } from './session.js'

/**
 * A PDF needs no playwright either, but pdf.js (loaded inside the render
 * worker, so resolved here up front to fail early) and @napi-rs/canvas.
 */
async function loadDocumentRuntime() {
  try {
    createRequire(import.meta.url).resolve('pdfjs-dist/package.json')
    const [document, adapter] = await Promise.all([
      import('../server/image/document/pdfDocument.js'),
      import('../server/image/document/adapter.js')
    ])
    return { openPdfDocument: document.openPdfDocument, buildDocumentServer: adapter.buildDocumentServer }
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'Reviewing a PDF needs pdfjs-dist and @napi-rs/canvas, which are optional dependencies. ' +
        'Install them with: npm i pdfjs-dist @napi-rs/canvas'
      )
    }
    throw error
  }
}

// Leaves plain paths as typed, so the hint reads like a command a person would write.
function shellArg(value) {
  return /^[\w./@:+-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`
}

/**
 * An office document is reviewed as the PDF its own tool exports. The hint
 * is for the agent that built the file (it knows how to render it) and for
 * a person running the CLI by hand alike, so it carries the next command.
 */
export async function convertHint(target) {
  const { document: trimmed, pdf: pdfPath } = pdfPathFor(target)
  const command = `annotaitr ${shellArg(pdfPath)} --source ${shellArg(trimmed)}`
  const name = basename(trimmed)
  const next = (await siblingPdf(resolvePath(trimmed)))
    ? `${basename(pdfPath)} already exists and is not older than ${name}. If it is current, run:`
    : `Export ${name} to PDF with the tool that created it, then run:`
  return `CONVERT TO PDF FIRST: ${trimmed}\nannotaitr reviews documents as PDF. ${next}\n  ${command}\n`
}

export async function runDocument({ target, origin, viewportSpec, delaySpec, sourceSpec, pageRanges, session = {} }) {
  const flagError = captureFlagError('a PDF', { viewportSpec, delaySpec })
  if (flagError) { fail(flagError); return }
  const pdfPath = resolvePath(target)
  if (!(await fileExists(pdfPath))) {
    fail(`File not found: ${pdfPath}`)
    return
  }
  const sourcePath = sourceSpec ? resolvePath(sourceSpec) : null
  if (sourcePath && !(await fileExists(sourcePath))) {
    fail(`Source not found: ${sourcePath}`)
    return
  }

  const opened = await openSession({ identity: pdfPath, target: { kind: 'document', label: basename(pdfPath) }, ...session })
  if (opened.error) { fail(opened.error); return }

  const { openPdfDocument, buildDocumentServer } = await loadDocumentRuntime()
  let document
  try {
    document = await openPdfDocument(pdfPath, { pageRanges })
  } catch (error) {
    fail(error.message)
    return
  }

  const reviewed = { ...opened, fingerprint: document.fingerprint }

  const freshness = sourcePath ? await isSourceNewer(sourcePath, pdfPath) : { newer: false }
  const source = sourcePath ? { label: basename(sourcePath), newer: freshness.newer === true } : null
  if (source?.newer) {
    process.stderr.write(`Warning: ${source.label} is newer than ${basename(pdfPath)}. The PDF may be outdated, regenerate it before reviewing.\n`)
  }
  if (freshness.skipped) { process.stderr.write(`Note: ${freshness.skipped}.\n`) }

  await serveUntilDecision(await buildDocumentServer({ document, source, origin, targetLabel: basename(pdfPath), session: reviewed }), reviewed)
}
