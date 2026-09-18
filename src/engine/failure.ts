/**
 * The state machine. Given (alloy, mode, params) it returns everything both the
 * 3D scene and the panels need: how the specimen is shaped, how damaged it is,
 * and what the numbers say.
 *
 * Every branch below is a published relation, not a tuned animation curve. Where
 * a constant is fitted, the fit and its anchor point are named in a comment.
 */

import {
  alloyById, cpt, isBrittle, pren, sccThreshold, sensitisationWindow, shearModulus, type Alloy,
} from '../data/alloys'
import { modeById, type FailureMode } from '../data/modes'
import { SPECIMEN } from '../data/specimen'
import {
  areaRatio, brittleFraction, charpyEnergy, emod, engStress, fractureStrain,
  hotFactor, stageAt, STAGE_AR, trueStress, uniformStrain,
} from './curve'
import { clamp, fmt, fmtCycles, fmtHours } from './math'
import type { Params } from './params'

export type Tone = 'ok' | 'warn' | 'fail' | 'info'

export interface Readout {
  labelAr: string
  value: string
  unit?: string
  tone?: Tone
}

/** Everything the shader and the rig need to pose the specimen. */
export interface Geom {
  /** Engineering axial strain, + tension / − compression. */
  axialStrain: number
  /** Depth of the neck, 0..1 of the gauge radius. */
  neck: number
  /** Barrelling under compression, 0..1. */
  barrel: number
  /** Lateral buckling amplitude as a fraction of gauge length. */
  bow: number
  /** Bending curvature × gauge length, radians. */
  bendAngle: number
  /** Total twist over the gauge length, radians. */
  twist: number
  /** Transverse shear offset as a fraction of diameter. */
  shearOffset: number
  /** Crack depth, 0..1 of the radius. */
  crackDepth: number
  /** Crack plane tilt: 0 transverse, PI/4 helical/brittle. */
  crackAngle: number
  /** Separation of the two halves once broken, scene fraction of length. */
  gap: number
  /** Surface pitting, 0..1 density and 0..1 of wall depth. */
  pitDensity: number
  pitDepth: number
  /** Branched SCC network, 0..1. */
  branching: number
  /** Opened grain boundaries, 0..1. */
  gbOpen: number
  /** Cleavage character of the fracture surface, 0..1. */
  brittle: number
  /** Amplitude of the live cyclic wobble, engineering strain. */
  cyclicAmp: number
  /** Incandescent glow from temperature, 0..1. */
  glow: number
  /** Cryogenic frosting, 0..1. */
  frost: number
}

export interface TestState {
  alloy: Alloy
  mode: FailureMode
  stageAr: string
  stageTone: Tone
  /** 0..1 toward failure. */
  progress: number
  failed: boolean
  /** 0..1 stress utilisation — drives the colour map. */
  utilisation: number
  /** Peak stress currently in the part, MPa. */
  peakStressMPa: number
  readouts: Readout[]
  geom: Geom
  /** Where to put the dot on the tensile chart, when the mode lives on it. */
  curveMarker: { eps: number; sigma: number } | null
  verdictAr: string
}

const ZERO_GEOM: Geom = {
  axialStrain: 0, neck: 0, barrel: 0, bow: 0, bendAngle: 0, twist: 0,
  shearOffset: 0, crackDepth: 0, crackAngle: 0, gap: 0, pitDensity: 0,
  pitDepth: 0, branching: 0, gbOpen: 0, brittle: 0, cyclicAmp: 0,
  glow: 0, frost: 0,
}

/** Thermal appearance shared by every mode. */
function thermal(tempC: number): Pick<Geom, 'glow' | 'frost'> {
  return {
    glow: clamp((tempC - 480) / 520),
    frost: clamp((-tempC - 20) / 120),
  }
}

/** Effective fracture strain once temperature has had its say. */
function effectiveFractureStrain(a: Alloy, tempC: number): number {
  const b = brittleFraction(a, tempC)
  return fractureStrain(a) * (1 - 0.88 * b)
}

export function evaluate(alloyId: string, modeId: string, p: Params): TestState {
  const alloy = alloyById(alloyId)
  const mode = modeById(modeId)
  switch (mode.id) {
    case 'tension': return tension(alloy, mode, p)
    case 'compression': return compression(alloy, mode, p)
    case 'bending': return bending(alloy, mode, p)
    case 'torsion': return torsion(alloy, mode, p)
    case 'shear': return directShear(alloy, mode, p)
    case 'fatigue': return fatigue(alloy, mode, p)
    case 'creep': return creep(alloy, mode, p)
    case 'impact': return impact(alloy, mode, p)
    case 'pitting': return pitting(alloy, mode, p)
    case 'scc': return scc(alloy, mode, p)
    case 'igc': return igc(alloy, mode, p)
    case 'hydrogen': return hydrogen(alloy, mode, p)
    default: return tension(alloy, mode, p)
  }
}

// ------------------------------------------------------------------- tension

function tension(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const hot = hotFactor(alloy, p.tempC)
  const ef = effectiveFractureStrain(alloy, p.tempC)
  const eu = Math.min(uniformStrain(alloy), ef * 0.85)
  // The slider reaches fracture at 92%, leaving room to see the halves apart.
  const eps = (p.drive / 0.92) * ef
  const failed = eps >= ef
  const shown = Math.min(eps, ef)

  const sigma = engStress(alloy, shown) * hot
  const sTrue = trueStress(alloy, shown) * hot
  const stage = failed ? 'fractured' : stageAt(alloy, shown)
  const neck = clamp((shown - eu) / Math.max(1e-6, ef - eu))
  const brittle = brittleFraction(alloy, p.tempC)

  return {
    alloy, mode,
    stageAr: STAGE_AR[stage],
    stageTone: failed ? 'fail' : stage === 'necking' ? 'warn' : stage === 'elastic' ? 'ok' : 'info',
    progress: clamp(eps / ef),
    failed,
    utilisation: clamp(sigma / (alloy.Rm * hot)),
    peakStressMPa: sTrue,
    curveMarker: { eps: shown, sigma },
    geom: {
      ...ZERO_GEOM, ...thermal(p.tempC),
      axialStrain: shown,
      neck: neck * (1 - 0.95 * brittle),
      crackDepth: failed ? 1 : neck > 0.85 ? (neck - 0.85) / 0.15 : 0,
      crackAngle: brittle * Math.PI * 0.25,
      gap: failed ? clamp((p.drive - 0.92) / 0.08) * 0.22 : 0,
      brittle,
    },
    readouts: [
      { labelAr: 'الاستطالة', value: fmt(shown * 100, 1), unit: '%' },
      { labelAr: 'الإجهاد الهندسي', value: fmt(sigma, 0), unit: 'MPa', tone: sigma > alloy.Rp02 * hot ? 'warn' : 'ok' },
      { labelAr: 'الإجهاد الحقيقي', value: fmt(sTrue, 0), unit: 'MPa' },
      { labelAr: 'Rp0.2 عند هذه الحرارة', value: fmt(alloy.Rp02 * hot, 0), unit: 'MPa', tone: 'info' },
      { labelAr: 'Rm عند هذه الحرارة', value: fmt(alloy.Rm * hot, 0), unit: 'MPa', tone: 'info' },
      { labelAr: 'نقصان المساحة', value: fmt((1 - areaRatio(alloy, shown)) * 100, 1), unit: '%' },
    ],
    verdictAr: failed
      ? brittle > 0.5
        ? `انفصل انفصالًا قصفًا عند ${fmt(shown * 100, 0)}% فقط — البنية BCC تحت درجة الانتقال.`
        : `كسر مطيل بسطح Cup and Cone بعد استطالة ${fmt(shown * 100, 0)}%.`
      : stage === 'necking'
        ? 'تجاوزنا Rm: كل الاستطالة تتركّز الآن في العنق، والانفصال مسألة وقت.'
        : stage === 'elastic'
          ? 'ما زلنا في النطاق المطاطي — ارفع الحمل ولن يبقى أثر.'
          : 'تشوّه دائم يتراكم، والمعدن يزداد متانة كلّما استطال.',
  }
}

