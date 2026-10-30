import { createContext } from 'react'

/**
 * What the changes view offers a `path:line` in the agent's text: `find(text)`
 * for the first reference to a changed file, `diffOf(path)` for the preview and
 * `jump(path)`. Without a provider, as in an ordinary document or in the
 * rendered content of a file, such text stays text.
 */
export const FileRefsContext = createContext(null)
