import { annotationHandle } from '../core/annotationHandle.js'

/**
 * Splice the annotation's handle into the end of a formatted block's first
 * line, whatever shape that line has. Every branch of formatAnnotation builds
 * its own heading, so tagging the line afterwards beats threading the handle
 * through all of them.
 */
function withHandle(formatted, id) {
  const handle = annotationHandle(id)
  if (!handle) { return formatted }
  const lineEnd = formatted.indexOf('\n')
  return `${formatted.slice(0, lineEnd)} [#${handle}]${formatted.slice(lineEnd)}`
}

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
  return `APPROVED WITH NOTES: ${count} note${count === 1 ? '' : 's'}. ` +
    'The document is approved as-is — treat the notes below as context, not as change requests.\n\n' +
    `${decision.feedback}\n`
}

/**
 * Format a single annotation as Markdown feedback.
 */
function formatAnnotation(ann, block, heading) {
  const blockStartLine = block?.startLine || 1

  // Element-level annotations (image or diagram)
  if (ann.targetType === 'image') {
    const isDeletion = ann.type === 'DELETION'
    const label = isDeletion ? 'Remove image' : 'Comment on image'
    let output = `${heading} ${label} (Line ${blockStartLine})\n`
    output += `Image: \`${ann.originalText}\`\n`
    if (ann.imageAlt) { output += `Alt text: "${ann.imageAlt}"\n` }
    if (ann.imageSrc) { output += `Source: ${ann.imageSrc}\n` }
    if (isDeletion) {
      output += `> User wants this image removed from the document.\n`
    } else {
      output += `> ${(ann.text ?? '').replace(/\n/g, '\n> ')}\n`
    }
    return output + '\n'
  }

  if (ann.targetType === 'math') {
    const isDeletion = ann.type === 'DELETION'
    const label = isDeletion ? 'Remove formula' : 'Comment on formula'
    let output = `${heading} ${label} (Line ${blockStartLine})\n`
    output += `\`\`\`latex\n${block?.content || ann.originalText}\n\`\`\`\n`
    if (isDeletion) {
      output += `> User wants this formula removed from the document.\n`
    } else {
      output += `> ${(ann.text ?? '').replace(/\n/g, '\n> ')}\n`
    }
    return output + '\n'
  }

  if (ann.targetType === 'pinpoint') {
    const isDeletion = ann.type === 'DELETION'
    const label = isDeletion ? 'Remove block' : 'Comment on block'
    let output = `${heading} ${label} (Line ${blockStartLine})\n`
    const preview = (block?.content || ann.originalText || '').slice(0, 200)
    output += `\`\`\`\n${preview}\n\`\`\`\n`
    if (isDeletion) {
      output += `> User wants this block removed from the document.\n`
    } else {
      output += `> ${(ann.text ?? '').replace(/\n/g, '\n> ')}\n`
    }
    return output + '\n'
  }

  if (ann.targetType === 'token') {
    const isDeletion = ann.type === 'DELETION'
    const label = isDeletion ? 'Remove token' : 'Comment on token'
    const lineOffset = (block?.content || '').slice(0, ann.startOffset).split('\n').length - 1
    const tokenLine = blockStartLine + lineOffset
    let output = `${heading} ${label} (Line ${tokenLine})\n`
    output += `Token: \`${ann.originalText}\`\n`
    if (isDeletion) {
      output += `> User wants this token removed.\n`
    } else {
      output += `> ${(ann.text ?? '').replace(/\n/g, '\n> ')}\n`
    }
    return output + '\n'
  }

  if (ann.targetType === 'diagram') {
    const isDeletion = ann.type === 'DELETION'
    const diagramLang = block?.language === 'plantuml' ? 'PlantUML' : 'Mermaid'
    const fence = block?.language === 'plantuml' ? 'plantuml' : 'mermaid'
    const label = isDeletion ? `Remove ${diagramLang} diagram` : `Comment on ${diagramLang} diagram`
    let output = `${heading} ${label} (Line ${blockStartLine})\n`
    output += `\`\`\`${fence}\n${block?.content || ann.originalText}\n\`\`\`\n`
    if (isDeletion) {
      output += `> User wants this diagram removed from the document.\n`
    } else {
      output += `> ${(ann.text ?? '').replace(/\n/g, '\n> ')}\n`
    }
    return output + '\n'
  }

  // Source view annotations — blockId is "source-line-N" (0-indexed)
  if (ann.targetType === 'source') {
    const lineMatch = ann.blockId?.match(/^source-line-(\d+)$/)
    const startLine = lineMatch ? parseInt(lineMatch[1], 10) + 1 : 1
    const newlinesInSelection = (ann.originalText.match(/\n/g) || []).length
    const endLine = startLine + newlinesInSelection
    const lineRef = startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}-${endLine}`

    let output = `${heading} `
    if (ann.type === 'DELETION') {
      output += `Remove this (${lineRef}, source)\n`
      output += `\`\`\`\n${ann.originalText}\n\`\`\`\n`
      output += `> User wants this removed from the document.\n`
    } else if (ann.type === 'COMMENT') {
      output += `Comment on (${lineRef}, source)\n`
      output += `\`\`\`\n${ann.originalText}\n\`\`\`\n`
      output += `> ${(ann.text ?? '').replace(/\n/g, '\n> ')}\n`
    }
    return output + '\n'
  }

  const blockContent = block?.content || ''
  const textBeforeSelection = blockContent.slice(0, ann.startOffset)
  const linesBeforeSelection = (textBeforeSelection.match(/\n/g) || []).length
  const startLine = blockStartLine + linesBeforeSelection
  const newlinesInSelection = (ann.originalText.match(/\n/g) || []).length
  const endLine = startLine + newlinesInSelection
  const lineRef = startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}-${endLine}`

  let output = `${heading} `

  if (ann.type === 'DELETION') {
    output += `Remove this (${lineRef})\n`
    output += `\`\`\`\n${ann.originalText}\n\`\`\`\n`
    output += `> User wants this removed from the document.\n`
  } else if (ann.type === 'COMMENT') {
    const labelTag = ann.label ? ` [${ann.label.emoji} ${ann.label.text}]` : ''
    output += `Comment on (${lineRef})${labelTag}\n`
    output += `\`\`\`\n${ann.originalText}\n\`\`\`\n`
    output += `> ${(ann.text ?? '').replace(/\n/g, '\n> ')}\n`
  } else if (ann.type === 'INSERTION') {
    output += `Insert text (${lineRef})\n`
    if (ann.afterContext) {
      output += `After: \`${ann.afterContext}\`\n`
    }
    output += `\`\`\`\n${ann.text ?? ''}\n\`\`\`\n`
    output += `> User wants this text inserted at this point in the document.\n`
  }

  return output + '\n'
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