// --------------------------------------------------------------- compression

function compression(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const hot = hotFactor(alloy, p.tempC)
  const eps = p.drive
  const lambda = Math.max(8, p.slenderness)

  // Grey iron has no yield point to speak of: it carries three to four times
  // its tensile strength in compression, then shears apart on 45° planes.
  if (isBrittle(alloy)) {
    const comp = (alloy.compressive ?? alloy.Rm * 3) * hot
    const crushStrain = 0.03
    const sigmaC = Math.min(emod(alloy) * eps, comp)
    const crushed = eps >= crushStrain
    return {
      alloy, mode,
      stageAr: crushed ? 'تهشّم قصّي بزاوية 45°' : sigmaC >= comp * 0.98 ? 'عند مقاومة الضغط' : 'انضغاط مطاطي',
      stageTone: crushed ? 'fail' : sigmaC >= comp * 0.98 ? 'warn' : 'ok',
      progress: clamp(eps / crushStrain),
      failed: crushed,
      utilisation: clamp(sigmaC / comp),
      peakStressMPa: sigmaC,
      curveMarker: null,
      geom: {
        ...ZERO_GEOM, ...thermal(p.tempC),
        axialStrain: -Math.min(eps, crushStrain),
        barrel: 0.05,
        crackDepth: crushed ? clamp((eps - crushStrain) * 25) : 0,
        crackAngle: Math.PI / 4,
        brittle: 1,
      },
      readouts: [
        { labelAr: 'الانضغاط', value: fmt(Math.min(eps, crushStrain) * 100, 2), unit: '%' },
        { labelAr: 'الإجهاد المسلّط', value: fmt(sigmaC, 0), unit: 'MPa' },
        { labelAr: 'مقاومة الضغط', value: fmt(comp, 0), unit: 'MPa', tone: 'info' },
        { labelAr: 'مقاومة الشدّ Rm', value: fmt(alloy.Rm * hot, 0), unit: 'MPa', tone: 'info' },
        { labelAr: 'نسبة الضغط إلى الشدّ', value: fmt(comp / (alloy.Rm * hot), 1), unit: '×', tone: 'ok' },
      ],
      verdictAr: crushed
        ? `تهشّم عند ${fmt(comp, 0)} MPa على مستويات قصّ بزاوية 45° — لكن لاحظ: هذا ${fmt(comp / (alloy.Rm * hot), 1)} أضعاف ما يحمله في الشدّ. لهذا تُصنع منه المشدّات والقواعد لا الأذرع.`
        : 'رقائق الجرافيت شقوق في الشدّ وليست كذلك في الضغط: الضغط يغلقها. لهذا يحمل حديد الزهر في الضغط أضعاف ما يحمله في الشدّ.',
    }
  }
  // Euler critical stress for the column, MPa.
  const sigmaCr = (Math.PI * Math.PI * emod(alloy)) / (lambda * lambda)
  const sigma = engStress(alloy, eps) * hot
  const bucklingGoverns = sigmaCr < alloy.Rp02 * hot
  // Post-critical amplitude grows as the square root of the overshoot.
  const overshoot = bucklingGoverns ? Math.max(0, sigma / sigmaCr - 1) : 0
  const amp = bucklingGoverns ? clamp(Math.sqrt(overshoot) * 0.9) * 0.28 : 0
  const buckled = bucklingGoverns && sigma >= sigmaCr

  return {
    alloy, mode,
    stageAr: buckled ? 'انبعج — فقد الاستقرار' : sigma > alloy.Rp02 * hot ? 'خضوع وانتفاخ برميلي' : 'انضغاط مطاطي',
    stageTone: buckled ? 'fail' : sigma > alloy.Rp02 * hot ? 'warn' : 'ok',
    progress: bucklingGoverns ? clamp(sigma / sigmaCr) : clamp(eps / 0.6),
    failed: buckled,
    utilisation: clamp(sigma / (alloy.Rm * hot)),
    peakStressMPa: sigma,
    curveMarker: { eps, sigma },
    geom: {
      ...ZERO_GEOM, ...thermal(p.tempC),
      axialStrain: -eps * (buckled ? 0.35 : 1),
      barrel: buckled ? 0.1 : clamp(eps / 0.5),
      bow: amp,
    },
    readouts: [
      { labelAr: 'الانضغاط', value: fmt(eps * 100, 1), unit: '%' },
      { labelAr: 'الإجهاد المسلّط', value: fmt(sigma, 0), unit: 'MPa' },
      { labelAr: 'إجهاد Euler الحرج', value: fmt(sigmaCr, 0), unit: 'MPa', tone: bucklingGoverns ? 'warn' : 'info' },
      { labelAr: 'النحافة L/r', value: fmt(lambda, 0), unit: '' },
      { labelAr: 'الحاكم', value: bucklingGoverns ? 'الانبعاج' : 'خضوع المادة', tone: bucklingGoverns ? 'warn' : 'ok' },
    ],
    verdictAr: buckled
      ? `انبعج عند ${fmt(sigmaCr, 0)} MPa — أقلّ من Rp0.2 البالغ ${fmt(alloy.Rp02 * hot, 0)} MPa. سبيكة أقوى ما كانت لتنقذه؛ المطلوب هندسة أفضل.`
      : bucklingGoverns
        ? 'العمود نحيف: الانبعاج سيسبق الخضوع. راقب إجهاد Euler لا Rp0.2.'
        : 'العمود ممتلئ: المادة تخضع وتنتفخ برميليًّا بلا انفصال — لا توجد «مقاومة ضغط» لمعدن مطيل.',
  }
}

// ------------------------------------------------------------------- bending

