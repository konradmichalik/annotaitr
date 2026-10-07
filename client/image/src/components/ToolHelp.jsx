import { KeyCap } from '../../../shared/components/KeyCap.jsx'

const BACK = <>, <KeyCap>Esc</KeyCap> back to Select</>

const HELP = {
  element: (isDocument) => <>Element: click {isDocument ? 'a text block or link' : 'a page element'} to annotate it{BACK}</>,
  text: () => <>Text: drag from the first to the last word you mean{BACK}</>,
  box: () => <>Box: drag around an area{BACK}</>,
  arrow: () => <>Arrow: drag from where it starts to what it points at{BACK}</>,
  freehand: () => <>Freehand: draw with the pointer{BACK}</>,
  highlighter: () => <>Highlighter: drag across what to mark{BACK}</>,
  pin: () => <>Pin: click to place a numbered comment{BACK}</>
}

/** The status bar's help for the active tool, with its keys as key caps. */
export default function ToolHelp({ tool, isVideo, isDocument }) {
  if (HELP[tool]) { return HELP[tool](isDocument) }
  if (isVideo) {
    return <><KeyCap>Space</KeyCap> play, <KeyCap>←</KeyCap><KeyCap>→</KeyCap> one frame, <KeyCap>I</KeyCap><KeyCap>O</KeyCap> span in and out</>
  }
  if (isDocument) {
    return <>Select: click a mark to edit it. <KeyCap>[</KeyCap><KeyCap>]</KeyCap> switch pages, <KeyCap>Home</KeyCap><KeyCap>End</KeyCap> first and last</>
  }
  return <>Select: click a mark to edit it, drag to move, <KeyCap>Delete</KeyCap> removes it. <KeyCap>R</KeyCap><KeyCap>A</KeyCap><KeyCap>C</KeyCap> pick a tool</>
}
