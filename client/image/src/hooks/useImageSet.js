import { useCallback, useState } from 'react'
import { readError } from '../utils/readError.js'

export const saveAnnotations = (index, annotations) => fetch(`/api/annotations?index=${index}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ annotations })
})

const getJson = (url) => fetch(url).then((res) => res.json())

/**
 * A set of images is reviewed one at a time: the canvas holds the annotations
 * of the image shown, the notes of the others wait in `stash` by index (the
 * server holds them too). `onShow({ index, meta, annotations, elements })` puts a
 * switched-to image on screen.
 */
export function useImageSet({ annotations, onShow, onError }) {
  const [imageIndex, setImageIndex] = useState(0)
  const [stash, setStash] = useState({})
  const [switching, setSwitching] = useState(false)

  // Saves what is on the canvas, then shows the image at `next` with its own notes and elements.
  const switchImage = useCallback(async (next) => {
    if (next === imageIndex || switching) { return }
    // The canvas takes no edits meanwhile, as the switch would not carry them along.
    setSwitching(true)
    try {
      const saved = await saveAnnotations(imageIndex, annotations)
      if (!saved.ok) { throw new Error(await readError(saved)) }
      const [meta, shown, elements] = await Promise.all([
        getJson(`/api/meta?index=${next}`),
        getJson(`/api/annotations?index=${next}`),
        getJson(`/api/elements?index=${next}`)
      ])
      setStash((current) => {
        const others = { ...current }
        delete others[next]
        return { ...others, [imageIndex]: annotations }
      })
      setImageIndex(next)
      onShow({ index: next, meta: meta.data, annotations: shown.data.annotations, elements: elements.data.elements })
    } catch (error) {
      onError(`Could not switch image: ${error.message}`)
    } finally {
      setSwitching(false)
    }
  }, [imageIndex, switching, annotations, onShow, onError])

  /** After a reload the server still holds the notes of the other images. */
  const restore = useCallback(async (images) => {
    const loaded = await Promise.all(images.map(async (_image, index) => [index, (await getJson(`/api/annotations?index=${index}`)).data.annotations]))
    setStash(Object.fromEntries(loaded.filter(([index, list]) => index !== 0 && list.length > 0)))
  }, [])

  /** Approving as-is drops the notes of every image, not just the one on the canvas. */
  const discardOthers = useCallback(async (images) => {
    const others = images.map((_image, index) => index).filter((index) => index !== imageIndex)
    const cleared = await Promise.all(others.map((index) => saveAnnotations(index, [])))
    if (cleared.some((res) => !res.ok)) { throw new Error('annotations of the other images were not cleared') }
    setStash({})
  }, [imageIndex])

  const stashed = Object.values(stash).flat()
  // The strip's badges: the stash by image, the canvas live.
  const counts = {
    ...Object.fromEntries(Object.entries(stash).map(([index, list]) => [index, list.length])),
    [imageIndex]: annotations.length
  }

  return { imageIndex, switching, stashed, counts, switchImage, restore, discardOthers }
}