function bending(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const hot = hotFactor(alloy, p.tempC)
  const ef = effectiveFractureStrain(alloy, p.tempC)
  const r = SPECIMEN.gaugeDiameter / 2
  const t = SPECIMEN.gaugeDiameter

  // A guided bend test, as ASTM E290 runs it: bend through 180 degrees and see
  // whether the tension face cracks. The angle is the control; the surface
  // strain follows from the geometry, not the other way round.
  const angle = p.drive * Math.PI
  const kappa = angle / SPECIMEN.gaugeLength
  const bendRadius = kappa > 1e-6 ? 1 / kappa : Infinity
  const epsSurface = r * kappa
  const failed = epsSurface >= ef
  const shown = Math.min(epsSurface, ef)
  const sigma = engStress(alloy, shown) * hot
  const eu = uniformStrain(alloy)
  const brittle = brittleFraction(alloy, p.tempC)
  // The severity a shop would quote: mandrel radius in multiples of thickness.
  const overT = bendRadius / t

  return {
    alloy, mode,
    stageAr: failed ? 'تشقّق الوجه المشدود'
      : shown > eu ? 'مفصل لدن Plastic Hinge'
      : sigma > alloy.Rp02 * hot ? 'خضوع الليف الخارجي'
      : 'انحناء مطاطي',
    stageTone: failed ? 'fail' : shown > eu ? 'warn' : sigma > alloy.Rp02 * hot ? 'warn' : 'ok',
    progress: clamp(epsSurface / ef),
    failed,
    utilisation: clamp(sigma / (alloy.Rm * hot)),
    peakStressMPa: sigma,
    curveMarker: { eps: shown, sigma },
    geom: {
      ...ZERO_GEOM, ...thermal(p.tempC),
      bendAngle: angle,
      crackDepth: failed
        ? clamp(0.35 + (epsSurface - ef) / Math.max(1e-6, ef) * 3)
        : clamp((shown - eu) / Math.max(1e-6, ef - eu)) * 0.3,
      brittle,
    },
    readouts: [
      { labelAr: 'زاوية الثني', value: fmt((angle * 180) / Math.PI, 0), unit: '°' },
      { labelAr: 'انفعال الليف الخارجي', value: fmt(epsSurface * 100, 1), unit: '%', tone: failed ? 'fail' : 'ok' },
      { labelAr: 'انفعال الكسر للسبيكة', value: fmt(ef * 100, 1), unit: '%', tone: 'info' },
      { labelAr: 'نصف قطر الانحناء', value: fmt(bendRadius, 1), unit: 'mm' },
      { labelAr: 'الشدّة R/t', value: Number.isFinite(overT) ? fmt(overT, 2) : '∞', unit: '' },
      { labelAr: 'إجهاد السطح المشدود', value: fmt(sigma, 0), unit: 'MPa' },
      { labelAr: 'إجهاد المحور المحايد', value: '0', unit: 'MPa', tone: 'info' },
    ],
    verdictAr: failed
      ? `تشقّق عند ${fmt((angle * 180) / Math.PI, 0)}° — أي عند انفعال سطحي ${fmt(epsSurface * 100, 0)}% تجاوز حدّ السبيكة ${fmt(ef * 100, 0)}%. الشقّ بدأ من الوجه المشدود بالضبط.`
      : p.drive > 0.985
        ? `اجتازت ثنية 180° كاملة دون تشقّق: انفعال السطح بلغ ${fmt(epsSurface * 100, 0)}% وحدّ السبيكة ${fmt(ef * 100, 0)}%. هذه هي قابلية التشكيل التي تميّز الأوستنيتي.`
        : 'لاحظ أن الوجه المضغوط ما زال سليمًا: نصف المقطع لا يعمل تقريبًا، وهذا ما يجعل الأنبوب أكفأ من العمود المصمت لنفس الوزن.',
  }
}

// ------------------------------------------------------------------- torsion

function torsion(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const hot = hotFactor(alloy, p.tempC)
  const ef = effectiveFractureStrain(alloy, p.tempC)
  const brittle = brittleFraction(alloy, p.tempC)
  const r = SPECIMEN.gaugeDiameter / 2
  // Shear fracture strain via von Mises equivalence.
  const gammaF = ef * Math.sqrt(3) * 0.8
  const gamma = (p.drive / 0.9) * gammaF
  const failed = gamma >= gammaF
  const shown = Math.min(gamma, gammaF)
  // tau(gamma) = sigma(gamma/sqrt3)/sqrt3 — the von Mises equivalent curve.
  const tau = (engStress(alloy, shown / Math.sqrt(3)) * hot) / Math.sqrt(3)
  const tauY = (alloy.Rp02 * hot) / Math.sqrt(3)
  const twist = (shown * SPECIMEN.gaugeLength) / r
  const g = shearModulus(alloy)

  return {
    alloy, mode,
    stageAr: failed ? (brittle > 0.5 ? 'كسر حلزوني 45° — قصف' : 'كسر قصّي مستوٍ — مطيل') : tau > tauY ? 'خضوع قصّي لدن' : 'لَيّ مطاطي',
    stageTone: failed ? 'fail' : tau > tauY ? 'warn' : 'ok',
    progress: clamp(shown / gammaF),
    failed,
    utilisation: clamp(tau / ((alloy.Rm * hot) / Math.sqrt(3))),
    peakStressMPa: tau,
    curveMarker: null,
    geom: {
      ...ZERO_GEOM, ...thermal(p.tempC),
      twist,
      crackDepth: failed ? 1 : clamp((shown - gammaF * 0.8) / (gammaF * 0.2)) * 0.5,
      crackAngle: brittle > 0.5 ? Math.PI / 4 : 0,
      gap: failed ? clamp((p.drive - 0.9) / 0.1) * 0.12 : 0,
      brittle,
    },
    readouts: [
      { labelAr: 'انفعال القصّ السطحي γ', value: fmt(shown * 100, 1), unit: '%' },
      { labelAr: 'إجهاد القصّ السطحي τ', value: fmt(tau, 0), unit: 'MPa' },
      { labelAr: 'خضوع القصّ Rp0.2/√3', value: fmt(tauY, 0), unit: 'MPa', tone: 'info' },
      { labelAr: 'زاوية اللَّي', value: fmt((twist * 180) / Math.PI, 0), unit: '°' },
      { labelAr: 'معامل القصّ G', value: fmt(g, 0), unit: 'GPa', tone: 'info' },
      { labelAr: 'إجهاد مركز العمود', value: '0', unit: 'MPa', tone: 'info' },
    ],
    verdictAr: failed
      ? brittle > 0.5
        ? 'السطح حلزوني بزاوية 45°: تَبِع مستوى الشدّ الأقصى — هذه بصمة المعدن القصف.'
        : 'السطح مستوٍ وعمودي على المحور: فشل بالقصّ النقيّ — بصمة المعدن المطيل.'
      : 'لاحظ اللبّ: إجهاده صفر مهما لَوَيت. لهذا الأنبوب المجوّف يكاد يساوي العمود المصمت في اللَّي.',
  }
}

// -------------------------------------------------------------- direct shear

