import { useRef } from 'react'
import { DoneScreen } from '../../../shared/components/DoneScreen.jsx'
import { intentOf, isGeneral } from '../../../shared/utils/intents.js'
import { noteType } from '../../../shared/utils/noteTypes.js'
import { AnnotationShape, ArrowMarkers } from './AnnotationShapes.jsx'
import { feedbackMarkdown } from '../utils/feedbackMarkdown.js'
import { serializeAnnotations } from '../utils/exportImport.js'
import { exportFileName } from '../utils/exportFile.js'
import { rasterize, download } from '../utils/snapshot.js'

function noteRow(annotation) {
  return {
    id: annotation.id,
    number: isGeneral(annotation) ? null : annotation.number,
    intent: intentOf(annotation),
    text: annotation.text || noteType(annotation).shape
  }
}

/** The marks of the image last shown, kept off screen so their computed colours can be painted into a PNG. */
function SnapshotLayer({ snapshot, svgRef }) {
  return (
    <svg ref={svgRef} className="snapshot-layer" aria-hidden="true" viewBox={`0 0 ${snapshot.width} ${snapshot.height}`} width={snapshot.width} height={snapshot.height}>
      <defs><ArrowMarkers annotations={snapshot.marks} /></defs>
      {snapshot.marks.map((annotation) => (
        <AnnotationShape key={annotation.id} annotation={annotation} number={annotation.number} markerId={`arrowhead-${annotation.id}`} />
      ))}
    </svg>
  )
}

/**
 * The image modes' done page. When the session is gone the notes can still
 * be copied, saved and exported: everything here runs in the browser, since
 * the server that would render the image has stopped. `snapshot` is the
 * image last shown with its marks (`{ image, width, height, marks, noun }`),
 * null for a recording.
 */
export default function ImageDoneScreen({ outcome, annotations, replies, origin, target, locate, snapshot, countdown, onKeepOpen, reconnecting }) {
  const svgRef = useRef(null)
  const gone = outcome === 'gone'
  const name = exportFileName(target).replace(/\.png$/, '')
  const actions = gone ? [
    {
      label: 'Copy as Markdown',
      done: 'Copied as Markdown',
      run: () => navigator.clipboard.writeText(feedbackMarkdown(annotations, { target, locate }))
    },
    snapshot && {
      label: `Save annotated ${snapshot.noun}`,
      done: `Annotated ${snapshot.noun} saved`,
      run: async () => {
        if (!snapshot.image) { throw new Error(`the ${snapshot.noun} is no longer loaded`) }
        download(await rasterize(snapshot.image, svgRef.current), `${name}.png`)
      }
    },
    {
      label: 'Export JSON',
      done: 'Exported as JSON',
      run: async () => download(new Blob([serializeAnnotations(annotations)], { type: 'application/json' }), `${name}.json`)
    }
  ].filter(Boolean) : []

  return (
    <>
      <DoneScreen
        outcome={outcome}
        origin={origin}
        target={target}
        notes={annotations.map(noteRow)}
        replies={replies}
        countdown={countdown}
        onKeepOpen={onKeepOpen}
        actions={actions}
        reconnecting={reconnecting}
      />
      {gone && snapshot && <SnapshotLayer snapshot={snapshot} svgRef={svgRef} />}
    </>
  )
}
