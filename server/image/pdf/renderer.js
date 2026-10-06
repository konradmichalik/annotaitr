import { Worker } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const RENDER_TIMEOUT_MS = 10_000
const OPEN_TIMEOUT_MS = 30_000

// Which waiting job runs next: page sizes block opening the review, the
// page on screen and its text come before thumbnails scrolled into view.
export const PRIORITY = { size: 2, page: 1, thumb: 0 }

const WORKER_URL = new URL('./renderWorker.js', import.meta.url)
// Bounds the worker's JS heap. Decoded images live outside it, which is
// what maxImageSize in the worker is for.
const WORKER_LIMITS = { maxOldGenerationSizeMb: 1024 }

function openError(pdfPath, { name, message }) {
  // pdf.js codes: 1 no password given, 2 wrong password; neither is asked for.
  if (name === 'PasswordException') {
    return new Error(`Encrypted PDF: ${basename(pdfPath)}. Remove the password or export an unprotected copy.`)
  }
  return new Error(`Could not read ${pdfPath} as a PDF: ${message}`)
}

/** An error after which the worker is unusable and has to be replaced. */
function brokenWorker(message) {
  return Object.assign(new Error(message), { workerBroken: true })
}

/** Start a worker on the PDF's bytes; `ready` settles once it has parsed the document, or it dies. */
function startWorker(data, pdfPath) {
  const worker = new Worker(WORKER_URL, { workerData: { data }, resourceLimits: WORKER_LIMITS })
  const ready = new Promise((resolve, reject) => {
    worker.once('message', (message) => {
      if (message.type === 'ready') { resolve(message) } else { reject(openError(pdfPath, message.error)) }
    })
    worker.once('error', reject)
    worker.once('exit', (code) => reject(brokenWorker(`The PDF render worker stopped (exit code ${code})`)))
  })
  return { worker, ready }
}

function withTimeout(promise, ms, message) {
  let timer
  const timeout = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(brokenWorker(message)), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Send one request to the worker and wait for its answer, the worker's death or the timeout. */
function exchange(worker, request, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const settle = (fn, value) => {
      clearTimeout(timer)
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
      fn(value)
    }
    const onMessage = (message) => {
      if (message.id !== request.id) { return }
      if (message.error) { settle(reject, new Error(`${label}: ${message.error.message}`)) } else { settle(resolve, message.result) }
    }
    const onError = (error) => settle(reject, Object.assign(error, { workerBroken: true }))
    const onExit = () => settle(reject, brokenWorker(`${label}: the render worker stopped`))
    const timer = setTimeout(() => settle(reject, brokenWorker(`${label} took longer than ${timeoutMs} ms to render`)), timeoutMs)
    worker.on('message', onMessage)
    worker.on('error', onError)
    worker.on('exit', onExit)
    worker.postMessage(request)
  })
}

const abortError = () => Object.assign(new Error('The request was abandoned'), { name: 'AbortError' })

/**
 * Jobs run one at a time, the highest priority first. A job whose signal
 * was aborted while it waited (the browser stopped asking for that page) is
 * dropped without running.
 */
function createJobQueue() {
  const jobs = []
  let running = false

  async function pump() {
    if (running) { return }
    running = true
    while (jobs.length > 0) {
      const next = jobs.reduce((best, job, index) => (job.priority > jobs[best].priority ? index : best), 0)
      const [job] = jobs.splice(next, 1)
      if (job.signal?.aborted) {
        job.reject(abortError())
        continue
      }
      try {
        job.resolve(await job.run())
      } catch (error) {
        job.reject(error)
      }
    }
    running = false
  }

  return {
    add(run, { priority = 0, signal = null } = {}) {
      return new Promise((resolve, reject) => {
        jobs.push({ run, priority, signal, resolve, reject })
        pump()
      })
    },
    clear(error) {
      jobs.splice(0).forEach((job) => job.reject(error))
    }
  }
}

/**
 * Render the pages of a PDF in a worker thread. The file is read once, so
 * every worker parses the same bytes even if the file changes on disk.
 * Opening and every request have a timeout; a worker that times out, fails
 * to start or dies is terminated, and the next request starts a fresh one,
 * so one broken page never blocks the server or the rest of the document.
 */
export async function createPdfRenderer(pdfPath, { timeoutMs = RENDER_TIMEOUT_MS, openTimeoutMs = OPEN_TIMEOUT_MS } = {}) {
  const data = new Uint8Array(await readFile(pdfPath))
  const queue = createJobQueue()
  let current = null
  let closed = false
  let nextId = 1

  function discardWorker() {
    const stale = current
    current = null
    return stale?.worker.terminate()
  }

  async function liveWorker() {
    const starting = (current ??= startWorker(data, pdfPath))
    try {
      const meta = await withTimeout(starting.ready, openTimeoutMs, `Opening ${basename(pdfPath)} took longer than ${openTimeoutMs} ms`)
      // close() may have discarded this worker while it was starting.
      if (current !== starting) { throw new Error('The PDF renderer is closed') }
      return { worker: starting.worker, meta }
    } catch (error) {
      if (current === starting) { await discardWorker() }
      throw error
    }
  }

  async function call(request, label) {
    const { worker } = await liveWorker()
    try {
      return await exchange(worker, { ...request, id: nextId++ }, timeoutMs, label)
    } catch (error) {
      if (error.workerBroken) { await discardWorker() }
      throw error
    }
  }

  function enqueue(run, options) {
    return closed ? Promise.reject(new Error('The PDF renderer is closed')) : queue.add(run, options)
  }

  function checkPage(page) {
    return Number.isInteger(page) && page >= 1 && page <= meta.pageCount
  }

  const { meta } = await liveWorker()

  return {
    pageCount: meta.pageCount,
    /** `{ width, height }` of a page in PDF points, without rendering it. */
    pageSize(page) {
      if (!checkPage(page)) { return Promise.reject(new Error(`Page ${page} is not in this document`)) }
      return enqueue(() => call({ kind: 'size', page }, `Page ${page}`), { priority: PRIORITY.size })
    },
    /** `{ runs, links }` of a page, boxes in the pixels of the page rendered at `longSide`. */
    pageText(page, longSide) {
      if (!checkPage(page)) { return Promise.reject(new Error(`Page ${page} is not in this document`)) }
      return enqueue(() => call({ kind: 'text', page, longSide }, `Page ${page}`), { priority: PRIORITY.page })
    },
    /** `{ buffer, width, height }` of the page as PNG, its longer side `longSide` pixels. */
    async render(page, longSide, { priority = PRIORITY.thumb, signal = null } = {}) {
      if (!checkPage(page)) { throw new Error(`Page ${page} is not in this document`) }
      const result = await enqueue(() => call({ kind: 'render', page, longSide }, `Page ${page}`), { priority, signal })
      return { ...result, buffer: Buffer.from(result.buffer) }
    },
    async close() {
      closed = true
      queue.clear(new Error('The PDF renderer is closed'))
      await discardWorker()
    }
  }
}