function directShear(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const hot = hotFactor(alloy, p.tempC)
  const d = SPECIMEN.gaugeDiameter
  const tauUlt = 0.67 * alloy.Rm * hot
  const tauY = (alloy.Rp02 * hot) / Math.sqrt(3)
  // Direct shear is more constrained than torsion, so it separates earlier.
  const gammaF = effectiveFractureStrain(alloy, p.tempC) * Math.sqrt(3) * 0.55
  const gamma = (p.drive / 0.85) * gammaF
  const failed = gamma >= gammaF
  const shown = Math.min(gamma, gammaF)
  // Same von Mises equivalence as torsion, capped by the ultimate shear stress.
  const tauNow = failed
    ? 0
    : Math.min(tauUlt, (engStress(alloy, shown / Math.sqrt(3)) * hot) / Math.sqrt(3))
  const area = (Math.PI * d * d) / 4
  const frac = clamp(shown / gammaF)

  return {
    alloy, mode,
    stageAr: failed ? 'انفصل على مستوى القصّ' : tauNow >= tauUlt * 0.98 ? 'انزلاق لدن على المستوى' : tauNow > tauY ? 'خضوع قصّي' : 'قصّ مطاطي',
    stageTone: failed ? 'fail' : tauNow > tauY ? 'warn' : 'ok',
    progress: frac,
    failed,
    utilisation: clamp(tauNow / tauUlt),
    peakStressMPa: tauNow,
    curveMarker: null,
    geom: {
      ...ZERO_GEOM, ...thermal(p.tempC),
      shearOffset: frac * 0.9,
      crackDepth: clamp((frac - 0.5) / 0.5),
      gap: failed ? 0.04 : 0,
      brittle: brittleFraction(alloy, p.tempC),
    },
    readouts: [
      { labelAr: 'إزاحة القصّ', value: fmt(frac * 0.9 * d, 2), unit: 'mm' },
      { labelAr: 'إجهاد القصّ', value: fmt(tauNow, 0), unit: 'MPa' },
      { labelAr: 'خضوع القصّ Rp0.2/√3', value: fmt(tauY, 0), unit: 'MPa', tone: 'info' },
      { labelAr: 'مقاومة القصّ القصوى', value: fmt(tauUlt, 0), unit: 'MPa', tone: 'info' },
      { labelAr: 'الحمل على المقطع', value: fmt((tauNow * area) / 1000, 1), unit: 'kN' },
      { labelAr: 'مساحة القصّ', value: fmt(area, 0), unit: 'mm²', tone: 'info' },
      { labelAr: 'مع وصلة Double Shear', value: fmt((2 * tauUlt * area) / 1000, 1), unit: 'kN', tone: 'ok' },
    ],
    verdictAr: failed
      ? `انفصل عند ${fmt((tauUlt * area) / 1000, 0)} kN وبإزاحة ${fmt(frac * 0.9 * d, 1)} mm فقط — لا عنق ولا استطالة ولا إنذار.`
      : 'القصّ المباشر لا يعطي عنقًا: الانزلاق يقع على مستوى واحد، والمقاومة تقارب ثلثَي Rm.',
  }
}

// ------------------------------------------------------------------- fatigue

/**
 * Whether the S-N curve flattens into a true endurance limit. Body-centred and
 * hexagonal lattices do; face-centred ones (austenitic steel, aluminium, copper)
 * keep sliding, and so does tin.
 */
export function hasEnduranceLimit(a: Alloy): boolean {
  return a.lattice !== 'FCC' && a.family !== 'tin'
}

/** S-N life. Anchored at 0.9*Rm for 1e3 cycles and the grade's 1e7 strength. */
export function fatigueLife(alloy: Alloy, amp: number): number {
  const s1e3 = 0.9 * alloy.Rm
  if (amp <= 0) return Infinity
  const b = Math.log10(alloy.fatigue1e7 / s1e3) / 4
  const n1 = 1e3 * Math.pow(amp / s1e3, 1 / b)
  if (n1 <= 1e7) return Math.max(1, n1)
  // Past the knee: FCC keeps falling (no true endurance limit); BCC flattens.
  if (hasEnduranceLimit(alloy) && amp < alloy.fatigue1e7) return Infinity
  const b2 = b * 0.35
  return 1e7 * Math.pow(amp / alloy.fatigue1e7, 1 / b2)
}

function fatigue(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const amp = p.stressAmp
  const n = Math.pow(10, p.cyclesLog)
  const nf = fatigueLife(alloy, amp)
  const damage = Number.isFinite(nf) ? clamp(n / nf) : 0
  const failed = damage >= 1
  const r = SPECIMEN.gaugeDiameter / 2
  // Most of the life is spent with a crack too small to see; growth is late.
  const aOverR = Math.pow(damage, 3)
  const aMm = aOverR * r
  const dK = amp * 2 * Math.sqrt(Math.PI * Math.max(aMm, 0.05) * 1e-3) * 1.12

  return {
    alloy, mode,
    stageAr: failed ? 'الكسر النهائي المفاجئ' : damage > 0.85 ? 'نمو سريع للشقّ' : damage > 0.2 ? 'نمو الشقّ وفق Paris' : amp > alloy.fatigue1e7 ? 'بدء الشقّ — لا أثر ظاهر' : 'تحت مستوى الضرر العملي',
    stageTone: failed ? 'fail' : damage > 0.85 ? 'fail' : damage > 0.2 ? 'warn' : 'ok',
    progress: damage,
    failed,
    utilisation: clamp(amp / alloy.Rp02),
    peakStressMPa: amp,
    curveMarker: null,
    geom: {
      ...ZERO_GEOM,
      axialStrain: (amp / emod(alloy)) * 3,
      cyclicAmp: (amp / emod(alloy)) * 6,
      crackDepth: failed ? 1 : aOverR,
      crackAngle: 0,
      gap: failed ? 0.1 : 0,
      brittle: 0.35,
    },
    readouts: [
      { labelAr: 'الدورات المنقضية N', value: fmtCycles(n), unit: '' },
      { labelAr: 'العمر المتوقّع Nf', value: fmtCycles(nf), unit: '', tone: Number.isFinite(nf) ? 'info' : 'ok' },
      { labelAr: 'الضرر المتراكم N/Nf', value: fmt(damage * 100, 1), unit: '%', tone: damage > 0.85 ? 'fail' : damage > 0.4 ? 'warn' : 'ok' },
      { labelAr: 'عمق الشقّ', value: fmt(aMm, 2), unit: 'mm' },
      { labelAr: 'مدى شدّة الإجهاد ΔK', value: fmt(dK, 1), unit: 'MPa√m' },
      { labelAr: 'K_IC للسبيكة', value: fmt(alloy.kic, 0), unit: 'MPa√m', tone: 'info' },
      { labelAr: 'سعة الإجهاد ÷ Rp0.2', value: fmt((amp / alloy.Rp02) * 100, 0), unit: '%', tone: amp > alloy.Rp02 ? 'fail' : 'info' },
    ],
    verdictAr: failed
      ? `انكسر بعد ${fmtCycles(nf)} دورة عند إجهاد ${fmt((amp / alloy.Rp02) * 100, 0)}% من Rp0.2 — أي دون أن يقترب من حدّ الخضوع أصلًا.`
      : !Number.isFinite(nf)
        ? 'تحت حدّ الكلال لهذه البنية BCC: عمر غير محدود نظريًّا ما دام السطح سليمًا.'
        : damage > 0.2
          ? 'الشقّ ينمو الآن، والقطعة تبدو سليمة تمامًا من الخارج. هذا هو خطر الكلال.'
          : 'لا شيء يُرى بعد. وهذا بالضبط ما يخدع الفاحص.',
  }
}

