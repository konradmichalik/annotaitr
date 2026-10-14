import { createServer } from 'node:http'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { symbolicateSources } from '../../../../server/image/still/sourceMap.js'

// Generated line 7, column 26 (1-based) maps to Button.jsx line 6.
const BUTTON_MAP = { version: 3, sources: ['Button.jsx'], names: [], mappings: ';;;;;;yBAKI' }
// Generated line 9, column 3 (1-based) maps to App.jsx line 4.
const APP_MAP = { version: 3, sources: ['App.jsx'], names: [], mappings: ';;;;;;;;EAGA' }
const inline = (map) => `//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}`
// A route is a body, or a function that answers the request itself.
const ROUTES = {
  '/src/Button.jsx': `export function SubmitButton() {}\n${inline(BUTTON_MAP)}\n`,
  '/src/App.jsx': 'export function App() {}\n//# sourceMappingURL=App.jsx.map\n',
  '/src/App.jsx.map': JSON.stringify(APP_MAP),
  '/src/NoMap.jsx': 'export function Plain() {}\n',
  '/src/Foreign.jsx': () => `export function Foreign() {}\n//# sourceMappingURL=${other.origin}/src/App.jsx.map\n`,
  '/src/Moved.jsx': (res) => { res.writeHead(302, { Location: '/src/Button.jsx' }); res.end() },
  '/src/Hang.jsx': (res) => { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.write('export {}\n') }
}

async function serve() {
  const state = { requests: [] }
  state.server = createServer((req, res) => {
    state.requests = [...state.requests, req.url]
    const route = ROUTES[req.url.split('?')[0]]
    if (typeof route === 'function' && route.length > 0) { route(res); return }
    const body = typeof route === 'function' ? route() : route
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'text/javascript' })
    res.end(body ?? '')
  })
  await new Promise((resolve) => state.server.listen(0, '127.0.0.1', resolve))
  state.origin = `http://127.0.0.1:${state.server.address().port}`
  return state
}

function stop({ server }) {
  server.closeAllConnections()
  return new Promise((resolve) => server.close(resolve))
}

let page
let other
let origin

beforeAll(async () => {
  page = await serve()
  other = await serve()
  origin = page.origin
})

afterAll(() => Promise.all([stop(page), stop(other)]))

beforeEach(() => {
  page.requests = []
  other.requests = []
})

const requests = () => page.requests

const element = (source) => ({ tag: 'button', source })

describe('symbolicateSources', () => {
  it('maps a React 19 stack frame through the inline source map of its script', async () => {
    const raw = [element({ name: 'SubmitButton', url: `${origin}/src/Button.jsx?t=1700`, line: 7, column: 26 })]
    const [mapped] = await symbolicateSources(raw, `${origin}/`)
    expect(mapped.source).toEqual({ name: 'SubmitButton', file: `${origin}/src/Button.jsx`, line: 6 })
    expect(raw[0].source.url).toBe(`${origin}/src/Button.jsx?t=1700`)
  })

  it('follows a same-origin external map and fetches every script and map only once', async () => {
    const frame = { name: 'App', url: `${origin}/src/App.jsx`, line: 9, column: 3 }
    const mapped = await symbolicateSources([element(frame), element(frame)], `${origin}/`)
    expect(mapped.map((el) => el.source)).toEqual([
      { name: 'App', file: `${origin}/src/App.jsx`, line: 4 },
      { name: 'App', file: `${origin}/src/App.jsx`, line: 4 }
    ])
    expect(requests()).toEqual(['/src/App.jsx', '/src/App.jsx.map'])
  })

  it('never fetches a script from another origin and keeps only the name', async () => {
    const raw = [element({ name: 'SubmitButton', url: `${other.origin}/src/Button.jsx`, line: 7, column: 26 })]
    const [mapped] = await symbolicateSources(raw, `${origin}/`)
    expect(mapped.source).toEqual({ name: 'SubmitButton' })
    expect(other.requests).toEqual([])
    expect(requests()).toEqual([])
  })

  it('never fetches a source map from another origin', async () => {
    const [mapped] = await symbolicateSources([element({ name: 'App', url: `${origin}/src/Foreign.jsx`, line: 9, column: 3 })], `${origin}/`)
    expect(mapped.source).toEqual({ name: 'App' })
    expect(requests()).toEqual(['/src/Foreign.jsx'])
    expect(other.requests).toEqual([])
  })

  it('does not follow a redirect, which could leave the page origin', async () => {
    const [mapped] = await symbolicateSources([element({ name: 'SubmitButton', url: `${origin}/src/Moved.jsx`, line: 7, column: 26 })], `${origin}/`)
    expect(mapped.source).toEqual({ name: 'SubmitButton' })
    expect(requests()).toEqual(['/src/Moved.jsx'])
  })

  it('gives up on a script that does not finish within the time budget', async () => {
    const started = performance.now()
    const [mapped] = await symbolicateSources([element({ name: 'Slow', url: `${origin}/src/Hang.jsx`, line: 1, column: 1 })], `${origin}/`, { timeoutMs: 200 })
    expect(mapped.source).toEqual({ name: 'Slow' })
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('keeps only the name when the script has no source map', async () => {
    const [mapped] = await symbolicateSources([element({ name: 'Plain', url: `${origin}/src/NoMap.jsx`, line: 1, column: 1 })], `${origin}/`)
    expect(mapped.source).toEqual({ name: 'Plain' })
  })

  it('stops fetching once the script budget is spent', async () => {
    const raw = [
      element({ name: 'SubmitButton', url: `${origin}/src/Button.jsx`, line: 7, column: 26 }),
      element({ name: 'App', url: `${origin}/src/App.jsx`, line: 9, column: 3 })
    ]
    const mapped = await symbolicateSources(raw, `${origin}/`, { maxScripts: 1 })
    expect(mapped.map((el) => el.source.file ?? null)).toEqual([`${origin}/src/Button.jsx`, null])
    expect(requests()).toEqual(['/src/Button.jsx'])
  })

  it('gives up on a script larger than the byte budget', async () => {
    const raw = [element({ name: 'SubmitButton', url: `${origin}/src/Button.jsx`, line: 7, column: 26 })]
    const [mapped] = await symbolicateSources(raw, `${origin}/`, { maxBytes: 20 })
    expect(mapped.source).toEqual({ name: 'SubmitButton' })
  })

  it('leaves elements without a stack frame untouched and fetches nothing', async () => {
    const raw = [element(null), element({ name: 'Card', file: '/work/app/src/Card.jsx', line: 3 })]
    expect(await symbolicateSources(raw, `${origin}/`)).toEqual(raw)
    expect(requests()).toEqual([])
  })
})
