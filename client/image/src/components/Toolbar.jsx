import { Fragment } from 'react'
import { TOOL_ICONS } from '../utils/icons.jsx'
import { TOOL_KEYS } from '../utils/toolShortcuts.js'
import { Dock, DockButton, DockSeparator } from '../../../shared/components/Dock.jsx'
import { UndoIcon } from '../../../shared/components/HeaderIcons.jsx'
import ColorModePicker from './ColorModePicker.jsx'

export const TOOL_LABELS = {
  select: 'Select',
  element: 'Element',
  text: 'Text',
  box: 'Box',
  arrow: 'Arrow',
  freehand: 'Freehand',
  highlighter: 'Highlighter',
  pin: 'Pin'
}

const GROUPS = [['select', 'element', 'text'], ['box', 'arrow', 'freehand', 'highlighter'], ['pin']]

/**
 * The tools a mode offers. `elementTool` adds picking a page element, which a
 * captured web page and a PDF page with a text layer have; `textTool` adds
 * selecting text, which only a PDF page with a text layer has.
 */
export function offeredTools({ elementTool = false, textTool = false }) {
  return GROUPS.flat().filter((id) => (id !== 'element' || elementTool) && (id !== 'text' || textTool))
}

/** The dock: select tools, drawing tools, pin, then the ink colour and undo. */
export default function Toolbar({
  activeTool, onSelectTool, colorMode, fixedColor, onChangeColorMode, onChangeFixedColor, tools, onUndo, canUndo
}) {
  const groups = GROUPS.map((group) => group.filter((id) => tools.includes(id))).filter((group) => group.length > 0)
  return (
    <Dock label="Annotation tools">
      {groups.map((group, index) => (
        <Fragment key={group[0]}>
          {index > 0 && <DockSeparator />}
          {group.map((id) => (
            <DockButton
              key={id}
              label={TOOL_LABELS[id]}
              keyCap={TOOL_KEYS[id]}
              icon={TOOL_ICONS[id]}
              pressed={activeTool === id}
              onClick={() => onSelectTool(id)}
            />
          ))}
        </Fragment>
      ))}
      <DockSeparator />
      <ColorModePicker
        colorMode={colorMode}
        fixedColor={fixedColor}
        onChangeMode={onChangeColorMode}
        onChangeColor={onChangeFixedColor}
      />
      <DockButton label="Undo" keyCap={null} icon={<UndoIcon />} onClick={onUndo} disabled={!canUndo} />
    </Dock>
  )
}