// --------------------------------------------------------------------- creep

/** Melting point of the grade the Larson-Miller fit was made on (304), K. */
const REFERENCE_TM_K = 1700

/**
 * Larson-Miller rupture time, hours. Fit anchored on 304 stress-rupture data.
 *
 * Creep is a homologous-temperature phenomenon: what matters is T / T_melt.
 * Other grades are mapped onto the 304 fit by scaling their absolute
 * temperature by 1700 / T_melt — which is why a tin solder at 20 °C lands where
 * a stainless steel lands at 750 °C. Grades whose service ceiling sits low
 * relative to their melting point (phase instabilities, over-ageing) behave as
 * if more heavily loaded.
 */
export function rupturTime(alloy: Alloy, sigmaMPa: number, tempC: number): number {
  if (sigmaMPa <= 0.5) return Infinity
  const tK = tempC + 273.15
  if (tK >= alloy.tmK) return 0
  const tEff = tK * (REFERENCE_TM_K / alloy.tmK)
  const f = clamp(Math.pow((alloy.maxServiceC + 273.15) / (0.5 * alloy.tmK), 1.2), 0.15, 1.0)
  const sEff = sigmaMPa / f
  const lmp = (6.6145 - Math.log10(sEff)) / 2.2e-4
  const t = Math.pow(10, lmp / tEff - 20)
  return Math.min(t, 1e12)
}

function creep(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const sigma = p.stressFrac * alloy.Rp02
  const t = Math.pow(10, p.timeLogH)
  const molten = p.tempC + 273.15 >= alloy.tmK
  const tr = rupturTime(alloy, sigma, p.tempC)
  const lf = molten ? 1 : Number.isFinite(tr) ? clamp(t / tr) : 0
  const failed = lf >= 1
  const homologous = (p.tempC + 273.15) / alloy.tmK
  // Primary + secondary + tertiary, reaching about 20% at rupture.
  const strain = 0.004 + 0.012 * Math.pow(lf, 0.4) + 0.03 * lf + 0.15 * Math.pow(lf, 8)
  const stageName = molten ? 'انصهر' : lf >= 1 ? 'انفصل — نهاية المرحلة الثالثة' : lf > 0.75 ? 'المرحلة الثالثة — تسارع' : lf > 0.1 ? 'المرحلة الثانوية — معدل ثابت' : homologous < 0.3 ? 'تحت 0.3 من الانصهار — لا زحف يُذكر' : 'المرحلة الأوّلية'
  const hot = hotFactor(alloy, p.tempC)
  const overTemp = p.tempC > alloy.maxServiceC

  return {
    alloy, mode,
    stageAr: stageName,
    stageTone: failed ? 'fail' : lf > 0.75 ? 'fail' : lf > 0.1 ? 'warn' : 'ok',
    progress: lf,
    failed,
    utilisation: clamp(sigma / (alloy.Rp02 * hot)),
    peakStressMPa: sigma,
    curveMarker: null,
    geom: {
      ...ZERO_GEOM, ...thermal(p.tempC),
      axialStrain: strain,
      neck: clamp(Math.pow(lf, 5)) * 0.55,
      gbOpen: clamp(lf * 1.1),
      crackDepth: failed ? 1 : clamp((lf - 0.8) / 0.2) * 0.6,
      gap: failed ? 0.14 : 0,
      brittle: 0.2,
    },
    readouts: [
      { labelAr: 'الإجهاد المسلّط', value: fmt(sigma, 0), unit: 'MPa' },
      { labelAr: 'زمن التعرّض', value: fmtHours(t), unit: '' },
      { labelAr: 'زمن الانهيار t_r', value: fmtHours(tr), unit: '', tone: 'info' },
      { labelAr: 'العمر المستهلك', value: fmt(lf * 100, 1), unit: '%', tone: lf > 0.75 ? 'fail' : lf > 0.3 ? 'warn' : 'ok' },
      { labelAr: 'انفعال الزحف', value: fmt(strain * 100, 2), unit: '%' },
      { labelAr: 'معامل Larson-Miller', value: fmt((p.tempC + 273.15) * (20 + Math.log10(Math.max(t, 1e-3))) / 1000, 2), unit: '×10³' },
      { labelAr: 'أقصى حرارة خدمة', value: fmt(alloy.maxServiceC, 0), unit: '°م', tone: overTemp ? 'fail' : 'info' },
      { labelAr: 'الحرارة المتجانسة T/Tm', value: fmt(homologous, 2), unit: '', tone: homologous >= 0.4 ? 'warn' : 'ok' },
      { labelAr: 'درجة الانصهار', value: fmt(alloy.tmK - 273.15, 0), unit: '°م', tone: 'info' },
    ],
    verdictAr: molten
      ? `فوق درجة انصهار السبيكة (${fmt(alloy.tmK - 273.15, 0)} °م). لم يعد هذا زحفًا.`
      : failed
      ? `انفصل بعد ${fmtHours(tr)} عند إجهاد ${fmt(sigma, 0)} MPa — وهو ${fmt(p.stressFrac * 100, 0)}% فقط من Rp0.2. الحرارة والزمن فعلا ما عجز عنه الحمل.`
      : overTemp
        ? `تشغيل فوق حدّ الخدمة (${alloy.maxServiceC} °م) لهذه السبيكة — الزحف ليس المشكلة الوحيدة هنا.`
        : lf > 0.1
          ? 'الاستطالة تتراكم تحت حمل ثابت. قِس الأبعاد دوريًّا؛ هذا إنذارك الوحيد.'
          : 'معدل الزحف ما زال مهملًا عند هذه الحرارة.',
  }
}

// -------------------------------------------------------------------- impact

