/**
 * Stainless steel grades — annealed, room-temperature typical values.
 *
 * Sources of the numbers: ASTM A240 / A276 minima widened to realistic mill
 * typicals, EN 10088-2, and the ASM Specialty Handbook "Stainless Steels".
 * Every field is SI: stress in MPa, modulus in GPa, temperature in °C.
 *
 * `n` is the Hollomon strain-hardening exponent, tuned so that the uniform
 * elongation it implies (exp(n) - 1) matches the published elongation of the
 * grade. The strength coefficient K is derived from n and Rm in engine/curve.ts
 * rather than stored, so the curve can never disagree with the tensile numbers.
 */

export type Structure = 'austenitic' | 'ferritic' | 'duplex' | 'martensitic-ph'

export interface Alloy {
  id: string
  /** EN / DIN designation, kept in English exactly as the standards write it. */
  en: string
  label: string
  structure: Structure
  structureAr: string

  // --- elastic constants ---
  /** Young's modulus, GPa. */
  E: number
  /** Poisson's ratio. */
  nu: number
  /** Density, kg/m3. */
  rho: number

  // --- tensile properties ---
  /** Rp0.2 proof strength, MPa. */
  Rp02: number
  /** Rm ultimate tensile strength, MPa. */
  Rm: number
  /** A5 total elongation at fracture, engineering strain (not %). */
  elong: number
  /** Reduction of area at fracture, fraction. */
  ra: number
  /** Hollomon strain-hardening exponent. */
  n: number
  /** Typical hardness, HB. */
  hardness: number

  // --- fracture and fatigue ---
  /** Plane-strain fracture toughness K_IC, MPa*sqrt(m). */
  kic: number
  /** Fatigue strength at 1e7 cycles, fully reversed, MPa. */
  fatigue1e7: number
  /** Paris law coefficient C for da/dN in m/cycle, dK in MPa*sqrt(m). */
  parisC: number
  /** Paris law exponent m. */
  parisM: number
  /** Ductile-to-brittle transition temperature, °C. null = no transition (FCC). */
  dbtt: number | null
  /** Upper-shelf Charpy V-notch energy, J. */
  cvnUpper: number

  // --- composition that drives corrosion behaviour, weight % ---
  cr: number
  ni: number
  mo: number
  nItr: number
  c: number

  // --- environmental susceptibility, 0 = immune, 1 = worst in this set ---
  susceptibility: {
    /** Chloride stress corrosion cracking. */
    scc: number
    /** Sensitisation / intergranular attack. */
    igc: number
    /** Hydrogen embrittlement. */
    hydrogen: number
  }

  /** Maximum continuous service temperature, °C. */
  maxServiceC: number
  /** One line of Arabic on where the grade belongs. */
  noteAr: string
}

/** PREN — Pitting Resistance Equivalent Number. The standard Cr+3.3Mo+16N form. */
export function pren(a: Alloy): number {
  return a.cr + 3.3 * a.mo + 16 * a.nItr
}

/**
 * Critical Pitting Temperature, °C, from PREN.
 * Linear fit to ASTM G48 Method E data across this alloy range.
 */
export function cpt(a: Alloy): number {
  return Math.round(2.5 * pren(a) - 37)
}

/** Shear modulus, GPa, from E and nu. */
export function shearModulus(a: Alloy): number {
  return a.E / (2 * (1 + a.nu))
}

