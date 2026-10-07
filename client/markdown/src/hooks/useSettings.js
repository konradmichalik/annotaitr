import { useEffect } from 'react'
import { useSettings as useStoredSettings } from '../../../shared/hooks/useSettings.js'
import { SHARED_DEFAULTS } from '../../../shared/utils/settings.js'

const DEFAULTS = {
  ...SHARED_DEFAULTS,
  contentWidth: 900,
  fontSize: 15,
  defaultMode: 'select',
  keepDrafts: true,
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