function impact(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const cvn = charpyEnergy(alloy, p.tempC)
  const brittle = brittleFraction(alloy, p.tempC)
  const struck = p.drive > 0.5
  const after = clamp((p.drive - 0.5) / 0.5)
  const failed = struck && brittle > 0.5
  const lateralExp = (1 - brittle) * 2.2 // mm, the classic ductility measure

  return {
    alloy, mode,
    stageAr: !struck ? 'البندول يهوي' : brittle > 0.5 ? 'انشطار قصف' : 'امتصاص مطيل — انثنت ولم تنفصل',
    stageTone: !struck ? 'info' : brittle > 0.5 ? 'fail' : 'ok',
    progress: p.drive,
    failed,
    utilisation: clamp(1 - cvn / Math.max(1, alloy.cvnUpper)),
    peakStressMPa: alloy.Rm,
    curveMarker: null,
    geom: {
      ...ZERO_GEOM, ...thermal(p.tempC),
      bendAngle: struck ? after * (1 - brittle) * 1.5 : 0,
      crackDepth: struck ? (brittle > 0.5 ? 1 : after * 0.5) : 0,
      gap: failed ? after * 0.3 : 0,
      brittle,
    },
    readouts: [
      { labelAr: 'درجة حرارة العيّنة', value: fmt(p.tempC, 0), unit: '°م' },
      { labelAr: 'طاقة الصدم CVN', value: fmt(cvn, 0), unit: 'J', tone: cvn < 27 ? 'fail' : cvn < 60 ? 'warn' : 'ok' },
      { labelAr: 'درجة الانتقال DBTT', value: alloy.dbtt === null ? 'لا توجد' : fmt(alloy.dbtt, 0), unit: alloy.dbtt === null ? '' : '°م', tone: alloy.dbtt === null ? 'ok' : 'warn' },
      { labelAr: 'نسبة السطح القصف', value: fmt(brittle * 100, 0), unit: '%', tone: brittle > 0.5 ? 'fail' : 'ok' },
      { labelAr: 'التمدّد الجانبي', value: fmt(lateralExp, 2), unit: 'mm' },
      { labelAr: 'البنية البلورية', value: alloy.lattice, tone: 'info' },
      { labelAr: 'الحدّ الشائع للقبول', value: '27', unit: 'J', tone: 'info' },
    ],
    verdictAr: !struck
      ? `اسحب الشريط ليضرب البندول. لاحظ أوّلًا: البنية ${alloy.dbtt === null ? `${alloy.lattice} لا تملك درجة انتقال إطلاقًا` : alloy.dbtt > 150 ? 'قصفة عند كل حرارة — لم تغادر الرفّ السفلي أصلًا' : `${alloy.lattice} تملك درجة انتقال، وهي ما يقرّر المصير`}.`
      : brittle > 0.5
        ? `انشطرت عند ${fmt(p.tempC, 0)} °م بابتلاع ${fmt(cvn, 0)} J فقط — تحت درجة الانتقال ${alloy.dbtt} °م. السطح بلّوري لامع بلا تشوّه.`
        : alloy.dbtt === null
          ? `ابتلعت ${fmt(cvn, 0)} J عند ${fmt(p.tempC, 0)} °م وانثنت دون أن تنفصل. البنية ${alloy.lattice} بلا درجة انتقال — ${alloy.family === 'stainless' ? 'ولهذا تُبنى بها خزّانات الغاز المسال' : 'الطاقة المطلقة قد تكون منخفضة، لكنها لا تنهار فجأة بالبرد'}.`
          : `ما زلنا فوق درجة الانتقال: ابتلعت ${fmt(cvn, 0)} J. أنزل الحرارة وراقب الانهيار المفاجئ.`,
  }
}

// ------------------------------------------------------------------- pitting

function pitting(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const cl = Math.pow(10, p.chlorideLog)
  const t = Math.pow(10, p.timeLogH)
  const critical = cpt(alloy)
  const wall = SPECIMEN.wallThickness
  const above = p.tempC - critical
  const initiates = cl >= 10 && above > 0
  // Diffusion-limited growth: depth goes as the square root of time.
  const rate = initiates ? 0.16 * Math.pow(above / 40, 0.8) * clamp(Math.log10(cl / 10) / 2, 0.1, 1.6) : 0
  const depth = Math.min(wall, rate * Math.sqrt(t))
  const perforated = depth >= wall
  const frac = wall > 0 ? depth / wall : 0

  return {
    alloy, mode,
    stageAr: !initiates ? (cl < 10 ? 'كلوريد غير كافٍ — الطبقة المخمّلة سليمة' : 'تحت CPT — لا نقر مهما طال الزمن') : perforated ? 'اخترق الجدار' : frac > 0.4 ? 'حفر تتعمّق ذاتيًّا' : 'بدء النقر عند عيوب السطح',
    stageTone: !initiates ? 'ok' : perforated ? 'fail' : frac > 0.4 ? 'warn' : 'warn',
    progress: frac,
    failed: perforated,
    utilisation: frac,
    peakStressMPa: 0,
    curveMarker: null,
    geom: {
      ...ZERO_GEOM, ...thermal(p.tempC),
      pitDensity: initiates ? clamp(0.25 + Math.log10(Math.max(cl, 1)) / 6) : 0,
      pitDepth: frac,
      crackDepth: perforated ? 0.5 : 0,
    },
    readouts: [
      ...(alloy.family === 'stainless'
        ? [{ labelAr: 'PREN للسبيكة', value: fmt(pren(alloy), 1), unit: '', tone: 'info' as const }]
        : [{ labelAr: 'طبقة التخميل', value: alloy.family === 'aluminium' ? 'Al2O3' : alloy.family === 'titanium' ? 'TiO2' : 'Cu2O', tone: 'info' as const }]),
      { labelAr: 'درجة حرارة النقر الحرجة CPT', value: fmt(critical, 0), unit: '°م', tone: 'info' },
      { labelAr: 'الحرارة الحالية', value: fmt(p.tempC, 0), unit: '°م', tone: above > 0 ? 'fail' : 'ok' },
      { labelAr: 'الكلوريد', value: fmt(cl, 0), unit: 'ppm', tone: cl > 200 ? 'warn' : 'ok' },
      { labelAr: 'عمق أعمق حفرة', value: fmt(depth, 2), unit: 'mm', tone: frac > 0.6 ? 'fail' : 'warn' },
      { labelAr: 'سُمك الجدار', value: fmt(wall, 1), unit: 'mm', tone: 'info' },
      { labelAr: 'فقدان الوزن الكلّي', value: '< 0.1', unit: '%', tone: 'info' },
    ],
    verdictAr: perforated
      ? `ثُقب الجدار (${fmt(wall, 1)} mm) بينما فقدان الوزن الكلّي أقلّ من 0.1%. هذا هو خداع النقر: المعدن سليم والقطعة مسرّبة.`
      : !initiates
        ? above <= 0 && cl >= 10
          ? `الحرارة ${fmt(p.tempC, 0)} °م تحت CPT البالغة ${fmt(critical, 0)} °م لهذه السبيكة${alloy.family === 'stainless' ? ` (PREN ${fmt(pren(alloy), 1)})` : ''}. لن يبدأ النقر — ارفع الحرارة أو بدّل السبيكة لترى الفرق.`
          : 'دون كلوريد كافٍ تعيد طبقة أوكسيد الكروم بناء نفسها فور أي خدش.'
        : `تجاوزنا CPT بـ ${fmt(above, 0)} درجة. الحفرة تسرّع نفسها: داخلها يزداد حموضةً وكلوريدًا كلّما عمقت.`,
  }
}

// ----------------------------------------------------------------------- SCC

