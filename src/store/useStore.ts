import { create } from 'zustand'
import { DEFAULT_ALLOY_ID } from '../data/alloys'
import { DEFAULT_MODE_ID, modeById, type DriverKey } from '../data/modes'
import { DEFAULT_PARAMS, paramsForMode, type Params } from '../engine/params'

interface State {
  alloyId: string
  modeId: string
  params: Params
  /** Paint the analytical stress distribution over the metal. */
  showStress: boolean
  /** Sweep the primary driver automatically. */
  playing: boolean
  /** Section the coupon so the interior is visible. */
  sectioned: boolean
  /** Panel visibility on narrow screens. */
  panelOpen: boolean

  setAlloy: (id: string) => void
  setMode: (id: string) => void
  setParam: (key: DriverKey, value: number) => void
  setPlaying: (v: boolean) => void
  toggleStress: () => void
  toggleSection: () => void
  setPanelOpen: (v: boolean) => void
  resetDrive: () => void
}

export const useStore = create<State>((set, get) => ({
  alloyId: DEFAULT_ALLOY_ID,
  modeId: DEFAULT_MODE_ID,
  params: paramsForMode(modeById(DEFAULT_MODE_ID), DEFAULT_PARAMS),
  showStress: true,
  playing: false,
  sectioned: false,
  panelOpen: true,

  setAlloy: (alloyId) => set({ alloyId }),
  setMode: (modeId) =>
    set((s) => ({
      modeId,
      playing: false,
      params: paramsForMode(modeById(modeId), s.params),
    })),
  setParam: (key, value) => set((s) => ({ params: { ...s.params, [key]: value } })),
  setPlaying: (playing) => set({ playing }),
  toggleStress: () => set((s) => ({ showStress: !s.showStress })),
  toggleSection: () => set((s) => ({ sectioned: !s.sectioned })),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  resetDrive: () => {
    const mode = modeById(get().modeId)
    set((s) => ({ params: { ...s.params, [mode.primary.key]: mode.primary.min }, playing: false }))
  },
}))
