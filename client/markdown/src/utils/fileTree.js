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
