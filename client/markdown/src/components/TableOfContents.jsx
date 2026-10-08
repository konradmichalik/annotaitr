import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

/**
 * Build a map: headingBlockId → Set of blockIds that belong to that section.
 * A section spans from a heading to the next heading of equal or higher level.
 */
function buildSectionMap(blocks) {
  const headings = []
  const sectionMap = new Map()

  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type === 'heading') {
      headings.push({ index: i, id: blocks[i].id, level: blocks[i].level })
      sectionMap.set(blocks[i].id, new Set())
    }
  }

  for (let hi = 0; hi < headings.length; hi++) {
    const start = headings[hi].index + 1
    const sectionBlocks = sectionMap.get(headings[hi].id)

    for (let i = start; i < blocks.length; i++) {
      if (blocks[i].type === 'heading') {
        break
      }
      sectionBlocks.add(blocks[i].id)
    }
  }

  return sectionMap
}

/**
 * For each heading, find all descendant headings (deeper level until same/higher level).
 * Returns a map of headingId → array of descendant heading ids, a set of parent ids,
 * and a parentMap (childId → parentId) for ancestor traversal.
 */
function buildDescendantsMap(headings) {
  const descendantsMap = new Map()
  const parentSet = new Set()
  const parentMap = new Map()

  for (let i = 0; i < headings.length; i++) {
    const descendants = []
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= headings[i].level) {
        break
      }
      descendants.push(headings[j].id)
    }
    if (descendants.length > 0) {
      descendantsMap.set(headings[i].id, descendants)
      parentSet.add(headings[i].id)
    }

    // Find nearest ancestor (closest preceding heading with a lower level)
    for (let j = i - 1; j >= 0; j--) {
      if (headings[j].level < headings[i].level) {
        parentMap.set(headings[i].id, headings[j].id)
        break
      }
    }
  }

  return { descendantsMap, parentSet, parentMap }
}

/**
 * The left sidebar: with several files their overview (`filesSection`) on top,
 * then the contents of the active file with note counts per section, and
 * `footer` (Mark file as reviewed) at the bottom.
 */
