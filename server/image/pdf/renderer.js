import { Worker } from 'node:worker_threads'
import { basename } from 'node:path'

export const RENDER_TIMEOUT_MS = 10_000

const WORKER_URL = new URL('./renderWorker.js', import.meta.url)

function openError(pdfPath, { name, message }) {
  // pdf.js codes: 1 no password given, 2 wrong password; neither is asked for.
  if (name === 'PasswordException') {
    return new Error(`Encrypted PDF: ${basename(pdfPath)}. Remove the password or export an unprotected copy.`)
  }
  return new Error(`Could not read ${pdfPath} as a PDF: ${message}`)
}

/** Start a worker for the PDF and wait until it has parsed the document. */
function startWorker(pdfPath) {
  const worker = new Worker(WORKER_URL, { workerData: { pdfPath } })
  const ready = new Promise((resolve, reject) => {
    worker.once('message', (message) => {
      if (message.type === 'ready') { resolve(message) } else { reject(openError(pdfPath, message.error)) }
    })
    worker.once('error', reject)
  })
  return { worker, ready }
}

/**
 * Render the pages of a PDF in a worker thread. Requests run one at a time,
 * and each one gets `timeoutMs`: a page that takes longer terminates the
 * worker, and the next request starts a fresh one, so one broken page never
 * blocks the server or the rest of the document.
 */
export async function createPdfRenderer(pdfPath, { timeoutMs = RENDER_TIMEOUT_MS } = {}) {
  let current = startWorker(pdfPath)
  let meta
  try {
    meta = await current.ready
  } catch (error) {
    await current.worker.terminate()
    throw error
  }

  let queue = Promise.resolve()
  let nextId = 1

  async function liveWorker() {
    if (!current) {
      current = startWorker(pdfPath)
    }
    await current.ready
    return current.worker
  }

  function discardWorker() {
    const stale = current
    current = null
    return stale?.worker.terminate()
  }

  async function request(page, longSide) {
    const worker = await liveWorker()
    const id = nextId++
    return new Promise((resolve, reject) => {
      const settle = (fn, value) => {
        clearTimeout(timer)
        worker.off('message', onMessage)
        worker.off('error', onError)
        fn(value)
      }
      const onMessage = (message) => {
        if (message.id !== id) { return }
        if (message.error) { settle(reject, new Error(`Page ${page}: ${message.error.message}`)) }
        else { settle(resolve, { ...message.result, buffer: Buffer.from(message.result.buffer) }) }
      }
      const onError = (error) => {
        discardWorker()
        settle(reject, error)
      }
      const timer = setTimeout(() => {
        discardWorker()
        settle(reject, new Error(`Page ${page} took longer than ${timeoutMs} ms to render`))
      }, timeoutMs)
      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.postMessage({ id, page, longSide })
    })
  }

  return {
    pageCount: meta.pageCount,
    pageSizes: meta.pageSizes,
    /** `{ buffer, width, height }` of the page as PNG, its longer side `longSide` pixels. */
    render(page, longSide) {
      if (!Number.isInteger(page) || page < 1 || page > meta.pageCount) {
        return Promise.reject(new Error(`Page ${page} is not in this document`))
      }
      const job = queue.then(() => request(page, longSide))
      queue = job.catch(() => {})
      return job
    },
    async close() {
      await discardWorker()
    }
  }
}
