import { describe, it, expect } from 'vitest'
import { buildFileTree, filterFileTree } from '../../../client/markdown/src/utils/fileTree.js'

const file = (path) => ({ path })
const shape = (nodes) => nodes.map((n) => (n.type === 'folder' ? { [n.name]: shape(n.children) } : n.name))

describe('buildFileTree', () => {
  it('nests files in their folders in the order the paths come in', () => {
    const tree = buildFileTree(['Configuration/Services.yaml', 'src/Controller/A.php', 'src/Controller/B.php', 'README.md'].map(file))
    expect(shape(tree)).toEqual([
      { Configuration: ['Services.yaml'] },
      { 'src/Controller': ['A.php', 'B.php'] },
      'README.md'
    ])
  })

  it('joins a chain of single-child folders into one row', () => {
    const tree = buildFileTree(['src/Domain/Repository/FacetRepository.php', 'src/Controller/A.php'].map(file))
    expect(shape(tree)).toEqual([{ src: [{ 'Domain/Repository': ['FacetRepository.php'] }, { Controller: ['A.php'] }] }])
  })

  it('keeps the file entry on its leaf', () => {
    const entry = { path: 'a/b.js', status: 'A' }
    expect(buildFileTree([entry])[0].children[0].file).toBe(entry)
  })
})

describe('filterFileTree', () => {
  const tree = buildFileTree(['src/a/One.php', 'src/b/Two.php', 'docs/three.md'].map(file))

  it('keeps matching files and the folders above them, case-insensitively', () => {
    expect(shape(filterFileTree(tree, 'two'))).toEqual([{ src: [{ b: ['Two.php'] }] }])
  })

  it('returns the tree unchanged for an empty query', () => {
    expect(filterFileTree(tree, '  ')).toBe(tree)
  })
})
