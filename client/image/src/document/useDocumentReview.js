import { useCallback, useEffect, useMemo, useState } from 'react'
import { orderDocumentAnnotations, pageAnnotationCounts, stepPage, isPaged } from './documentPages.js'
import { readLastPage, rememberLastPage } from './lastPage.js'
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
  const hash = isDocument ? meta.documentHash : null
  // A reload of the same PDF opens where the reviewer left off.
  const restored = useMemo(() => (isDocument ? readLastPage(hash, pages) : null), [isDocument, hash, pages])
  const current = selected ?? restored ?? pages[0]?.number ?? null
  const currentPage = pages.find((p) => p.number === current) ?? null

  const ordered = useMemo(
    () => (isDocument ? orderDocumentAnnotations(annotations) : annotations),
    [isDocument, annotations]
  )
  const counts = useMemo(() => pageAnnotationCounts(annotations), [annotations])

  const visible = isDocument ? ordered.filter((a) => a.page === current && a.type !== 'comment') : annotations

  const goTo = useCallback((page) => {
    setSelected(page)
    setPageError(null)
  }, [])
  const step = useCallback((delta) => goTo(stepPage(pages, current, delta)), [goTo, pages, current])
  const takePage = useCallback(() => (isDocument ? { page: current } : {}), [isDocument, current])
  const seekTo = useCallback((annotation) => {
    if (isDocument && isPaged(annotation)) { goTo(annotation.page) }
  }, [isDocument, goTo])

  useEffect(() => {
    if (hash && current !== null) { rememberLastPage(hash, current) }
  }, [hash, current])

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
    isDocument, pages, current, currentPage, ordered, counts, visible, imageUrl, loading, markLoaded,
    elements: pageText.elements, words: pageText.words, textLoaded: text.page === current,
    pageError: pageError?.page === current ? pageError.message : null,
    goTo, step, takePage, seekTo, reportImageError
  }
}
