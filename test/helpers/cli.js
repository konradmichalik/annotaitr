import { spawn } from 'node:child_process'
import { join } from 'node:path'

/**
 * Run the CLI on a free port without opening a browser. `url` resolves
 * once the server is up (or rejects if the CLI exits first), `exited` with
 * the exit code, and `stdout()` returns everything printed so far.
 */
export function startCli(args, env = {}, { cwd = process.cwd() } = {}) {
  const child = spawn('node', [join(process.cwd(), 'index.js'), ...args], {
    cwd,
    env: { ...process.env, ANNOTAITR_PORT: '0', ANNOTAITR_NO_OPEN: '1', ...env }
  })
  let stdout = ''
  child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
  const url = new Promise((resolve, reject) => {
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      const match = stderr.match(/Server running at (http:\/\/\S+)/)
      if (match) { resolve(match[1]) }
    })
    child.on('exit', (code) => reject(new Error(`CLI exited early with code ${code}: ${stderr}`)))
  })
  const exited = new Promise((resolve) => child.on('exit', resolve))
  return { child, url, exited, stdout: () => stdout }
}
