// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { collectRawElements, CANDIDATES, PANEL_CANDIDATES, CONTAINERS } from '../../../../server/image/common/domMap.js'

// jsdom has no layout, so every element gets the same visible box.
beforeAll(() => {
  Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 })
  Element.prototype.checkVisibility = () => true
})

beforeEach(() => {
  document.body.innerHTML = '<button type="button" id="save">Save</button>'
  delete window.ng
})

function sourceOfButton() {
  const options = { candidates: CANDIDATES, fallbacks: PANEL_CANDIDATES, minPanelSide: 40, limit: 10, containers: [...CONTAINERS, 'div'] }
  return collectRawElements(options).find((el) => el.self.id === 'save').source
}

const button = () => document.getElementById('save')
const stack = (...frames) => ({ stack: ['Error: react-stack-top-frame', ...frames.map((f) => `    at ${f}`)].join('\n') })

describe('collectRawElements dev-build source', () => {
  it('reports nothing for a plain page', () => {
    expect(sourceOfButton()).toBeNull()
  })

  it('reads the React 18 owner and _debugSource', () => {
    function SubmitButton() {}
    button().__reactFiber$abc123 = {
      type: 'button',
      _debugOwner: { type: SubmitButton },
      _debugSource: { fileName: '/work/app/src/Button.jsx', lineNumber: 6, columnNumber: 5 }
    }
    expect(sourceOfButton()).toEqual({ name: 'SubmitButton', file: '/work/app/src/Button.jsx', line: 6 })
  })

  it('reads the first app frame of the React 19 _debugStack, skipping React and Vite internals', () => {
    button().__reactFiber$x9 = {
      type: 'button',
      _debugOwner: { type: { displayName: 'SubmitButton' } },
      _debugStack: stack(
        'exports.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:250:12)',
        'SubmitButton (http://localhost:5173/src/Button.jsx?t=1700:7:26)',
        'App (http://localhost:5173/src/App.jsx:9:3)'
      )
    }
    expect(sourceOfButton()).toEqual({ name: 'SubmitButton', url: 'http://localhost:5173/src/Button.jsx?t=1700', line: 7, column: 26 })
  })

  it('falls back to the nearest function component when there is no _debugOwner', () => {
    function Toolbar() {}
    button().__reactFiber$x9 = {
      type: 'button',
      return: { type: 'div', return: { type: Toolbar } },
      _debugSource: { fileName: 'src/Toolbar.jsx', lineNumber: 3 }
    }
    expect(sourceOfButton()).toMatchObject({ name: 'Toolbar', file: 'src/Toolbar.jsx', line: 3 })
  })

  it('reports nothing for a production React build, even with a minified component name', () => {
    function ud() {}
    button().__reactFiber$x9 = { type: 'button', _debugOwner: null, return: { type: ud } }
    expect(sourceOfButton()).toBeNull()
  })

  it('reads the Vue component of the element or its nearest ancestor, only with a dev __file', () => {
    document.body.innerHTML = '<section><button type="button" id="save">Save</button></section>'
    document.querySelector('section').__vueParentComponent = { type: { __name: 'SubmitButton', __file: '/work/app/src/SubmitButton.vue' } }
    expect(sourceOfButton()).toEqual({ name: 'SubmitButton', file: '/work/app/src/SubmitButton.vue' })
    document.querySelector('section').__vueParentComponent = { type: { name: 'ud' } }
    expect(sourceOfButton()).toBeNull()
  })

  it('reads the Svelte location', () => {
    button().__svelte_meta = { loc: { file: 'src/SubmitButton.svelte', line: 2, column: 0 } }
    expect(sourceOfButton()).toEqual({ name: '', file: 'src/SubmitButton.svelte', line: 2 })
  })

  it('names the owning Angular component when the dev-mode ng global is there', () => {
    class SaveBarComponent {}
    window.ng = { getOwningComponent: () => new SaveBarComponent() }
    expect(sourceOfButton()).toEqual({ name: 'SaveBarComponent', file: '' })
  })

  it('survives a page whose debug fields throw', () => {
    Object.defineProperty(button(), '__svelte_meta', { get() { throw new Error('nope') } })
    expect(sourceOfButton()).toBeNull()
  })
})
