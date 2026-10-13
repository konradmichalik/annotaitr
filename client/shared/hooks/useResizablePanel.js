import { useState, useCallback, useEffect, useRef } from 'react'
import { getItem, setItem } from '../utils/storage.js'

const MIN_WIDTH = 160
const MAX_WIDTH = 500

export function useResizablePanel(storageKey, defaultWidth, direction) {
  const [stored] = useState(() => {
    const raw = getItem(storageKey)
    const parsed = raw ? parseInt(raw, 10) : NaN
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, MIN_WIDTH), MAX_WIDTH) : null
  })
  const [width, setWidth] = useState(stored ?? defaultWidth)
  const [customized, setCustomized] = useState(stored !== null)

  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const widthRef = useRef(width)

  // `shownWidth` is what the panel displays when that differs from the stored width (a fitted one)
  const handleMouseDown = useCallback((e, shownWidth) => {
    e.preventDefault()
    if (shownWidth !== undefined) {
      const from = Math.min(Math.max(shownWidth, MIN_WIDTH), MAX_WIDTH)
      widthRef.current = from
      setWidth(from)
      setCustomized(true)
    }
    isDraggingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = widthRef.current
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (!isDraggingRef.current) {return}
      // direction=1 (right panel): drag left = grow. direction=-1 (left panel): drag right = grow.
      const delta = (startXRef.current - e.clientX) * direction
      const newWidth = Math.min(Math.max(startWidthRef.current + delta, MIN_WIDTH), MAX_WIDTH)
      widthRef.current = newWidth
      setWidth(newWidth)
    }

    const onUp = () => {
      if (!isDraggingRef.current) {return}
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setItem(storageKey, String(Math.round(widthRef.current)))
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)

    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [storageKey, direction])

  return { width, customized, handleMouseDown }
}
