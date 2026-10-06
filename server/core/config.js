/**
 * Centralized configuration shared by both annotator modes, from environment
 * variables. Mode-specific settings live in server/image/common/config.js and
 * server/markdown/config.js instead.
 */

const DEFAULT_PORT = 3000
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000

// Guards against a spec like "1-65535" turning startup into a port scan
const MAX_PORT_CANDIDATES = 256

const warnedEnvNames = new Set()

/**
 * Read `newName`, falling back to the first of `oldNames` that is set. Each
 * old name triggers a one-time deprecation warning on stderr. The fallback
 * exists so the ANNOTAITR_* rename doesn't silently break existing
 * MD_ANNOTATOR_* setups; it is removed in a future major version.
 */
export function readEnvWithFallback(newName, oldNames = []) {
  if (process.env[newName] !== undefined) {
    return process.env[newName]
  }
  for (const oldName of oldNames) {
    if (process.env[oldName] !== undefined) {
      if (!warnedEnvNames.has(oldName)) {
        warnedEnvNames.add(oldName)
        process.stderr.write(
          `Warning: ${oldName} is deprecated, use ${newName} instead. This fallback will be removed in a future major version.\n`
        )
      }
      return process.env[oldName]
    }
  }
  return undefined
}

function isValidPort(port) {
  return Number.isInteger(port) && port > 0 && port < 65536
}

/**
 * Parse a port spec: a single port ("3000") or an inclusive range
 * ("19432-19463"). Returns the candidate ports in order, or null when the spec
 * is missing or malformed.
 */
export function parsePortSpec(spec) {
  const trimmed = typeof spec === 'string' ? spec.trim() : ''
  if (!trimmed) { return null }

  const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10)
    const end = parseInt(rangeMatch[2], 10)
    if (!isValidPort(start) || !isValidPort(end) || end < start) { return null }
    const count = Math.min(end - start + 1, MAX_PORT_CANDIDATES)
    return Array.from({ length: count }, (_, i) => start + i)
  }

  if (!/^\d+$/.test(trimmed)) { return null }
  const single = parseInt(trimmed, 10)
  return isValidPort(single) ? [single] : null
}

function getServerHost() {
  const envHost = readEnvWithFallback('ANNOTAITR_HOST', ['MD_ANNOTATOR_HOST'])
  if (envHost && envHost.trim()) {
    return envHost.trim()
  }
  return DEFAULT_HOST
}

function getHeartbeatTimeoutMs() {
  const envTimeout = readEnvWithFallback('ANNOTAITR_TIMEOUT', ['MD_ANNOTATOR_TIMEOUT'])
  if (envTimeout) {
    const parsed = parseInt(envTimeout, 10)
    if (!isNaN(parsed) && parsed >= 5000 && parsed <= 300_000) {
      return parsed
    }
  }
  return DEFAULT_HEARTBEAT_TIMEOUT_MS
}

const rawPortSpec = readEnvWithFallback('ANNOTAITR_PORT', ['MD_ANNOTATOR_PORT'])
const portCandidates = parsePortSpec(rawPortSpec)
if (rawPortSpec !== undefined && portCandidates === null) {
  process.stderr.write(
    `Warning: ignoring malformed port spec "${rawPortSpec}", falling back to ${DEFAULT_PORT}.\n`
  )
}

export const config = {
  // First candidate; `ports` carries the full range when one was configured
  port: portCandidates?.[0] ?? DEFAULT_PORT,
  ports: portCandidates ?? [DEFAULT_PORT],
  portExplicit: !!portCandidates,
  host: getServerHost(),
  browser: readEnvWithFallback('ANNOTAITR_BROWSER', ['MD_ANNOTATOR_BROWSER']) || null,
  heartbeatTimeoutMs: getHeartbeatTimeoutMs(),
  forceExitTimeoutMs: 5000,
  jsonLimit: '10mb',
}
