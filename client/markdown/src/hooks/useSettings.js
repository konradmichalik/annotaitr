import { useEffect } from 'react'
import { useSettings as useStoredSettings } from '../../../shared/hooks/useSettings.js'
import { SHARED_DEFAULTS } from '../../../shared/utils/settings.js'

const DEFAULTS = {
  ...SHARED_DEFAULTS,
  contentWidth: 900,
  fontSize: 15,
  defaultMode: 'select',
  keepDrafts: true,
  // The view a markdown file's card in a changes walkthrough opens in, until one is picked for it.
  changesView: 'diff',
}

export function useSettings() {
  const stored = useStoredSettings('md-annotator-settings', DEFAULTS)
  const { contentWidth, fontSize } = stored.settings

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--content-max-width', `${contentWidth}px`)
    root.style.setProperty('--base-font-size', `${fontSize}px`)
  }, [contentWidth, fontSize])

  return stored
}
