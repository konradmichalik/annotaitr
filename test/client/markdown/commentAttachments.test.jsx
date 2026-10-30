// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { CommentPopover } from '../../../client/markdown/src/components/CommentPopover.jsx'
import { withAvailableAttachments } from '../../../client/markdown/src/utils/attachments.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let anchor
let onSubmit
let onClose

const stored = (n) => ({ id: `${String(n).repeat(32)}.png`, path: `/tmp/annotaitr-attachments/${String(n).repeat(32)}.png`, name: `shot-${n}.png` })

function respondWith(...attachments) {
  const queue = [...attachments]
  globalThis.fetch = vi.fn(async (url, init) => {
    if (init?.method === 'PUT') {
      const next = queue.shift()
      return { ok: true, json: async () => ({ success: true, data: { id: next.id, path: next.path } }) }
    }
    return { ok: true, json: async () => ({ success: true, data: { files: [] } }) }
  })
}

async function render(props = {}) {
  await act(async () => {
    root.render(<CommentPopover anchorEl={anchor} onSubmit={onSubmit} onClose={onClose} {...props} />)
  })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

const popover = () => document.querySelector('.comment-popover')
const attachButton = () => popover().querySelector('button[aria-label="Attach image"]')
const fileInput = () => popover().querySelector('input[type="file"]')
const thumbnails = () => [...popover().querySelectorAll('.composer-attachment img')]
const alert = () => popover().querySelector('[role="alert"]')
const type = (text) => act(() => {
  const field = popover().querySelector('textarea')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(field, text)
  field.dispatchEvent(new Event('input', { bubbles: true }))
})
const image = (name, mime = 'image/png') => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: mime })

