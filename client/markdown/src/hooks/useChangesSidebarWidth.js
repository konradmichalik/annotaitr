import { useEffect, useMemo, useState } from 'react'
import { buildFileTree, fitTreeWidth, TREE_INDENT } from '../utils/fileTree.js'
import { sidebarWidth } from '../utils/sidebarWidth.js'

function useViewportWidth() {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

/** The shown width of the changes sidebar, see `sidebarWidth`. */
export function useChangesSidebarWidth({ files, width, customized, reserved }) {
  const viewport = useViewportWidth()
  const fitted = useMemo(() => fitTreeWidth(buildFileTree(files), TREE_INDENT), [files])
  return sidebarWidth({ fitted, width, customized, viewport, reserved })
}