export const ALLOYS: Alloy[] = [
  {
    id: '304',
    en: '1.4301',
    label: '304',
    structure: 'austenitic',
    structureAr: 'أوستنيتي',
    E: 193, nu: 0.29, rho: 8000,
    Rp02: 250, Rm: 600, elong: 0.55, ra: 0.7, n: 0.37, hardness: 160,
    kic: 220, fatigue1e7: 240, parisC: 5.6e-12, parisM: 3.1, dbtt: null, cvnUpper: 190,
    cr: 18.2, ni: 8.5, mo: 0, nItr: 0.05, c: 0.06,
    susceptibility: { scc: 1.0, igc: 0.85, hydrogen: 0.1 },
    maxServiceC: 870,
    noteAr: 'السبيكة الأكثر شيوعًا. مطيلة جدًا وصلبة عند كل درجات الحرارة، لكنها الأضعف أمام تشقّق الكلوريدات.',
  },
  {
    id: '316L',
    en: '1.4404',
    label: '316L',
    structure: 'austenitic',
    structureAr: 'أوستنيتي',
    E: 193, nu: 0.29, rho: 8000,
    Rp02: 240, Rm: 560, elong: 0.5, ra: 0.68, n: 0.34, hardness: 155,
    kic: 210, fatigue1e7: 225, parisC: 6.0e-12, parisM: 3.1, dbtt: null, cvnUpper: 180,
    cr: 17.0, ni: 11.5, mo: 2.3, nItr: 0.05, c: 0.02,
    susceptibility: { scc: 0.9, igc: 0.12, hydrogen: 0.1 },
    maxServiceC: 870,
    noteAr: 'إضافة Mo ترفع مقاومة النقر، وخفض الكربون (L) يمنع التحسّس عند اللحام.',
  },
  {
    id: '321',
    en: '1.4541',
    label: '321',
    structure: 'austenitic',
    structureAr: 'أوستنيتي مثبّت',
    E: 193, nu: 0.29, rho: 8000,
    Rp02: 235, Rm: 560, elong: 0.45, ra: 0.65, n: 0.31, hardness: 160,
    kic: 200, fatigue1e7: 220, parisC: 6.2e-12, parisM: 3.1, dbtt: null, cvnUpper: 175,
    cr: 17.5, ni: 9.5, mo: 0, nItr: 0.04, c: 0.05,
    susceptibility: { scc: 0.95, igc: 0.08, hydrogen: 0.1 },
    maxServiceC: 900,
    noteAr: 'مثبّتة بالتيتانيوم: يرتبط الكربون كـ TiC فلا يتبقّى ما يستهلك الكروم عند الحدود الحبيبية.',
  },
  {
    id: '430',
    en: '1.4016',
    label: '430',
    structure: 'ferritic',
    structureAr: 'فرّيتي',
    E: 200, nu: 0.3, rho: 7700,
    Rp02: 310, Rm: 500, elong: 0.22, ra: 0.5, n: 0.16, hardness: 175,
    kic: 90, fatigue1e7: 230, parisC: 8.5e-12, parisM: 3.3, dbtt: 25, cvnUpper: 60,
    cr: 16.5, ni: 0.3, mo: 0, nItr: 0.03, c: 0.06,
    susceptibility: { scc: 0.1, igc: 0.6, hydrogen: 0.45 },
    maxServiceC: 815,
    noteAr: 'بنية BCC بلا نيكل: رخيصة ومقاوِمة لتشقّق الكلوريدات، لكنها تصبح قصفة تحت درجة الانتقال DBTT.',
  },
  {
    id: '2205',
    en: '1.4462',
    label: '2205',
    structure: 'duplex',
    structureAr: 'ثنائي الطور',
    E: 200, nu: 0.3, rho: 7800,
    Rp02: 480, Rm: 760, elong: 0.25, ra: 0.55, n: 0.18, hardness: 260,
    kic: 140, fatigue1e7: 330, parisC: 5.0e-12, parisM: 3.2, dbtt: -50, cvnUpper: 120,
    cr: 22.0, ni: 5.5, mo: 3.1, nItr: 0.16, c: 0.02,
    susceptibility: { scc: 0.2, igc: 0.15, hydrogen: 0.55 },
    maxServiceC: 300,
    noteAr: 'ضعف مقاومة الخضوع مع مقاومة ممتازة لتشقّق الكلوريدات — لكن لا تتجاوز 300 °م بسبب هشاشة 475 °م وطور سيجما.',
  },
  {
    id: '904L',
    en: '1.4539',
    label: '904L',
    structure: 'austenitic',
    structureAr: 'أوستنيتي فائق',
    E: 195, nu: 0.29, rho: 8000,
    Rp02: 230, Rm: 560, elong: 0.4, ra: 0.62, n: 0.28, hardness: 165,
    kic: 200, fatigue1e7: 225, parisC: 6.0e-12, parisM: 3.1, dbtt: null, cvnUpper: 180,
    cr: 20.0, ni: 25.0, mo: 4.4, nItr: 0.05, c: 0.015,
    susceptibility: { scc: 0.18, igc: 0.08, hydrogen: 0.1 },
    maxServiceC: 400,
    noteAr: 'النيكل العالي (25%) هو ما يُخرجها من نطاق تشقّق الكلوريدات، وMo العالي يرفع PREN فوق 35.',
  },
  {
    id: '17-4PH',
    en: '1.4542',
    label: '17-4 PH (H900)',
    structure: 'martensitic-ph',
    structureAr: 'مارتنزيتي بترسيب',
    E: 196, nu: 0.27, rho: 7800,
    Rp02: 1170, Rm: 1310, elong: 0.1, ra: 0.4, n: 0.05, hardness: 420,
    kic: 55, fatigue1e7: 560, parisC: 1.1e-11, parisM: 3.5, dbtt: 10, cvnUpper: 25,
    cr: 16.0, ni: 4.2, mo: 0.2, nItr: 0.02, c: 0.04,
    susceptibility: { scc: 0.5, igc: 0.2, hydrogen: 1.0 },
    maxServiceC: 300,
    noteAr: 'الأقوى هنا وأقلّها تسامحًا: عند 420 HB تتجاوز عتبة 22 HRC فتصبح شديدة القابلية لتقصّف الهيدروجين.',
  },
]

export const DEFAULT_ALLOY_ID = '304'

export function alloyById(id: string): Alloy {
  return ALLOYS.find((a) => a.id === id) ?? ALLOYS[0]
}
