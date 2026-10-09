import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { parseMarkdownToBlocks } from '../utils/parser.js'
import { initialAnnotationState } from '../state/annotationReducer.js'
import { filesReducer } from '../state/filesReducer.js'

function parseBlocks(file) {
  return parseMarkdownToBlocks(file.content, { allowFrontmatter: !file.isPlainText })
}

function toReviewFile(data) {
  return {
    index: data.index,
    path: data.path,
    content: data.content,
    blocks: parseBlocks(data),
    contentHash: data.contentHash,
    hashMismatch: data.hashMismatch || false,
    isPlainText: data.isPlainText || false,
    kind: data.kind || 'document'
  }
}

function resolveRelativePath(fromFilePath, relativePath) {
  const dir = fromFilePath.replace(/[^/]*$/, '')
  const segments = (dir + relativePath.replace(/^\.\//, '')).split('/')
  const resolved = []
  for (const seg of segments) {
    if (seg === '..') { resolved.pop() }
    else if (seg && seg !== '.') { resolved.push(seg) }
  }
  return resolved.join('/')
}

/**
 * The files under review: initial load with their saved annotations, opening linked
 * files as new tabs and reloading the active file after it changed on disk.
 */
export function useReviewFiles({ viewerRef, setStatus, setErrorStatus }) {
  const [files, filesDispatch] = useReducer(filesReducer, [])
  const [activeFileIndex, setActiveFileIndex] = useState(0)
  const [origin, setOrigin] = useState('cli')
  const [serverConfig, setServerConfig] = useState({})
  const filesRef = useRef(files)
  filesRef.current = files
  const activeFilePath = files[activeFileIndex]?.path || ''

  const loadFiles = useCallback(async () => {
    try {
      setStatus('Loading...')

      const res = await fetch('/api/files')
      const json = await res.json()

      if (json.success) {
        const loadedFiles = json.data.files.map(toReviewFile)
        filesDispatch({ type: 'INIT_FILES', files: loadedFiles })
        setOrigin(json.data.origin || 'cli')
        if (json.data.config) { setServerConfig(json.data.config) }
        setStatus('')
        return loadedFiles
      } else {
        setErrorStatus('Error: ' + json.error)
      }
    } catch (err) {
      setErrorStatus('Error: ' + err.message)
    }
    return null
  }, [setStatus, setErrorStatus])

  const loadAnnotations = useCallback(async (loadedFiles) => {
    for (let i = 0; i < loadedFiles.length; i++) {
      try {
        const res = await fetch(`/api/annotations?fileIndex=${i}`)
        const json = await res.json()
        if (json.success && json.data.annotations.length > 0) {
          if (json.data.contentHash === loadedFiles[i].contentHash) {
            filesDispatch({
              type: 'ANN',
              fileIndex: i,
              annAction: { type: 'RESTORE', annotations: json.data.annotations }
            })
            // Restore highlights only for initial active file
            if (i === 0) {
              setTimeout(() => {
                viewerRef.current?.restoreHighlights(json.data.annotations)
              }, 100)
            }
          } else {
            filesDispatch({
              type: 'UPDATE_FILE',
              fileIndex: i,
              updates: { hashMismatch: true }
            })
          }
        }
      } catch (_err) {
        // Silent failure - persistence is best-effort
      }
    }
  }, [viewerRef])

  useEffect(() => {
    loadFiles().then(loaded => {
      if (loaded) {loadAnnotations(loaded)}
    })
  }, [loadFiles, loadAnnotations])

  const openFile = useCallback(async (relativePath) => {
    const pathOnly = relativePath.split(/[?#]/)[0]
    const resolvedPath = resolveRelativePath(activeFilePath, pathOnly)

    const existingIndex = filesRef.current.findIndex(f =>
      f.path.replace(/^\.\//, '') === resolvedPath
    )
    if (existingIndex !== -1) {
      setActiveFileIndex(existingIndex)
      return
    }

    try {
      const params = new URLSearchParams({ path: pathOnly, relativeTo: activeFilePath })
      const res = await fetch(`/api/file/open?${params}`)
      const json = await res.json()
      if (json.success) {
        // A directory link resolves to its index document, so dedupe on the real path
        const openIndex = filesRef.current.findIndex(f => f.path === json.data.path)
        if (openIndex !== -1) {
          setActiveFileIndex(openIndex)
          return
        }
        filesDispatch({ type: 'ADD_FILE', file: toReviewFile(json.data) })
        setActiveFileIndex(filesRef.current.length)
      } else {
        setErrorStatus(`Could not open file: ${json.error}`)
      }
    } catch (err) {
      setErrorStatus(`Error opening file: ${err.message}`)
    }
  }, [activeFilePath, setErrorStatus])

  const reloadActiveFile = useCallback(async () => {
    try {
      const res = await fetch('/api/files')
      const json = await res.json()
      if (json.success) {
        const updated = json.data.files.find(f => f.path === activeFilePath)
        if (updated) {
          filesDispatch({
            type: 'UPDATE_FILE',
            fileIndex: activeFileIndex,
            updates: {
              content: updated.content,
              blocks: parseBlocks(updated),
              contentHash: updated.contentHash,
              hashMismatch: false,
              annState: { ...initialAnnotationState }
            }
          })
          viewerRef.current?.clearAllHighlights()
        }
      }
    } catch (err) {
      setErrorStatus('Error reloading: ' + err.message)
    }
  }, [activeFilePath, activeFileIndex, viewerRef, setErrorStatus])

  return {
    files,
    filesDispatch,
    activeFileIndex,
    setActiveFileIndex,
    origin,
    serverConfig,
    openFile,
    reloadActiveFile,
  }
}