/**
 * Format annotations from multiple files as readable Markdown feedback.
 * Single file delegates to exportFeedback. Multi-file groups by file.
 */
export function exportMultiFileFeedback(files) {
  // Exclude NOTES (read-only AI notes) from feedback
  const filesFiltered = files.map(f => ({
    ...f,
    annotations: (f.annotations || []).filter(a => a.type !== 'NOTES')
  }))
  const filesWithAnnotations = filesFiltered.filter(f => f.annotations.length > 0)

  if (filesWithAnnotations.length === 0) {
    return 'No annotations.'
  }

  if (filesWithAnnotations.length === 1) {
    return exportFeedback(filesWithAnnotations[0].annotations, filesWithAnnotations[0].blocks)
  }

  const totalCount = filesWithAnnotations.reduce((sum, f) => sum + f.annotations.length, 0)
  let output = `# Annotation Feedback\n\n`
  output += `${totalCount} annotation${totalCount > 1 ? 's' : ''} across ${filesWithAnnotations.length} file${filesWithAnnotations.length > 1 ? 's' : ''}:\n\n`

  let globalIndex = 1
  for (const file of filesWithAnnotations) {
    output += `---\n\n## File: ${file.path}\n\n`
    const sorted = sortAnnotations(file.annotations, file.blocks)
    const globalComments = sorted.filter(a => a.targetType === 'global')
    const regularAnnotations = sorted.filter(a => a.targetType !== 'global')

    if (globalComments.length > 0) {
      output += `### General Feedback\n\n`
      globalComments.forEach(ann => {
        output += formatGlobalComment(ann, '####')
      })
    }

    for (const ann of regularAnnotations) {
      const block = file.blocks.find(blk => blk.id === ann.blockId)
      output += withHandle(formatAnnotation(ann, block, `### ${globalIndex}.`), ann.id)
      globalIndex++
    }
  }

  output += '---\n'
  return output
}

/**
 * Format annotations as readable Markdown feedback for Claude.
 */
export function exportFeedback(annotations, blocks) {
  // Exclude NOTES (read-only AI notes) from feedback
  const filtered = annotations.filter(a => a.type !== 'NOTES')

  if (filtered.length === 0) {
    return 'No annotations.'
  }

  const sorted = sortAnnotations(filtered, blocks)
  const globalComments = sorted.filter(a => a.targetType === 'global')
  const regularAnnotations = sorted.filter(a => a.targetType !== 'global')

  let output = `# Annotation Feedback\n\n`
  output += `${filtered.length} annotation${filtered.length > 1 ? 's' : ''}:\n\n`

  if (globalComments.length > 0) {
    output += `## General Feedback\n\n`
    globalComments.forEach(ann => {
      output += formatGlobalComment(ann, '###')
    })
  }

  regularAnnotations.forEach((ann, index) => {
    const block = blocks.find(blk => blk.id === ann.blockId)
    output += withHandle(formatAnnotation(ann, block, `## ${index + 1}.`), ann.id)
  })

  output += '---\n'
  return output
}
