import { DEFAULT_ANNOTATION_COLOR } from '../utils/annotationColors.js'
import { useSettings as useStoredSettings } from '../../../shared/hooks/useSettings.js'
import { SHARED_DEFAULTS } from '../../../shared/utils/settings.js'

const DEFAULTS = {
  ...SHARED_DEFAULTS,
  colorMode: 'intent',
  fixedColor: DEFAULT_ANNOTATION_COLOR
}

export function useSettings() {
  return useStoredSettings('img-annotator-settings', DEFAULTS)
}