/** Time to chloride SCC failure, hours. Anchored: 304, 100 C, 1000 ppm, 0.5 Rp0.2 → ~300 h. */
export function sccLife(alloy: Alloy, tempC: number, sf: number, cl: number): number {
  const susc = alloy.susceptibility.scc
  // Stainless: grades with high nickel or a duplex structure only crack far
  // hotter. Other families carry their own threshold — brass and 7075 crack
  // at room temperature.
  const threshold = sccThreshold(alloy)
  if (tempC < threshold || sf < 0.15 || cl < 10 || susc < 0.05) return Infinity
  const ea = 60000
  const r = 8.314
  const t0 = 300
  const arr = Math.exp((ea / r) * (1 / (tempC + 273.15) - 1 / 373.15))
  return (t0 * arr * Math.pow(0.5 / sf, 3) * Math.pow(1000 / cl, 0.8)) / susc
}

function scc(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const cl = Math.pow(10, p.chlorideLog)
  const t = Math.pow(10, p.timeLogH)
  const sf = p.stressFrac
  const tf = sccLife(alloy, p.tempC, sf, cl)
  const lf = Number.isFinite(tf) ? clamp(t / tf) : 0
  const failed = lf >= 1
  const susc = alloy.susceptibility.scc
  const threshold = sccThreshold(alloy)

  const missing: string[] = []
  if (sf < 0.15) missing.push('إجهاد الشدّ')
  if (cl < 10) missing.push('الكلوريد')
  if (p.tempC < threshold) missing.push('الحرارة')

  return {
    alloy, mode,
    stageAr: failed ? 'تشقّق نافذ — انفجار بلا إنذار' : missing.length ? `ضلع ناقص: ${missing.join(' و')}` : lf > 0.5 ? 'شبكة شقوق تتفرّع' : 'شقوق شعرية تبدأ من قاع النقر',
    stageTone: failed ? 'fail' : missing.length ? 'ok' : lf > 0.5 ? 'fail' : 'warn',
    progress: lf,
    failed,
    utilisation: lf,
    peakStressMPa: sf * alloy.Rp02,
    curveMarker: null,
    geom: {
      ...ZERO_GEOM, ...thermal(p.tempC),
      axialStrain: (sf * alloy.Rp02) / emod(alloy),
      branching: lf,
      crackDepth: failed ? 1 : Math.pow(lf, 2) * 0.8,
      gap: failed ? 0.05 : 0,
      brittle: 0.9,
      pitDensity: cl >= 10 ? 0.2 : 0,
      pitDepth: cl >= 10 ? 0.15 : 0,
    },
    readouts: [
      { labelAr: 'إجهاد الشدّ', value: fmt(sf * alloy.Rp02, 0), unit: 'MPa', tone: sf >= 0.15 ? 'warn' : 'ok' },
      { labelAr: 'الكلوريد', value: fmt(cl, 0), unit: 'ppm', tone: cl >= 10 ? 'warn' : 'ok' },
      { labelAr: 'الحرارة', value: fmt(p.tempC, 0), unit: '°م', tone: p.tempC >= threshold ? 'warn' : 'ok' },
      { labelAr: 'عتبة الحرارة لهذه السبيكة', value: fmt(threshold, 0), unit: '°م', tone: 'info' },
      { labelAr: 'زمن التعرّض', value: fmtHours(t), unit: '' },
      { labelAr: 'الزمن حتى الفشل', value: fmtHours(tf), unit: '', tone: Number.isFinite(tf) ? 'fail' : 'ok' },
      ...(alloy.family === 'stainless' ? [{ labelAr: 'النيكل', value: fmt(alloy.ni, 1), unit: '%', tone: 'info' as const }] : []),
    ],
    verdictAr: failed
      ? `تشقّق نافذ بعد ${fmtHours(tf)}. لا تشوّه، ولا نقصان سُمك، ولا فقدان وزن — الأنبوب يبدو جديدًا ثم ينفجر.`
      : missing.length
        ? `الفشل ممتنع: ${missing.join(' و')} غير متوفّر. مثلّث SCC يحتاج أضلاعه الثلاثة معًا، وكسر ضلع واحد يكفي للحماية.`
        : `الأضلاع الثلاثة مكتملة. ${alloy.family === 'stainless' ? `النيكل ${fmt(alloy.ni, 1)}% ${susc > 0.7 ? 'في أسوأ نطاق ممكن' : 'يمنح مقاومة جيّدة'}` : susc > 0.6 ? 'هذه السبيكة من الأشدّ قابلية في بيئتها' : 'قابلية هذه السبيكة محدودة'} — العمر المتبقّي ${fmtHours(Math.max(0, tf - t))}.`,
  }
}

// ----------------------------------------------------------------------- IGC

/**
 * Hours at temperature before the boundary loses its protection — chromium
 * below 12% in stainless, a continuous Mg2Al3 film in Al-Mg. The window and
 * its nose belong to the alloy; the C-curve shape is common to both.
 */
export function sensitisationTime(alloy: Alloy, tempC: number): number {
  const w = sensitisationWindow(alloy)
  if (tempC < w.lowC || tempC > w.highC) return Infinity
  const igcS = Math.max(0.02, alloy.susceptibility.igc)
  const base = w.baseHours ?? 0.02 / Math.pow(igcS, 3)
  return base * Math.exp(Math.pow((tempC - w.noseC) / w.widthC, 2))
}

