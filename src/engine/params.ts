import type { DriverKey, FailureMode } from '../data/modes'

/** Every driver the modes can expose, in one flat record. */
export type Params = Record<DriverKey, number>

export const DEFAULT_PARAMS: Params = {
  drive: 0,
  tempC: 20,
  stressFrac: 0.5,
  stressAmp: 260,
  cyclesLog: 2,
  timeLogH: 0,
  chlorideLog: 3,
  slenderness: 30,
  hydrogenPpm: 0,
}

/** Sensible starting point for a mode — its own drivers reset, the rest kept. */
export function paramsForMode(mode: FailureMode, prev: Params): Params {
  const next: Params = { ...prev }
  const drivers = [mode.primary, ...mode.secondary]
  for (const d of drivers) {
    switch (d.key) {
      case 'drive':
      case 'cyclesLog':
      case 'timeLogH':
        next[d.key] = d.min
        break
      case 'hydrogenPpm':
        next[d.key] = 0
        break
      case 'tempC':
        // Start each mode where its physics is interesting.
        next.tempC = mode.id === 'impact' ? 20 : mode.id === 'creep' ? 650 : mode.id === 'igc' ? 700 : mode.id === 'scc' ? 90 : mode.id === 'pitting' ? 40 : 20
        break
      default:
        next[d.key] = DEFAULT_PARAMS[d.key]
    }
  }
  return next
}

/** Real value behind a logarithmic slider. */
export function driverValue(key: DriverKey, params: Params, log?: boolean): number {
  return log ? Math.pow(10, params[key]) : params[key]
}
