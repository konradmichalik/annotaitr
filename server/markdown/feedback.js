import { annotationHandle } from '../core/annotationHandle.js'
import { normalizeNotes, intentWord, intentCounts } from '../core/notes.js'

/**
 * Format an approval decision for stdout.
 *
 * A plain approval means the document is fine as-is. An approval that carries
 * annotations keeps them as notes: the user still approved the document, so the
 * notes are context for the agent rather than a list of edits to apply.
 */
export function formatApprovalOutput(decision) {
  if (!decision.feedback) {
    return 'APPROVED: No changes requested.\n'
  }
  const count = decision.annotationCount
  const intents = decision.intents ? ` (${decision.intents})` : ''
  return `APPROVED WITH NOTES: ${count} note${count === 1 ? '' : 's'}${intents}. ` +
    'The document is approved as-is — treat the notes below as context, not as change requests.\n\n' +
    `${decision.feedback}\n`
}

const quoted = (text) => `> ${(text ?? '').replace(/\n/g, '\n> ')}\n`

const lineRefOf = (startLine, endLine) => (startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}-${endLine}`)

const DIAGRAM_NAMES = { plantuml: 'PlantUML diagram' }

/** The element a note points at, as named in its heading, and what a removal of it says. */
const ELEMENTS = {
  image: { name: () => 'Image', removed: 'image' },
  math: { name: () => 'Formula', removed: 'formula' },
  pinpoint: { name: () => 'Block', removed: 'block' },
  diagram: { name: (block) => DIAGRAM_NAMES[block?.language] ?? 'Mermaid diagram', removed: 'diagram' }
}

function elementBody(ann, block) {
  if (ann.targetType === 'image') {
    let output = `Image: \`${ann.originalText}\`\n`
    if (ann.imageAlt) { output += `Alt text: "${ann.imageAlt}"\n` }
    if (ann.imageSrc) { output += `Source: ${ann.imageSrc}\n` }
    return output
  }
  if (ann.targetType === 'math') { return `\`\`\`latex\n${block?.content || ann.originalText}\n\`\`\`\n` }
  if (ann.targetType === 'diagram') {
    const fence = block?.language === 'plantuml' ? 'plantuml' : 'mermaid'
    return `\`\`\`${fence}\n${block?.content || ann.originalText}\n\`\`\`\n`
  }
  return `\`\`\`\n${(block?.content || ann.originalText || '').slice(0, 200)}\n\`\`\`\n`
}

/** What the heading names and where it is, plus the body under the heading. */
function describeAnnotation(ann, block) {
  const blockStartLine = block?.startLine || 1
  const element = ELEMENTS[ann.targetType]
  if (element) {
    const body = elementBody(ann, block) + (ann.type === 'DELETION'
      ? `> User wants this ${element.removed} removed from the document.\n`
      : quoted(ann.text))
    return { what: element.name(block), where: `Line ${blockStartLine}`, body }
  }

  if (ann.targetType === 'token') {
    const lineOffset = (block?.content || '').slice(0, ann.startOffset).split('\n').length - 1
    const body = `Token: \`${ann.originalText}\`\n` + (ann.type === 'DELETION' ? '> User wants this token removed.\n' : quoted(ann.text))
    return { what: 'Token', where: `Line ${blockStartLine + lineOffset}`, body }
  }

  // A source view note's blockId is "source-line-N" (0-indexed); any other selection counts lines inside its block.
  const sourceMatch = ann.targetType === 'source' ? ann.blockId?.match(/^source-line-(\d+)$/) : null
  const startLine = ann.targetType === 'source'
    ? (sourceMatch ? parseInt(sourceMatch[1], 10) + 1 : 1)
    : blockStartLine + ((block?.content || '').slice(0, ann.startOffset).match(/\n/g) || []).length
  const endLine = startLine + ((ann.originalText ?? '').match(/\n/g) || []).length
  const where = `${lineRefOf(startLine, endLine)}${ann.targetType === 'source' ? ', source' : ''}`

  if (ann.type === 'INSERTION') {
    const after = ann.afterContext ? `After: \`${ann.afterContext}\`\n` : ''
    return {
      what: 'Insertion', where,
      body: `${after}\`\`\`\n${ann.text ?? ''}\n\`\`\`\n> User wants this text inserted at this point in the document.\n`
    }
  }
  const selection = `\`\`\`\n${ann.originalText}\n\`\`\`\n`
  if (ann.type === 'DELETION') { return { what: 'Text', where, body: `${selection}> User wants this removed from the document.\n` } }
  const labelTag = ann.label && ann.targetType !== 'source' ? ` [${ann.label.emoji} ${ann.label.text}]` : ''
  return { what: 'Text', where, tag: labelTag, body: selection + quoted(ann.text) }
}

