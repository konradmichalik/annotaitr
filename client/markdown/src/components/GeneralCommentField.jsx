import { useState } from 'react'
import { useFileAutocomplete } from '../hooks/useFileAutocomplete.js'
import { FileAutocomplete } from './FileAutocomplete.jsx'
import { TextareaBackdrop } from './TextareaBackdrop.jsx'

/** The general comment's field in markdown mode, with file references completed after `@`. */
export function GeneralCommentField({ id, value, setValue, onKeyDown, inputRef }) {
  const [cursorPos, setCursorPos] = useState(value.length)
  const autocomplete = useFileAutocomplete(value, cursorPos)
  const accept = (index) => autocomplete.applyAccept(index, setValue, setCursorPos, inputRef)

  return (
    <div className="panel-global-edit" style={{ position: 'relative' }}>
      <div className="textarea-backdrop-wrap">
        <TextareaBackdrop value={value} textareaRef={inputRef} />
        <textarea
          id={id}
          ref={inputRef}
          className="panel-global-textarea"
          value={value}
          aria-expanded={autocomplete.isOpen}
          aria-autocomplete="list"
          onChange={(event) => {
            setValue(event.target.value)
            setCursorPos(event.target.selectionStart)
          }}
          onSelect={(event) => setCursorPos(event.target.selectionStart)}
          onKeyDown={(event) => {
            const action = autocomplete.handleKeyDown(event)
            if (action === 'accept') {
              accept()
              return
            }
            if (action) { return }
            onKeyDown(event)
          }}
          placeholder="What should the agent know about this file?"
        />
      </div>
      {autocomplete.isOpen && (
        <FileAutocomplete items={autocomplete.items} activeIndex={autocomplete.activeIndex} onSelect={accept} />
      )}
    </div>
  )
}