async function pick(...files) {
  await act(async () => {
    Object.defineProperty(fileInput(), 'files', { value: files, configurable: true })
    fileInput().dispatchEvent(new Event('change', { bubbles: true }))
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  anchor = document.createElement('span')
  document.body.append(anchor)
  root = createRoot(container)
  onSubmit = vi.fn()
  onClose = vi.fn()
  globalThis.URL.createObjectURL ??= () => 'blob:x'
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  anchor.remove()
  delete globalThis.fetch
})

describe('attaching images to a note', () => {
  it('offers an attach button in the footer that opens a picker for PNG, JPEG and WebP', async () => {
    respondWith()
    await render()
    expect(attachButton().type).toBe('button')
    expect(attachButton().closest('.composer-tools')).not.toBeNull()
    expect(fileInput().accept).toBe('image/png,image/jpeg,image/webp')
  })

  it('uploads a picked image, shows it below the field and saves it with the note', async () => {
    const one = stored(1)
    respondWith(one)
    await render()
    await pick(image('shot-1.png'))
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/attachments', expect.objectContaining({ method: 'PUT', headers: { 'Content-Type': 'image/png' } }))
    expect(thumbnails().map((img) => img.alt)).toEqual(['Attached image 1: shot-1.png'])
    expect(thumbnails()[0].getAttribute('src')).toBe(`/api/attachments/${one.id}`)
    type('Looks off')
    await act(async () => popover().querySelector('.composer-submit').click())
    expect(onSubmit).toHaveBeenCalledWith('Looks off', [{ id: one.id, path: one.path, name: 'shot-1.png' }])
  })

  it('removes an image with its own button', async () => {
    respondWith(stored(1))
    await render()
    await pick(image('shot-1.png'))
    await act(async () => popover().querySelector('button[aria-label="Remove attached image 1"]').click())
    expect(thumbnails()).toHaveLength(0)
    expect(document.activeElement).toBe(popover().querySelector('textarea'))
  })

  it('refuses an SVG without uploading it', async () => {
    respondWith()
    await render()
    await pick(image('logo.svg', 'image/svg+xml'))
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/attachments', expect.anything())
    expect(alert().textContent).toBe('Only PNG, JPEG and WebP images can be attached')
  })

  it('stops at five images per note', async () => {
    respondWith(...[1, 2, 3, 4, 5].map(stored))
    await render()
    await pick(...[1, 2, 3, 4, 5, 6].map((n) => image(`shot-${n}.png`)))
    expect(thumbnails()).toHaveLength(5)
    expect(alert().textContent).toBe('A note takes at most 5 images')
  })

  it('attaches a pasted image', async () => {
    respondWith(stored(1))
    await render()
    await act(async () => {
      const event = new Event('paste', { bubbles: true, cancelable: true })
      event.clipboardData = { files: [image('shot-1.png')] }
      popover().querySelector('textarea').dispatchEvent(event)
    })
    expect(thumbnails()).toHaveLength(1)
  })

  it('attaches a dropped image', async () => {
    respondWith(stored(1))
    await render()
    await act(async () => {
      const event = new Event('drop', { bubbles: true, cancelable: true })
      event.dataTransfer = { files: [image('shot-1.png')], types: ['Files'] }
      popover().querySelector('textarea').dispatchEvent(event)
    })
    expect(thumbnails()).toHaveLength(1)
  })

  it('keeps a composer holding only an image open on an outside click', async () => {
    respondWith(stored(1))
    await render()
    await pick(image('shot-1.png'))
    act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail: 1 })))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the images of a note being edited', async () => {
    respondWith()
    await render({ initialAttachments: [stored(2)] })
    expect(thumbnails().map((img) => img.alt)).toEqual(['Attached image 1: shot-2.png'])
  })

  it('cannot be saved while an upload is still running', async () => {
    let finish
    globalThis.fetch = vi.fn((url, init) => (init?.method === 'PUT'
      ? new Promise((resolve) => { finish = () => resolve({ ok: true, json: async () => ({ success: true, data: stored(1) }) }) })
      : Promise.resolve({ ok: true, json: async () => ({ success: true, data: { files: [] } }) })))
    await render()
    type('Looks off')
    await pick(image('shot-1.png'))
    expect(popover().querySelector('.composer-submit').disabled).toBe(true)
    expect(popover().querySelector('[role="status"]').textContent).toBe('Uploading image…')
    await act(async () => { finish() })
    expect(popover().querySelector('.composer-submit').disabled).toBe(false)
    expect(popover().querySelector('[role="status"]').textContent).toBe('1 image attached')
  })

  it('does not bring back an image removed while another one uploads', async () => {
    let finish
    globalThis.fetch = vi.fn((url, init) => (init?.method === 'PUT'
      ? new Promise((resolve) => { finish = () => resolve({ ok: true, json: async () => ({ success: true, data: stored(3) }) }) })
      : Promise.resolve({ ok: true, json: async () => ({ success: true, data: { files: [] } }) })))
    await render({ initialAttachments: [stored(2)] })
    await pick(image('shot-3.png'))
    await act(async () => popover().querySelector('button[aria-label="Remove attached image 1"]').click())
    await act(async () => { finish() })
    expect(thumbnails().map((img) => img.getAttribute('src'))).toEqual([`/api/attachments/${stored(3).id}`])
  })

  it('has no attach button where attachments are off', async () => {
    respondWith()
    await render({ attachable: false })
    expect(attachButton()).toBeNull()
  })
})

describe('withAvailableAttachments', () => {
  it('keeps an attachment the check could not reach', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    const annotations = [{ id: 'a', attachments: [stored(1)] }]
    expect(await withAvailableAttachments(annotations)).toEqual({ annotations, dropped: 0 })
  })

  it('drops attachments whose file the server no longer holds and counts them', async () => {
    globalThis.fetch = vi.fn(async (url) => ({ ok: url.includes('1111'), status: url.includes('1111') ? 200 : 404 }))
    const annotations = [{ id: 'a', attachments: [stored(1), stored(2)] }, { id: 'b' }]
    const result = await withAvailableAttachments(annotations)
    expect(result.annotations).toEqual([{ id: 'a', attachments: [stored(1)] }, { id: 'b' }])
    expect(result.dropped).toBe(1)
  })
})
