/**
 * The changed files as a folder tree, like the files view of a pull request.
 * Folders keep the order in which their first file arrives, and a chain of
 * folders that each hold only one folder becomes a single row (`Domain/Repository`).
 */

function insert(nodes, parts, file, prefix) {
  const [head, ...rest] = parts
  if (rest.length === 0) {
    return [...nodes, { type: 'file', name: head, path: file.path, file }]
  }
  const folderPath = prefix ? `${prefix}/${head}` : head
  const index = nodes.findIndex((n) => n.type === 'folder' && n.name === head)
  if (index === -1) {
    return [...nodes, { type: 'folder', name: head, path: folderPath, children: insert([], rest, file, folderPath) }]
  }
  const folder = nodes[index]
  const updated = { ...folder, children: insert(folder.children, rest, file, folderPath) }
  return nodes.map((n, i) => (i === index ? updated : n))
}

function joinSingleFolders(node) {
  if (node.type !== 'folder') { return node }
  const children = node.children.map(joinSingleFolders)
  if (children.length === 1 && children[0].type === 'folder') {
    const only = children[0]
    return { ...only, name: `${node.name}/${only.name}` }
  }
  return { ...node, children }
}

export function buildFileTree(files) {
  const nested = files.reduce((nodes, file) => insert(nodes, file.path.split('/'), file, ''), [])
  return nested.map(joinSingleFolders)
}

/** The files whose path contains `query`, with the folders above them. */
export function filterFileTree(nodes, query) {
  const needle = query.trim().toLowerCase()
  if (!needle) { return nodes }
  return nodes.flatMap((node) => {
    if (node.type === 'file') { return node.path.toLowerCase().includes(needle) ? [node] : [] }
    const children = filterFileTree(node.children, query)
    return children.length > 0 ? [{ ...node, children }] : []
  })
}

/**
 * A file or folder name in pieces, split where a line break reads well:
 * before an inner capital (`Changed|Files|Panel`), before `.`, `-` and `_` and after `/`.
 */
export function nameParts(name) {
  return name.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=\/)|(?=[._-])/).filter(Boolean)
}

export const TREE_INDENT = 10
export const FOLDER_PAD = 4
export const FILE_PAD = 22

const CHAR_WIDTH = 7.4
const FILE_CHROME = FILE_PAD + 14 + 6 + 96
const FOLDER_CHROME = FOLDER_PAD + 12 + 15 + 12

/**
 * The panel width at which the longest row fits on one line, estimated from the
 * monospace name length, the indent and the room the status and counts take.
 */
export function fitTreeWidth(nodes, indent, depth = 0) {
  return nodes.reduce((widest, node) => {
    const chrome = node.type === 'file' ? FILE_CHROME : FOLDER_CHROME
    const own = chrome + depth * indent + node.name.length * CHAR_WIDTH
    const below = node.type === 'folder' ? fitTreeWidth(node.children, indent, depth + 1) : 0
    return Math.max(widest, own, below)
  }, 0)
}