/**
 * One numbered note: `## 3. Question · Text (Line 7)`, the handle at the end
 * of the heading, then the quoted selection and the comment. The number is
 * the one the note kept for the whole round, so it can have gaps.
 */
function formatAnnotation(ann, block, level) {
  const { what, where, tag = '', body } = describeAnnotation(ann, block)
  const handle = annotationHandle(ann.id)
  const handleTag = handle ? ` [#${handle}]` : ''
  return `${level} ${ann.number}. ${intentWord(ann.intent)} · ${what} (${where})${tag}${handleTag}\n${body}\n`
}

/**
 * A global comment is not tied to a selection, so it has no line reference to
 * put in a heading. It still needs one: without it there is nowhere to carry
 * the handle, and an agent cannot address the comment across rounds.
 */
function formatGlobalComment(ann, heading) {
  const handle = annotationHandle(ann.id)
  const handleTag = handle ? ` [#${handle}]` : ''
  return `${heading} General comment${handleTag}\n> ${(ann.text ?? '').replace(/\n/g, '\n> ')}\n\n`
}

function getBlockOrder(blockId, blocks) {
  const sourceMatch = blockId?.match(/^source-line-(\d+)$/)
  if (sourceMatch) { return parseInt(sourceMatch[1], 10) + 1 }
  const block = blocks.find(blk => blk.id === blockId)
  if (block?.startLine) { return block.startLine }
  return Infinity
}

function sortAnnotations(annotations, blocks) {
  return [...annotations].sort((a, b) => {
    const blockA = getBlockOrder(a.blockId, blocks)
    const blockB = getBlockOrder(b.blockId, blocks)
    if (blockA !== blockB) {return blockA - blockB}
    return a.startOffset - b.startOffset
  })
}

// Agent notes (read-only, from the last round) never go back to the agent.
const reviewerNotes = (annotations) => (annotations || []).filter(a => a.type !== 'NOTES')

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * The notes of every file in document order, each with its intent and the
 * number it kept for the round. Numbers run across files; a note from before
 * numbers were stored gets the next free one in document order.
 */
function numberedFiles(files) {
  const sorted = files.map(f => ({ ...f, annotations: sortAnnotations(reviewerNotes(f.annotations), f.blocks || []) }))
  const notes = normalizeNotes(sorted.flatMap(f => f.annotations))
  let offset = 0
  return sorted.map((f) => {
    const own = notes.slice(offset, offset + f.annotations.length)
    offset += f.annotations.length
    return { ...f, annotations: own }
  })
}

/** "2 Change, 1 Question": the notes of every file by intent, for the approval line. */
export function intentSummary(files) {
  return intentCounts(files.flatMap(f => reviewerNotes(f.annotations)))
}

function formatFileNotes(annotations, blocks, level) {
  const general = annotations.filter(a => a.targetType === 'global')
  const numbered = annotations.filter(a => a.targetType !== 'global')
  let output = ''
  if (general.length > 0) {
    output += `${level} General Feedback\n\n`
    general.forEach(ann => { output += formatGlobalComment(ann, `${level}#`) })
  }
  for (const ann of numbered) {
    output += formatAnnotation(ann, blocks.find(blk => blk.id === ann.blockId), level)
  }
  return output
}

/**
 * Format annotations from multiple files as readable Markdown feedback.
 * Single file delegates to exportFeedback. Multi-file groups by file.
 */
export function exportMultiFileFeedback(files) {
  const annotated = numberedFiles(files).filter(f => f.annotations.length > 0)
  if (annotated.length === 0) {
    return 'No annotations.'
  }
  if (annotated.length === 1) {
    return exportFeedback(annotated[0].annotations, annotated[0].blocks)
  }

  const all = annotated.flatMap(f => f.annotations)
  let output = `# Annotation Feedback\n\n`
  output += `${plural(all.length, 'annotation')} (${intentCounts(all)}) across ${plural(annotated.length, 'file')}:\n\n`
  for (const file of annotated) {
    output += `---\n\n## File: ${file.path}\n\n${formatFileNotes(file.annotations, file.blocks, '###')}`
  }
  return output + '---\n'
}

/**
 * Format annotations as readable Markdown feedback for Claude.
 */
export function exportFeedback(annotations, blocks) {
  const [file] = numberedFiles([{ annotations, blocks }])
  if (file.annotations.length === 0) {
    return 'No annotations.'
  }
  return `# Annotation Feedback\n\n${plural(file.annotations.length, 'annotation')} (${intentCounts(file.annotations)}):\n\n` +
    formatFileNotes(file.annotations, blocks, '##') + '---\n'
}
