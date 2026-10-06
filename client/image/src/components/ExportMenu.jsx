import { useEffect, useRef } from 'react'
import { useDropdown } from '../hooks/useDropdown.js'
import { EXPORT_ICONS } from '../utils/icons.jsx'
import { exportFileName } from '../utils/exportFile.js'

function postAnnotations(path, annotations, extra = {}) {
  return fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ annotations, ...extra })
  }).then((res) => {
    if (!res.ok) { throw new Error(`the server answered ${res.status}`) }
    return res
  })
}

// A PDF has one image per page, so it names the page to render.
const imageBlob = (annotations, page) => postAnnotations('/api/annotated-image', annotations, page ? { page } : {}).then((res) => res.blob())

async function copyImage(annotations, page) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('this browser cannot copy images, use Save image instead')
  }
  // The promise goes into the ClipboardItem as is: Safari only allows the
  // write while the click that started it is still being handled.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob(annotations, page) })])
}

async function saveImage(annotations, target, page) {
  const url = URL.createObjectURL(await imageBlob(annotations, page))
  const link = document.createElement('a')
  link.href = url
  link.download = exportFileName(target)
  link.click()
  // Firefox can drop a download whose URL is revoked in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function copyText(annotations) {
  const text = postAnnotations('/api/feedback-text', annotations).then((res) => res.json()).then(({ data }) => data.text)
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    await navigator.clipboard.writeText(await text)
    return
  }
  // As with the image: Safari refuses a write that only starts after the fetch.
  await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((value) => new Blob([value], { type: 'text/plain' })) })])
}

const MENU_KEYS = { ArrowDown: 1, ArrowUp: -1 }

/** Arrow keys, Home and End move between the menu's enabled items, wrapping around. */
function moveFocus(event, list) {
  const items = [...list.querySelectorAll('[role="menuitem"]:not(:disabled)')]
  const index = items.indexOf(document.activeElement)
  let next = null
  if (event.key in MENU_KEYS) { next = (index + MENU_KEYS[event.key] + items.length) % items.length }
  if (event.key === 'Home') { next = 0 }
  if (event.key === 'End') { next = items.length - 1 }
  if (next === null) { return }
  event.preventDefault()
  items[next]?.focus()
}

/** Focus the first item when the menu opens, and the trigger again when it closes. */
function useMenuFocus(open, listRef, triggerRef) {
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) { listRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus() }
    if (!open && wasOpen.current) { triggerRef.current?.focus() }
    wasOpen.current = open
  }, [open, listRef, triggerRef])
}

/**
 * Copy or save what the annotator shows, for a ticket or a colleague, plus
 * the JSON export/import. `imageActions` is off for recordings, which have
 * no single image to hand over. A PDF passes the `page` shown, which is the
 * image its image actions hand over.
 */
export default function ExportMenu({ annotations, target, imageActions, page = null, onOpenJson, onDone }) {
  const { open, setOpen, toggle, wrapperRef } = useDropdown()
  const listRef = useRef(null)
  const triggerRef = useRef(null)
  useMenuFocus(open, listRef, triggerRef)
  const run = (action, success) => async () => {
    setOpen(false)
    try {
      await action()
      onDone(success)
    } catch (error) {
      onDone(`Could not export: ${error.message}`)
    }
  }
  const noun = page ? 'page' : 'image'
  const items = [
    imageActions && { id: 'copy-image', icon: EXPORT_ICONS.copyImage, label: `Copy annotated ${noun}`, onClick: run(() => copyImage(annotations, page), `Annotated ${noun} copied`) },
    imageActions && { id: 'save-image', icon: EXPORT_ICONS.saveImage, label: `Save annotated ${noun}`, onClick: run(() => saveImage(annotations, target, page), `Annotated ${noun} saved`) },
    imageActions && { id: 'copy-text', icon: EXPORT_ICONS.copyText, label: 'Copy feedback as Markdown', disabled: annotations.length === 0, onClick: run(() => copyText(annotations), 'Feedback copied as Markdown') },
    { id: 'json', icon: EXPORT_ICONS.json, label: 'Export / import annotations (JSON)', separated: imageActions, onClick: () => { setOpen(false); onOpenJson() } }
  ].filter(Boolean)

  return (
    <div className="export-menu" ref={wrapperRef}>
      <button
        ref={triggerRef} type="button" className="panel-icon-btn" onClick={toggle}
        title="Copy, save or export" aria-label="Export" aria-haspopup="menu" aria-expanded={open}
      >
        {EXPORT_ICONS.saveImage}
      </button>
      {open && (
        <div ref={listRef} className="export-menu-list" role="menu" aria-label="Export" onKeyDown={(event) => moveFocus(event, listRef.current)}>
          {items.map(({ id, icon, label, disabled, separated, onClick }) => (
            <button
              key={id} type="button" role="menuitem" disabled={disabled} onClick={onClick}
              className={`export-menu-item${separated ? ' export-menu-item--separated' : ''}`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
