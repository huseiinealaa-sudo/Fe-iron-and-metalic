/**
 * The tensile curve, and everything derived from it.
 *
 * The model is Hollomon hardening on the true-stress axis with a shift term so
 * the curve passes exactly through the published Rp0.2 and Rm of the grade.
 * Necking follows the Considère criterion. Nothing here is fitted by eye: given
 * (E, Rp0.2, Rm, n) the curve is fully determined.
 */

import type { Alloy } from '../data/alloys'

/** Young's modulus in MPa (alloys store GPa). */
export function emod(a: Alloy): number {
  return a.E * 1000
}

/** Hollomon strength coefficient K, MPa, derived so the peak equals Rm. */
export function strengthCoefficient(a: Alloy): number {
  return (a.Rm * Math.exp(a.n)) / Math.pow(a.n, a.n)
}

/**
 * Plastic-strain shift eps0, so that the true curve reads Rp0.2 at 0.2%
 * plastic strain. Clamped positive: the very low-n PH grade would otherwise
 * solve to a marginally negative shift.
 */
export function strainShift(a: Alloy): number {
  const k = strengthCoefficient(a)
  // The 0.2% offset point sits at elastic strain plus 0.002 of plastic strain.
  const offset = a.Rp02 / emod(a) + 0.002
  return Math.max(1e-4, Math.pow(a.Rp02 / k, 1 / a.n) - offset)
}

/** Engineering strain at which necking starts (Considère). */
export function uniformStrain(a: Alloy): number {
  return Math.exp(a.n - strainShift(a)) - 1
}

/** Engineering strain at fracture. */
export function fractureStrain(a: Alloy): number {
  return a.elong
}

/** How far the engineering stress falls between necking and fracture. */
function neckingDrop(a: Alloy): number {
  return 0.15 + 0.35 * a.ra
}

/**
 * Engineering stress, MPa, at an engineering strain.
 * Elastic below yield, Hollomon through hardening, falling through the neck.
 */
export function engStress(a: Alloy, eps: number): number {
  if (eps <= 0) return 0
  const eu = uniformStrain(a)
  const ef = fractureStrain(a)
  if (eps > ef) return 0

  const peak = hardeningStress(a, eu)
  if (eps <= eu) return hardeningStress(a, eps)

  const u = Math.min(1, (eps - eu) / Math.max(1e-6, ef - eu))
  return peak * (1 - neckingDrop(a) * Math.pow(u, 1.8))
}

/** Elastic branch and Hollomon branch, whichever is lower. */
function hardeningStress(a: Alloy, eps: number): number {
  const elastic = emod(a) * eps
  const et = Math.log(1 + eps)
  const plastic = (strengthCoefficient(a) * Math.pow(strainShift(a) + et, a.n)) / (1 + eps)
  return Math.min(elastic, plastic)
}

/**
 * Area of the smallest section as a fraction of the original.
 * Uniform before necking (constant volume), closing on the published reduction
 * of area at fracture.
 */
export function areaRatio(a: Alloy, eps: number): number {
  const eu = uniformStrain(a)
  if (eps <= eu) return 1 / (1 + eps)
  const u = Math.min(1, (eps - eu) / Math.max(1e-6, fractureStrain(a) - eu))
  return (1 / (1 + eu)) * (1 - u) + (1 - a.ra) * u
}

/**
 * True stress, MPa — load divided by the area actually carrying it.
 * Past necking the load falls while the true stress keeps climbing, because the
 * section closes faster than the load drops.
 */
export function trueStress(a: Alloy, eps: number): number {
  return engStress(a, eps) / Math.max(1e-4, areaRatio(a, eps))
}

/** Sampled curve for the chart. `points` engineering (strain, stress) pairs. */
export function sampleCurve(a: Alloy, points = 160): Array<[number, number]> {
  const ef = fractureStrain(a)
  const out: Array<[number, number]> = []
  for (let i = 0; i <= points; i++) {
    // Denser sampling near the origin so the elastic line is not a staircase.
    const t = i / points
    const eps = ef * t * t
    out.push([eps, engStress(a, eps)])
  }
  return out
}

/** Which named stage of the curve a strain sits in. */
export type TensileStage = 'elastic' | 'yield' | 'hardening' | 'necking' | 'fractured'

export function stageAt(a: Alloy, eps: number): TensileStage {
  if (eps >= fractureStrain(a)) return 'fractured'
  if (eps > uniformStrain(a)) return 'necking'
  const ey = a.Rp02 / emod(a)
  if (eps > ey * 1.6) return 'hardening'
  if (eps > ey) return 'yield'
  return 'elastic'
}

export const STAGE_AR: Record<TensileStage, string> = {
  elastic: 'مطاطي — يعود كما كان',
  yield: 'الخضوع — بدأ التشوّه الدائم',
  hardening: 'تصلّد بالتشغيل',
  necking: 'تكوّن العنق Necking',
  fractured: 'انفصل',
}

// --------------------------------------------------------------- temperature

/**
 * Hot-strength knock-down factor for Rp0.2 and Rm.
 * Austenitic grades keep roughly half their room strength at 600 C; the duplex
 * and PH grades are held to their own service ceiling.
 */
export function hotFactor(a: Alloy, tempC: number): number {
  if (tempC <= 20) {
    // Austenitic grades gain strength when cold; BCC grades gain more.
    const gain = a.dbtt === null ? 0.35 : 0.6
    return 1 + gain * Math.min(1, (20 - tempC) / 220)
  }
  const ceiling = a.maxServiceC
  const x = Math.min(1.4, (tempC - 20) / Math.max(120, ceiling - 20))
  return Math.max(0.05, 1 - 0.75 * Math.pow(x, 1.4))
}

/**
 * Width of the ductile-to-brittle transition, °C. Ferritic and martensitic
 * grades switch over in about twenty degrees; duplex switches far more
 * gradually because only the ferrite phase cleaves.
 */
function transitionWidth(a: Alloy): number {
  return a.structure === 'duplex' ? 38 : 14
}

/** Charpy V-notch energy, J, at a temperature. */
export function charpyEnergy(a: Alloy, tempC: number): number {
  if (a.dbtt === null) {
    // FCC: no transition. A mild fall only in the deep cryogenic range.
    const f = 0.82 + 0.18 / (1 + Math.exp(-(tempC + 170) / 30))
    return a.cvnUpper * f
  }
  const lower = Math.max(4, a.cvnUpper * 0.06)
  return lower + (a.cvnUpper - lower) / (1 + Math.exp(-(tempC - a.dbtt) / transitionWidth(a)))
}

/** Fraction of the fracture surface that is cleavage (brittle), 0..1. */
export function brittleFraction(a: Alloy, tempC: number): number {
  if (a.dbtt === null) return tempC < -180 ? 0.06 : 0
  return 1 / (1 + Math.exp((tempC - a.dbtt) / transitionWidth(a)))
}
