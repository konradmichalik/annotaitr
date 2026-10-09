import { MermaidBlock } from '../MermaidBlock.jsx'
import { PlantUMLBlock } from '../PlantUMLBlock.jsx'
import { KrokiBlock, KROKI_LANGUAGES } from '../KrokiBlock.jsx'
import { BlockRenderer, HtmlWrapper } from './BlockRenderer.jsx'
import { MathBlock } from './MathBlock.jsx'
import { CodeBlock } from './CodeBlock.jsx'

function ViewerBlock({ block, annotated, handlers, plantumlServerUrl, krokiServerUrl, inChangeCard = false }) {
  const { annotatedImages, annotatedDiagramBlocks, annotatedMathBlocks, noteBlockIds } = annotated
  const hasNote = noteBlockIds.has(block.id)
  const diagramProps = {
    block,
    onDiagramClick: handlers.onDiagramClick,
    annotationType: annotatedDiagramBlocks.get(block.id) || null,
    hasNote,
    onNoteClick: handlers.onNoteClick,
  }

  if (block.type === 'math') {
    return (
      <MathBlock
        block={block}
        onMathClick={handlers.onMathClick}
        annotationType={annotatedMathBlocks.get(block.id) || null}
        hasNote={hasNote}
        onNoteClick={handlers.onNoteClick}
      />
    )
  }
  if (block.type === 'code' && block.language === 'mermaid') {
    return <MermaidBlock {...diagramProps} />
  }
  if (block.type === 'code' && block.language === 'plantuml') {
    return <PlantUMLBlock {...diagramProps} serverUrl={plantumlServerUrl} />
  }
  if (block.type === 'code' && KROKI_LANGUAGES.has(block.language)) {
    return <KrokiBlock {...diagramProps} serverUrl={krokiServerUrl} />
  }
  if (block.type === 'code') {
    return (
      <CodeBlock
        block={block}
        hasNote={hasNote}
        onNoteClick={handlers.onNoteClick}
        onTokenSelect={handlers.onTokenSelect}
        showDiffHeader={!inChangeCard}
      />
    )
  }
  return (
    <BlockRenderer
      block={block}
      onImageClick={handlers.onImageClick}
      onTableAnnotate={handlers.onTableAnnotate}
      annotatedImages={annotatedImages}
      hasNote={hasNote}
      onNoteClick={handlers.onNoteClick}
    />
  )
}

/** Renders the grouped block tree, nesting blocks inside their raw HTML wrappers. */
export function ViewerBlocks({ nodes, ...blockProps }) {
  return nodes.map(node =>
    node.kind === 'wrapper' ? (
      <HtmlWrapper key={node.block.id} block={node.block}>
        <ViewerBlocks nodes={node.children} {...blockProps} />
      </HtmlWrapper>
    ) : (
      <ViewerBlock key={node.block.id} block={node.block} {...blockProps} />
    )
  )
}