function igc(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const t = Math.pow(10, p.timeLogH)
  const ts = sensitisationTime(alloy, p.tempC)
  const w = sensitisationWindow(alloy)
  const inRange = p.tempC >= w.lowC && p.tempC <= w.highC
  const stainless = alloy.family === 'stainless'
  const phase = stainless ? 'Cr23C6' : 'Mg2Al3 (β)'
  const sens = Number.isFinite(ts) ? clamp((Math.log10(t / ts) + 1) / 2) : 0
  const failed = sens >= 0.85

  return {
    alloy, mode,
    stageAr: !inRange ? `خارج النطاق الحرج ${w.lowC}–${w.highC} °م` : sens < 0.05 ? 'لم يبدأ الترسّب بعد' : sens < 0.5 ? `ترسّب ${phase} عند الحدود` : failed ? 'تفكّك بين-حبيبي' : stainless ? 'استنفاد الكروم تحت 12%' : 'شبكة β مستمرّة — أنودية للحدود',
    stageTone: !inRange ? 'ok' : failed ? 'fail' : sens > 0.4 ? 'warn' : 'info',
    progress: sens,
    failed,
    utilisation: sens,
    peakStressMPa: 0,
    curveMarker: null,
    geom: {
      ...ZERO_GEOM, ...thermal(p.tempC),
      gbOpen: sens,
      crackDepth: failed ? 0.7 : 0,
      brittle: 1,
    },
    readouts: [
      ...(stainless ? [{ labelAr: 'الكربون في السبيكة', value: fmt(alloy.c, 3), unit: '%', tone: (alloy.c <= 0.03 ? 'ok' : 'warn') as Tone }] : []),
      { labelAr: 'الحرارة', value: fmt(p.tempC, 0), unit: '°م', tone: inRange ? 'warn' : 'ok' },
      { labelAr: 'زمن البقاء', value: fmtHours(t), unit: '' },
      { labelAr: 'زمن بدء التحسّس', value: fmtHours(ts), unit: '', tone: 'info' },
      { labelAr: 'درجة التحسّس', value: fmt(sens * 100, 0), unit: '%', tone: failed ? 'fail' : sens > 0.4 ? 'warn' : 'ok' },
      { labelAr: 'أسرع ترسّب عند', value: fmt(w.noseC, 0), unit: '°م', tone: 'info' },
      ...(stainless
        ? [{ labelAr: 'التثبيت', value: alloy.id === '321' ? 'Ti — محمية' : alloy.c <= 0.03 ? 'سبيكة L — محمية' : 'لا يوجد', tone: (alloy.susceptibility.igc < 0.2 ? 'ok' : 'fail') as Tone }]
        : [{ labelAr: 'الطور المترسّب', value: phase, tone: 'info' as const }]),
    ],
    verdictAr: failed
      ? 'شبكة الحدود الحبيبية صارت مسارًا مستمرًّا بلا حماية. القطعة تتفتّت إلى حبيبات، ويتحوّل رنينها عند الطرق إلى صوت مكتوم.'
      : !inRange
        ? stainless
          ? 'خارج النطاق الحرج لا يترسّب الكربيد مهما طال الزمن. المشكلة كلّها في هذا النطاق الضيّق — وهو بالضبط ما يمرّ به المعدن على جانبي اللحام.'
          : `تحت ${w.lowC} °م لا يترسّب β مهما طال الزمن — ولهذا حدّ خدمة 5083 هو 65 °م لا أكثر.`
        : alloy.susceptibility.igc < 0.2
          ? `${alloy.label} محمية: ${alloy.id === '321' ? 'التيتانيوم يرتبط بالكربون قبل أن يصل إلى الكروم' : 'الكربون أقلّ من 0.03% فلا يتبقّى ما يترسّب'}. لاحظ كم يطول زمن بدء التحسّس مقارنةً بـ 304.`
          : stainless
            ? `عند ${fmt(p.tempC, 0)} °م يبدأ التحسّس خلال ${fmtHours(ts)} فقط. هذا هو Weld Decay: شريطان على جانبي اللحام لا اللحام نفسه.`
            : `عند ${fmt(p.tempC, 0)} °م يبدأ التحسّس خلال ${fmtHours(ts)}. خزّان يعمل دافئًا لأشهر يخرج من الخدمة وهو يبدو سليمًا — اختبار ASTM G67 يكشفه.`,
  }
}

// ------------------------------------------------------------------ hydrogen

/** Threshold stress as a fraction of Rp0.2 at a given absorbed hydrogen level. */
export function hydrogenThreshold(alloy: Alloy, ppm: number): number {
  const s = alloy.susceptibility.hydrogen
  return clamp(1 - 0.9 * s * (1 - Math.exp(-ppm / 1.5)), 0.05, 1)
}

function hydrogen(alloy: Alloy, mode: FailureMode, p: Params): TestState {
  const th = hydrogenThreshold(alloy, p.hydrogenPpm)
  const sf = p.stressFrac
  const failed = sf > th
  const margin = th - sf
  const severity = clamp((sf - th * 0.7) / Math.max(0.05, th * 0.3))
  const hrc = clamp((alloy.hardness - 150) / 300) * 40 + 8 // rough HB → HRC

  return {
    alloy, mode,
    stageAr: failed ? 'تشقّق مؤجَّل — كسر بين-حبيبي' : p.hydrogenPpm < 0.2 ? 'خالٍ من الهيدروجين' : severity > 0.5 ? 'الهيدروجين يتجمّع أمام طرف الشقّ' : 'الهيدروجين مذاب دون ضرر',
    stageTone: failed ? 'fail' : severity > 0.5 ? 'warn' : 'ok',
    progress: clamp(sf / Math.max(0.05, th)),
    failed,
    utilisation: clamp(sf / Math.max(0.05, th)),
    peakStressMPa: sf * alloy.Rp02,
    curveMarker: null,
    geom: {
      ...ZERO_GEOM,
      axialStrain: (sf * alloy.Rp02) / emod(alloy),
      crackDepth: failed ? 1 : severity * 0.5,
      crackAngle: 0,
      gap: failed ? 0.08 : 0,
      gbOpen: failed ? 0.6 : severity * 0.3,
      brittle: 1,
    },
    readouts: [
      { labelAr: 'الهيدروجين الممتصّ', value: fmt(p.hydrogenPpm, 2), unit: 'ppm', tone: p.hydrogenPpm > 1 ? 'warn' : 'ok' },
      { labelAr: 'الإجهاد المسلّط', value: fmt(sf * alloy.Rp02, 0), unit: 'MPa' },
      { labelAr: 'إجهاد العتبة', value: `${fmt(th * 100, 0)}% من Rp0.2`, unit: '', tone: failed ? 'fail' : 'info' },
      { labelAr: 'هامش الأمان', value: fmt(margin * 100, 0), unit: 'نقطة %', tone: margin < 0.1 ? 'fail' : margin < 0.3 ? 'warn' : 'ok' },
      { labelAr: 'القساوة التقريبية', value: fmt(hrc, 0), unit: 'HRC', tone: hrc > 22 ? 'fail' : 'ok' },
      { labelAr: 'حدّ NACE MR0175', value: '22', unit: 'HRC', tone: 'info' },
      { labelAr: 'البنية', value: `${alloy.lattice} — ${alloy.susceptibility.hydrogen < 0.2 ? 'مقاوِمة' : alloy.susceptibility.hydrogen < 0.6 ? 'متوسّطة' : 'قابلة'}`, tone: alloy.susceptibility.hydrogen > 0.5 ? 'fail' : 'ok' },
    ],
    verdictAr: failed
      ? `فشل عند ${fmt(sf * 100, 0)}% من Rp0.2 بينما العتبة ${fmt(th * 100, 0)}% — أي تحت إجهاد التصميم. والفشل مؤجَّل: قد يقع بعد ساعات من التحميل، فينفصل السبب عن النتيجة ويصعب التشخيص.`
      : alloy.susceptibility.hydrogen < 0.2
        ? `البنية ${alloy.lattice} ${alloy.family === 'stainless' ? 'الأوستنيتية تذيب الهيدروجين وتنتشر فيه ببطء شديد — ولهذا تُعدّ الخيار الآمن في الخدمة الحامضة' : 'لا تتقصّف بالهيدروجين بالمعنى الفولاذي'}.`
        : hrc > 22
          ? `القساوة ${fmt(hrc, 0)} HRC فوق حدّ NACE البالغ 22. ارفع الهيدروجين قليلًا وراقب انهيار العتبة.`
          : 'العتبة ما زالت فوق الإجهاد المسلّط — لكن الهامش يضيق بسرعة مع كل جزء في المليون.',
  }
}