export function TableOfContents({ blocks, annotations = [], collapsed, width, filesSection = null, footer = null, fileName = null }) {
  const [activeId, setActiveId] = useState(null)
  const [collapsedIds, setCollapsedIds] = useState(() => new Set())
  const observerRef = useRef(null)
  const tocRef = useRef(null)

  const hasIntro = useMemo(() => blocks.length > 0 && blocks[0].type !== 'heading', [blocks])

  const headings = useMemo(() => {
    const h = blocks.filter(b => b.type === 'heading')
    if (hasIntro && h.length > 0) {
      return [{ id: '__intro__', level: h[0].level, content: 'Introduction' }, ...h]
    }
    return h
  }, [blocks, hasIntro])

  const sectionMap = useMemo(() => {
    const map = buildSectionMap(blocks)
    if (hasIntro) {
      const introBlocks = new Set()
      for (const block of blocks) {
        if (block.type === 'heading') { break }
        introBlocks.add(block.id)
      }
      map.set('__intro__', introBlocks)
    }
    return map
  }, [blocks, hasIntro])

  const { descendantsMap, parentSet, parentMap } = useMemo(
    () => buildDescendantsMap(headings),
    [headings]
  )

  // Heading IDs hidden because an ancestor is collapsed
  const hiddenIds = useMemo(() => {
    const hidden = new Set()
    for (const id of collapsedIds) {
      const descendants = descendantsMap.get(id)
      if (descendants) {
        for (const descId of descendants) {
          hidden.add(descId)
        }
      }
    }
    return hidden
  }, [collapsedIds, descendantsMap])

  // When activeId is inside a collapsed branch, walk up to the nearest visible ancestor
  const visibleActiveId = useMemo(() => {
    if (!activeId || !hiddenIds.has(activeId)) {
      return activeId
    }
    let current = activeId
    while (current && hiddenIds.has(current)) {
      current = parentMap.get(current) ?? null
    }
    return current
  }, [activeId, hiddenIds, parentMap])

  const annotationCountPerHeading = useMemo(() => {
    if (annotations.length === 0) {
      return new Map()
    }
    const annotatedBlockIds = annotations.reduce((map, a) => {
      if (a.type === 'NOTES') {return map}
      map.set(a.blockId, (map.get(a.blockId) || 0) + 1)
      return map
    }, new Map())

    const counts = new Map()
    for (const [headingId, sectionBlockIds] of sectionMap) {
      let count = annotatedBlockIds.get(headingId) || 0
      for (const blockId of sectionBlockIds) {
        count += annotatedBlockIds.get(blockId) || 0
      }
      if (count > 0) {
        counts.set(headingId, count)
      }
    }
    return counts
  }, [sectionMap, annotations])

  // Deep counts: heading's own annotation count + all descendants' counts
  const deepAnnotationCounts = useMemo(() => {
    const deep = new Map()
    for (const [headingId, descendants] of descendantsMap) {
      let total = annotationCountPerHeading.get(headingId) || 0
      for (const descId of descendants) {
        total += annotationCountPerHeading.get(descId) || 0
      }
      if (total > 0) {
        deep.set(headingId, total)
      }
    }
    return deep
  }, [descendantsMap, annotationCountPerHeading])

  const toggleCollapse = useCallback((headingId) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(headingId)) {
        next.delete(headingId)
      } else {
        next.add(headingId)
      }
      return next
    })
  }, [])

  const collapseAll = useCallback(() => {
    setCollapsedIds(new Set(parentSet))
  }, [parentSet])

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set())
  }, [])

  useEffect(() => {
    if (collapsed || headings.length === 0) {
      return
    }

    const viewerEl = document.querySelector('.viewer-container')
    if (!viewerEl) {
      return
    }

    const introBlockId = hasIntro ? blocks[0]?.id : null

    const handleIntersect = (entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

      if (visible.length > 0) {
        const blockId = visible[0].target.getAttribute('data-block-id')
        setActiveId(blockId === introBlockId ? '__intro__' : blockId)
      }
    }

    observerRef.current = new IntersectionObserver(handleIntersect, {
      root: viewerEl,
      rootMargin: '0px 0px -70% 0px',
      threshold: 0
    })

    // Observe the first block for the intro section
    if (introBlockId) {
      const introEl = viewerEl.querySelector(`[data-block-id="${introBlockId}"]`)
      if (introEl) {
        observerRef.current.observe(introEl)
      }
    }

    headings.forEach(h => {
      if (h.id === '__intro__') {return}
      const el = viewerEl.querySelector(`[data-block-id="${h.id}"]`)
      if (el) {
        observerRef.current.observe(el)
      }
    })

    return () => {
      observerRef.current?.disconnect()
    }
  }, [collapsed, headings])

  useEffect(() => {
    if (!visibleActiveId || !tocRef.current) {
      return
    }
    const activeEl = tocRef.current.querySelector(`[data-toc-id="${visibleActiveId}"]`)
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [visibleActiveId])

  const handleClick = useCallback((blockId) => {
    const viewerEl = document.querySelector('.viewer-container')
    if (blockId === '__intro__') {
      viewerEl?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const target = viewerEl?.querySelector(`[data-block-id="${blockId}"]`)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  if (collapsed || (headings.length === 0 && !filesSection)) {
    return null
  }

  return (
    <aside className="toc-panel" ref={tocRef} style={width ? { width: `${width}px` } : undefined} aria-label="Files and contents">
      {filesSection}
      {headings.length > 0 && (
        <nav className="toc-contents" aria-label="Contents">
          <div className="toc-header">
            <h2>Contents{fileName && <span className="toc-header-file"> · {fileName}</span>}</h2>
            {parentSet.size > 0 && (
              <div className="toc-header-actions">
                <button
                  className="toc-header-btn"
                  onClick={expandAll}
                  disabled={[...parentSet].every(id => !collapsedIds.has(id))}
                  title="Expand all"
                  aria-label="Expand all sections"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
                <button
                  className="toc-header-btn"
                  onClick={collapseAll}
                  disabled={[...parentSet].every(id => collapsedIds.has(id))}
                  title="Collapse all"
                  aria-label="Collapse all sections"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          <ul className="toc-list">
            {headings.map(h => {
              const isHidden = hiddenIds.has(h.id)
              const isParent = parentSet.has(h.id)
              const isCollapsed = collapsedIds.has(h.id)
              const count = isCollapsed
                ? (deepAnnotationCounts.get(h.id) || 0)
                : (annotationCountPerHeading.get(h.id) || 0)

              return (
                <li key={h.id} className={`toc-li${isHidden ? ' toc-li--hidden' : ''}`} inert={isHidden ? true : undefined}>
                  <div className="toc-li-inner">
                    <div
                      className={`toc-row toc-row--level-${h.level}${visibleActiveId === h.id ? ' toc-row--active' : ''}`}
                      data-toc-id={h.id}
                    >
                      {isParent ? (
                        <button
                          className={`toc-toggle${isCollapsed ? '' : ' toc-toggle--expanded'}`}
                          onClick={() => toggleCollapse(h.id)}
                          aria-expanded={!isCollapsed}
                          aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${h.content}`}
                        >
                          <svg viewBox="0 0 16 16" width="10" height="10">
                            <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      ) : (
                        <span className="toc-toggle toc-toggle--placeholder" aria-hidden="true" />
                      )}
                      <button
                        className={`toc-item${count > 0 ? ' toc-item--annotated' : ''}${h.id === '__intro__' ? ' toc-item--intro' : ''}`}
                        onClick={() => handleClick(h.id)}
                        title={h.content}
                      >
                        <span className="toc-item-text">{h.content}</span>
                        {count > 0 && (
                          <span className="toc-badge">{count}</span>
                        )}
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
      {footer}
    </aside>
  )
}
