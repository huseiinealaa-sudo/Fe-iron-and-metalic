import { sccThreshold, sensitisationWindow, type Alloy, type Family } from '../data/alloys'
import type { Driver, DriverKey, FailureMode } from '../data/modes'

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

/** Where each family's creep gets interesting, °C. */
const CREEP_START_C: Record<Family, number> = {
  stainless: 650, 'carbon-steel': 500, 'cast-iron': 450, aluminium: 150,
  copper: 250, titanium: 400, tin: 25,
}

/**
 * A driver's range, adjusted to the alloy where a fixed range would be
 * meaningless: creep must stop below the melting point, and the sensitisation
 * window of Al-Mg sits five hundred degrees below the stainless one.
 */
export function resolveDriver(d: Driver, alloy: Alloy, modeId: string): Driver {
  if (d.key !== 'tempC') return d
  if (modeId === 'creep') {
    return { ...d, min: 20, max: Math.min(1000, Math.round(alloy.tmK - 273.15 - 10)) }
  }
  if (modeId === 'igc') {
    const w = sensitisationWindow(alloy)
    return { ...d, min: Math.max(0, w.lowC - 100), max: w.highC + 100 }
  }
  return d
}

/** Sensible starting point for a mode — its own drivers reset, the rest kept. */
export function paramsForMode(mode: FailureMode, prev: Params, alloy: Alloy): Params {
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
        // Start each mode where its physics is interesting for this alloy.
        next.tempC =
          mode.id === 'impact' ? 20
          : mode.id === 'creep' ? CREEP_START_C[alloy.family]
          : mode.id === 'igc' ? sensitisationWindow(alloy).noseC
          : mode.id === 'scc' ? Math.max(30, sccThreshold(alloy) + 30)
          : mode.id === 'pitting' ? 40
          : 20
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
