import { Dock, DockButton, DockSeparator } from '../../../shared/components/Dock.jsx'
import { UndoIcon } from '../../../shared/components/HeaderIcons.jsx'

const SelectTextIcon = (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5h16v2M9 19h6M12 5v14" />
  </svg>
)

const PinpointIcon = (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
  </svg>
)

/**
 * The markdown dock: Select text and Pinpoint (hold Shift to switch for a
 * moment, shown by a dashed outline), the Preview and Source switch, undo.
 */
export function CanvasTopbar({ shiftHeld, pinpointMode, onPinpointModeChange, showViewToggle, viewMode, onViewModeChange, onUndo, canUndo }) {
  return (
    <div className="floating floating--bottom">
      <Dock label="Annotation mode" className={shiftHeld ? 'dock--temp' : ''}>
        <DockButton
          text label="Select text" keyCap="V" icon={SelectTextIcon}
          pressed={!pinpointMode} onClick={() => onPinpointModeChange(shiftHeld)}
        />
        <DockButton
          text label="Pinpoint" keyCap="C" icon={PinpointIcon}
          pressed={pinpointMode} onClick={() => onPinpointModeChange(!shiftHeld)}
        />
        {showViewToggle && (
          <>
            <DockSeparator />
            <div className="dock-segmented" role="group" aria-label="View">
              <DockButton text label="Preview" pressed={viewMode === 'preview'} onClick={() => onViewModeChange('preview')} />
              <DockButton text label="Source" pressed={viewMode === 'source'} onClick={() => onViewModeChange('source')} />
            </div>
          </>
        )}
        <DockSeparator />
        <DockButton label="Undo" icon={<UndoIcon />} onClick={onUndo} disabled={!canUndo} />
      </Dock>
    </div>
  )
}
