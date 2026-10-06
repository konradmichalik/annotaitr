import { useEffect, useState } from 'react'
import { loadVideoController, loadGifController } from './mediaControllers.js'
import { getItem, setItem } from '../../../shared/utils/storage.js'

const MUTED_KEY = 'img-annotator-muted'
const VOLUME_KEY = 'img-annotator-volume'

/**
 * Sound starts off unless the reviewer turned it on before, so a recording
 * never blares out unexpectedly. Volume and mute are remembered per viewer.
 */
function applyStoredAudio(controller) {
  const stored = getItem(VOLUME_KEY)
  const volume = Number(stored)
  if (stored !== null && Number.isFinite(volume) && volume >= 0 && volume <= 1) {
    controller.setVolume(volume)
  }
  controller.setMuted(getItem(MUTED_KEY) !== 'false')
}

function rememberAudio(state, previous) {
  if (!state.hasAudio) { return }
  if (state.muted !== previous?.muted) { setItem(MUTED_KEY, String(state.muted)) }
  if (state.volume !== previous?.volume) { setItem(VOLUME_KEY, String(state.volume)) }
}

/**
 * Load the player for a video or GIF target once /api/meta says the target
 * is one. Returns nulls for a still image, so App can call it unconditionally.
 */
export function useMediaPlayer(meta) {
  const [controller, setController] = useState(null)
  const [playerState, setPlayerState] = useState(null)
  const [error, setError] = useState(null)
  const isVideo = meta?.kind === 'video'
  const mediaKind = meta?.mediaKind

  useEffect(() => {
    if (!isVideo) { return }
    let cancelled = false
    let loaded = null
    const load = mediaKind === 'gif' ? loadGifController : loadVideoController
    load('/api/media')
      .then((created) => {
        if (cancelled) { created.destroy(); return }
        loaded = created
        applyStoredAudio(created)
        setController(created)
        setPlayerState(created.getState())
      })
      .catch((err) => { if (!cancelled) { setError(err.message) } })
    return () => {
      cancelled = true
      loaded?.destroy()
    }
  }, [isVideo, mediaKind])

  useEffect(() => {
    if (!controller) { return }
    let previous = controller.getState()
    return controller.subscribe((state) => {
      rememberAudio(state, previous)
      previous = state
      setPlayerState(state)
    })
  }, [controller])

  return { isVideo, controller, playerState, error }
}
