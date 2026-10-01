import { useEffect, useRef } from 'react'

/** Mounts a player's own <video> or <canvas> element, which lives outside React. */
export default function MediaSlot({ element, label }) {
  const slotRef = useRef(null)

  useEffect(() => {
    const slot = slotRef.current
    element.setAttribute('aria-label', label)
    element.classList.add('media-slot-element')
    slot.appendChild(element)
    return () => { if (element.parentNode === slot) { slot.removeChild(element) } }
  }, [element, label])

  return <div ref={slotRef} className="media-slot" />
}
