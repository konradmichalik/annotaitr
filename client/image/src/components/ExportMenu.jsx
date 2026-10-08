import { PanelMenu } from '../../../shared/components/PanelMenu.jsx'
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
const imageBlob = (annotations, page, index) => postAnnotations(`/api/annotated-image?index=${index}`, annotations, page ? { page } : {}).then((res) => res.blob())

async function copyImage(annotations, page, index) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('this browser cannot copy images, use Save image instead')
  }
  // The promise goes into the ClipboardItem as is: Safari only allows the
  // write while the click that started it is still being handled.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob(annotations, page, index) })])
}

async function saveImage(annotations, target, page, index) {
  const url = URL.createObjectURL(await imageBlob(annotations, page, index))
  const link = document.createElement('a')
  link.href = url
  link.download = exportFileName(target)
  link.click()
  // Firefox can drop a download whose URL is revoked in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function copyText(annotations, index) {
  const text = postAnnotations(`/api/feedback-text?index=${index}`, annotations).then((res) => res.json()).then(({ data }) => data.text)
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    await navigator.clipboard.writeText(await text)
    return
  }
  // As with the image: Safari refuses a write that only starts after the fetch.
  await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((value) => new Blob([value], { type: 'text/plain' })) })])
}

/**
 * Copy or save what the annotator shows, for a ticket or a colleague, plus
 * the JSON export/import. `imageActions` is off for recordings, which have
 * no single image to hand over. A PDF passes the `page` shown, which is the
 * image its image actions hand over. A set of images passes the `index` of
 * the image shown.
 */
export default function ExportMenu({ annotations, target, imageActions, page = null, index = 0, onOpenJson, onDone }) {
  const run = (action, success) => async () => {
    try {
      await action()
      onDone(success)
    } catch (error) {
      onDone(`Could not export: ${error.message}`)
    }
  }
  const noun = page ? 'page' : 'image'
  const items = [
    imageActions && { id: 'copy-image', icon: EXPORT_ICONS.copyImage, label: `Copy annotated ${noun}`, onClick: run(() => copyImage(annotations, page, index), `Annotated ${noun} copied`) },
    imageActions && { id: 'save-image', icon: EXPORT_ICONS.saveImage, label: `Save annotated ${noun}`, onClick: run(() => saveImage(annotations, target, page, index), `Annotated ${noun} saved`) },
    imageActions && { id: 'copy-text', icon: EXPORT_ICONS.copyText, label: 'Copy feedback as Markdown', disabled: annotations.length === 0, onClick: run(() => copyText(annotations, index), 'Feedback copied as Markdown') },
    { id: 'json', icon: EXPORT_ICONS.json, label: 'Export / import annotations (JSON)', separated: imageActions, onClick: onOpenJson }
  ].filter(Boolean)

  return <PanelMenu items={items} />
}
