/**
 * Express bootstrap shared by both annotator modes: pre-built single-file
 * client bundle, health check, heartbeat-based disconnect detection, and the
 * approve/feedback decision promise. Mode-specific state and API routes are
 * supplied by the caller via `mountRoutes`; this module owns none of it.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import express from 'express'
import { config } from './config.js'

const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::'])

/**
 * Whether a request's Host header names this server. A web page the user
 * has open elsewhere can point a hostname it controls at 127.0.0.1 (DNS
 * rebinding) and then talk to the annotator as same-origin, reading the
 * target and submitting a decision. Its Host header still carries that
 * foreign name, so only loopback names and the bind host are let through.
 * Binding to every interface is an explicit opt-in to network access, so
 * there the name is not checked.
 */
export function isAllowedHost(hostHeader, port, bindHost) {
  if (WILDCARD_HOSTS.has(bindHost)) { return true }
  // A browser leaves the port out for HTTP's default port 80 (RFC 9110).
  const match = hostHeader?.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/)
  if (!match || Number(match[2] ?? 80) !== port) { return false }
  const name = match[1].toLowerCase()
  const bindName = bindHost.includes(':') ? `[${bindHost}]` : bindHost
  return LOOPBACK_NAMES.has(name) || name === bindName.toLowerCase()
}

/**
 * Bind to the first free port in `candidates`. The listen error must be
 * observed. Without a handler an occupied port leaves the promise pending
 * and the CLI hangs instead of reporting the conflict.
 */
async function listenOnFirstFreePort(app, candidates, host) {
  let lastError
  for (const candidate of candidates) {
    try {
      return await new Promise((resolve, reject) => {
        const s = app.listen(candidate, host, () => resolve(s))
        s.once('error', reject)
      })
    } catch (error) {
      if (error.code !== 'EADDRINUSE') { throw error }
      lastError = error
    }
  }
  if (candidates.length === 1) { throw lastError }
  throw new Error(`No free port in ${candidates[0]}-${candidates.at(-1)} on ${host}`)
}

/**
 * @param {Object} options
 * @param {string} [options.bundleDir] - directory holding the built client's index.html
 *   (falls back to serving the directory as static files in dev, when unbuilt).
 *   Ignored when `htmlContent` is given.
 * @param {string} [options.htmlContent] - pre-loaded HTML to serve at `/` directly,
 *   instead of reading `bundleDir`. Used by apps/opencode, which bundles its own
 *   copy of the client HTML alongside the plugin rather than shipping client/dist.
 * @param {string[]} [options.staticDirs] - extra directories served as static assets
 *   (markdown mode serves each annotated file's directory plus cwd, for relative
 *   images; image mode needs none)
 * @param {(app: import('express').Express, ctx: { safeResolve: Function }) => void} options.mountRoutes
 *   mounts the mode-specific API router; receives `safeResolve` to resolve the
 *   decision promise exactly once
 * @param {Function} [options.onReady] - (url, port) => void
 */
export async function startAnnotatorServer({ bundleDir, htmlContent = null, staticDirs = [], mountRoutes, onReady = null }) {
  let preloadedHtml = htmlContent
  if (!preloadedHtml) {
    const distIndex = join(bundleDir, 'index.html')
    preloadedHtml = existsSync(distIndex) ? readFileSync(distIndex, 'utf-8') : null
  }

  const app = express()
  // No CORS: the client is always served from this same origin, and any
  // cross-origin access would let other pages read the target or submit.
  app.use((req, res, next) => {
    if (isAllowedHost(req.headers.host, req.socket.localPort, config.host)) { return next() }
    res.status(403).json({ success: false, error: 'Forbidden host' })
  })
  app.use(express.json({ limit: config.jsonLimit }))

  if (preloadedHtml) {
    app.get('/', (_req, res) => { res.type('html').send(preloadedHtml) })
  } else {
    // Fallback: serve from disk (dev mode without a built index.html)
    app.use(express.static(bundleDir))
  }

  const servedDirs = new Set()
  for (const dir of staticDirs) {
    if (servedDirs.has(dir)) { continue }
    servedDirs.add(dir)
    app.use(express.static(dir))
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // Client heartbeat — detect browser tab close
  let lastHeartbeat = 0
  let heartbeatReceived = false
  app.post('/api/heartbeat', (_req, res) => {
    lastHeartbeat = Date.now()
    heartbeatReceived = true
    res.json({ status: 'ok' })
  })

  // Decision promise with guard against double resolution
  let resolveDecision
  let decided = false
  const decisionPromise = new Promise((resolve) => {
    resolveDecision = resolve
  })
  function safeResolve(value) {
    if (decided) { return }
    decided = true
    resolveDecision(value)
  }

  mountRoutes(app, { safeResolve })

  // Start server — port 0 lets the OS assign a free port instantly; an
  // explicit ANNOTAITR_PORT may name a single port or a range to walk.
  const candidates = config.portExplicit ? config.ports : [0]
  const server = await listenOnFirstFreePort(app, candidates, config.host)

  const port = server.address().port
  // Match the URL host to the actual bind host to avoid IPv4/IPv6 resolution
  // mismatches (e.g. 'localhost' resolving to ::1 when we only listen on 127.0.0.1).
  const urlHost = config.host === '::1' ? '[::1]' : config.host
  const url = `http://${urlHost}:${port}`

  if (onReady) {
    onReady(url, port)
  }

  // Heartbeat monitor — resolve as disconnected if client goes silent
  const heartbeatInterval = setInterval(() => {
    if (heartbeatReceived && Date.now() - lastHeartbeat > config.heartbeatTimeoutMs) {
      clearInterval(heartbeatInterval)
      safeResolve({ disconnected: true })
    }
  }, 5000)
  heartbeatInterval.unref()

  function stop() {
    clearInterval(heartbeatInterval)
    server.close()
  }

  return {
    port,
    url,
    waitForDecision: () => decisionPromise,
    stop,
  }
}
