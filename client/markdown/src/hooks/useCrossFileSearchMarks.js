import { useEffect } from 'react'
import { highlightMatches, setActiveMatch, clearSearchHighlights } from '../utils/searchHighlight.js'

// Sync DOM highlighting with cross-file search query on the current page
export function useCrossFileSearchMarks(containerRef, crossFileSearch) {
  const query = crossFileSearch?.query

  useEffect(() => {
    const container = containerRef.current
    if (!crossFileSearch) { return }

    // Clear previous cross-file highlights
    clearSearchHighlights(container)

    if (!query || !container) { return }

    const timer = setTimeout(() => {
      const marks = highlightMatches(container, query)
      if (marks.length > 0) {
        setActiveMatch(marks, 0)
      }
    }, 200)

    return () => {
      clearTimeout(timer)
      clearSearchHighlights(container)
    }
  }, [query, containerRef, crossFileSearch])
}
