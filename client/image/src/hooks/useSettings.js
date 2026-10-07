import { DEFAULT_ANNOTATION_COLOR } from '../utils/annotationColors.js'
import { useSettings as useStoredSettings, SHARED_DEFAULTS } from '../../../shared/hooks/useSettings.js'

const DEFAULTS = {
  ...SHARED_DEFAULTS,
  colorMode: 'intent',
  fixedColor: DEFAULT_ANNOTATION_COLOR
}

export function useSettings() {
  return useStoredSettings('img-annotator-settings', DEFAULTS)
}
