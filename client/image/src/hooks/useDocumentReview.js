import { useCallback, useEffect, useMemo, useState } from 'react'
import { orderDocumentAnnotations, nextNumberOnPage, pageAnnotationCounts, stepPage, isPaged } from '../utils/documentPages.js'
import { readError } from '../utils/readError.js'

const NO_PAGES = []
const NO_TEXT = { elements: [], words: [] }

/**
 * Everything the annotation UI needs to know about pages of a PDF: which
 * page is shown, numbering across the document, which annotations belong
 * on the page, and the page stamped onto a new annotation. For anything but
 * a document it passes the annotations through untouched.
 */
export function useDocumentReview({ meta, annotations }) {
  const isDocument = meta?.kind === 'document'
  const pages = isDocument ? meta.pages : NO_PAGES
  const [selected, setSelected] = useState(null)
  const [pageError, setPageError] = useState(null)
  const [loadedPage, setLoadedPage] = useState(null)
  // The page's text layer: elements to outline and name, words to select.
  const [text, setText] = useState({ page: null, ...NO_TEXT })
  const current = selected ?? pages[0]?.number ?? null
  const currentPage = pages.find((p) => p.number === current) ?? null

  const ordered = useMemo(
    () => (isDocument ? orderDocumentAnnotations(annotations) : annotations),
    [isDocument, annotations]
  )
  const numbers = useMemo(() => new Map(ordered.map((a, index) => [a.id, index + 1])), [ordered])
  const numberFor = useCallback((annotation) => numbers.get(annotation.id), [numbers])
  const counts = useMemo(() => pageAnnotationCounts(annotations), [annotations])

  const visible = isDocument ? ordered.filter((a) => a.page === current && a.type !== 'comment') : annotations
  const nextNumber = isDocument ? nextNumberOnPage(ordered, current) : annotations.length + 1

  const goTo = useCallback((page) => {
    setSelected(page)
    setPageError(null)
  }, [])
  const step = useCallback((delta) => goTo(stepPage(pages, current, delta)), [goTo, pages, current])
  const takePage = useCallback(() => (isDocument ? { page: current } : {}), [isDocument, current])
  const seekTo = useCallback((annotation) => {
    if (isDocument && isPaged(annotation)) { goTo(annotation.page) }
  }, [isDocument, goTo])

  const imageUrl = isDocument && current ? `/api/pages/${current}/image` : null
  const loading = isDocument && loadedPage !== current && pageError?.page !== current
  const markLoaded = useCallback(() => setLoadedPage(current), [current])

  // Once the page shown has arrived, the next one is fetched in the
  // background, so reading forward finds it already rendered on the server
  // and in the browser cache.
  const nextPage = isDocument ? stepPage(pages, current, 1) : null
  useEffect(() => {
    if (loadedPage === null || loadedPage !== current || nextPage === current) { return }
    new Image().src = `/api/pages/${nextPage}/image?prefetch=1`
  }, [loadedPage, current, nextPage])

  // Fetched for the page shown; an answer for a page already left behind is dropped.
  useEffect(() => {
    if (!isDocument || current === null) { return }
    let wanted = true
    fetch(`/api/pages/${current}/elements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => { if (wanted) { setText({ page: current, ...NO_TEXT, ...r?.data }) } })
      .catch(() => {})
    return () => { wanted = false }
  }, [isDocument, current])
  const pageText = text.page === current ? text : NO_TEXT

  // An <img> only learns that loading failed, so ask again for the reason.
  const reportImageError = useCallback(async () => {
    const page = current
    let message = 'the page could not be loaded'
    try {
      const res = await fetch(`/api/pages/${page}/image`)
      if (!res.ok) { message = await readError(res) }
    } catch (error) {
      message = error.message
    }
    setPageError({ page, message })
  }, [current])

  return {
    isDocument, pages, current, currentPage, ordered, numberFor, counts, visible, nextNumber, imageUrl, loading, markLoaded,
    elements: pageText.elements, words: pageText.words, textLoaded: text.page === current,
    pageError: pageError?.page === current ? pageError.message : null,
    goTo, step, takePage, seekTo, reportImageError
  }
}
