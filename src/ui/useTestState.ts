import { useMemo } from 'react'
import { evaluate } from '../engine/failure'
import { useStore } from '../store/useStore'

/** The evaluated test, recomputed whenever a control moves. */
export function useTestState() {
  const alloyId = useStore((s) => s.alloyId)
  const modeId = useStore((s) => s.modeId)
  const params = useStore((s) => s.params)
  return useMemo(() => evaluate(alloyId, modeId, params), [alloyId, modeId, params])
}
