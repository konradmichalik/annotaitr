import { useEffect } from 'react'

const carriesFiles = (event) => Boolean(event.dataTransfer?.types?.includes('Files'))

/**
 * A file dropped anywhere but the comment box would make the browser open it in
 * place of the review. Refuse it there; a drop zone that takes it prevents the
 * default first, so it is left alone.
 */
export function useStrayDropGuard() {
  useEffect(() => {
    const refuseDrag = (event) => {
      if (!carriesFiles(event) || event.defaultPrevented) { return }
      event.preventDefault()
      event.dataTransfer.dropEffect = 'none'
    }
    const refuseDrop = (event) => {
      if (carriesFiles(event) && !event.defaultPrevented) { event.preventDefault() }
    }
    window.addEventListener('dragover', refuseDrag)
    window.addEventListener('drop', refuseDrop)
    return () => {
      window.removeEventListener('dragover', refuseDrag)
      window.removeEventListener('drop', refuseDrop)
    }
  }, [])
}
