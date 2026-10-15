import { useMemo } from 'react'
import { roundDiffOf } from '../utils/roundDiff.js'

/** The active file against its last round, computed again only when its blocks or that round change, not with every note. */
export function useRoundDiff(file) {
  const blocks = file?.blocks
  const previousRound = file?.previousRound ?? null
  const isPlainText = file?.isPlainText ?? false
  const kind = file?.kind
  return useMemo(
    () => (blocks ? roundDiffOf({ blocks, previousRound, isPlainText, kind }) : null),
    [blocks, previousRound, isPlainText, kind]
  )
}
