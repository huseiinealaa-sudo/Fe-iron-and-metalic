/**
 * The alloys — stainless steels first, then the other families the same tests
 * are run on: structural and quenched steels, cast irons, aluminium, copper
 * alloys, titanium and a tin solder.
 *
 * Sources of the numbers: ASTM A240 / A276 / A36 / B209 / B265, EN 10088,
 * EN 1561/1563, EN 573, the ASM Specialty Handbooks and the ASM Metals Handbook
 * Desk Edition; minima widened to realistic mill typicals. Every field is SI:
 * stress in MPa, modulus in GPa, temperature in °C, melting point in K.
 *
 * `n` is the Hollomon strain-hardening exponent, tuned so that the uniform
 * elongation it implies (exp(n) - 1) matches the published elongation of the
 * grade. The strength coefficient K is derived from n and Rm in engine/curve.ts
 * rather than stored, so the curve can never disagree with the tensile numbers.
 *
 * Grades with elongation under 2% (grey iron) take a separate concave curve in
 * engine/curve.ts: Hollomon cannot reach Rm before such a small fracture strain.
 */

export type Family =
  | 'stainless' | 'carbon-steel' | 'cast-iron' | 'aluminium' | 'copper' | 'titanium' | 'tin'

export const FAMILY_AR: Record<Family, string> = {
  stainless: 'فولاذ غير قابل للصدأ',
  'carbon-steel': 'فولاذ كربوني وسبائكي',
  'cast-iron': 'حديد زهر',
  aluminium: 'ألمنيوم',
  copper: 'نحاس وسبائكه',
  titanium: 'تيتانيوم',
  tin: 'قصدير — لحام',
}

export const FAMILY_ORDER: Family[] = [
  'stainless', 'carbon-steel', 'cast-iron', 'aluminium', 'copper', 'titanium', 'tin',
]

export type Structure =
  | 'austenitic' | 'ferritic' | 'duplex' | 'martensitic-ph'
  | 'ferritic-pearlitic' | 'tempered-martensite' | 'grey-iron' | 'ductile-iron'
  | 'age-hardened' | 'strain-hardened' | 'alpha-beta' | 'beta-tin'

/** Crystal lattice — what decides whether there is a ductile-to-brittle transition. */
export type Lattice = 'FCC' | 'BCC' | 'BCT' | 'HCP' | 'FCC+BCC' | 'BCC+graphite' | 'HCP+BCC'

/** The temperature window in which a boundary phase steals the protective element. */
export interface SensitisationWindow {
  lowC: number
  highC: number
  noseC: number
  widthC: number
  /** Hours at the nose. Omitted: derived from the IGC susceptibility. */
  baseHours?: number
}

export interface Alloy {
  id: string
  /** EN / UNS designation, kept in English exactly as the standards write it. */
  en: string
  label: string
  family: Family
  structure: Structure
  structureAr: string
  lattice: Lattice

  // --- elastic constants ---
  /** Young's modulus, GPa. */
  E: number
  /** Poisson's ratio. */
  nu: number
  /** Density, kg/m3. */
  rho: number
  /** Melting point (solidus), K. Creep is scaled on homologous temperature. */
  tmK: number

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
  /** Compressive strength for grades that crush rather than yield, MPa. */
  compressive?: number

  // --- fracture and fatigue ---
  /** Plane-strain fracture toughness K_IC, MPa*sqrt(m). */
  kic: number
  /** Fatigue strength at 1e7 cycles, fully reversed, MPa. */
  fatigue1e7: number
  /** Paris law coefficient C for da/dN in m/cycle, dK in MPa*sqrt(m). */
  parisC: number
  /** Paris law exponent m. */
  parisM: number
  /** Ductile-to-brittle transition temperature, °C. null = no transition. */
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
    /** Stress corrosion cracking in the grade's own critical environment. */
    scc: number
    /** Sensitisation / intergranular attack. */
    igc: number
    /** Hydrogen embrittlement. */
    hydrogen: number
  }
  /** Temperature above which SCC becomes possible, °C. Omitted: from susceptibility. */
  sccThresholdC?: number
  /** Critical pitting temperature, °C, for grades where PREN has no meaning. */
  cptC?: number
  /** Sensitisation window. Omitted: the stainless 425–815 °C window. */
  sensitisation?: SensitisationWindow

  /** Maximum continuous service temperature, °C. */
  maxServiceC: number
  /** Failure modes that are physically meaningless for the grade, with the reason. */
  notApplicable?: Partial<Record<string, string>>
  /** One line of Arabic on where the grade belongs. */
  noteAr: string
}

/** PREN — Pitting Resistance Equivalent Number. Meaningful for stainless only. */
export function pren(a: Alloy): number {
  return a.cr + 3.3 * a.mo + 16 * a.nItr
}

/**
 * Critical Pitting Temperature, °C.
 * Stainless: a linear fit to ASTM G48 Method E data across the alloy range.
 * Everything else carries its own published figure.
 */
export function cpt(a: Alloy): number {
  if (a.cptC !== undefined) return a.cptC
  return Math.round(2.5 * pren(a) - 37)
}

/** Shear modulus, GPa, from E and nu. */
export function shearModulus(a: Alloy): number {
  return a.E / (2 * (1 + a.nu))
}

/** Grades that fracture before any plastic flow worth the name. */
export function isBrittle(a: Alloy): boolean {
  return a.elong < 0.02
}

/** The stainless window is the default; Al-Mg alloys carry their own. */
export function sensitisationWindow(a: Alloy): SensitisationWindow {
  return a.sensitisation ?? { lowC: 425, highC: 815, noseC: 700, widthC: 120 }
}

/** Temperature above which the grade's SCC can start, °C. */
export function sccThreshold(a: Alloy): number {
  return a.sccThresholdC ?? 50 + 100 * (1 - a.susceptibility.scc)
}

const NO_PASSIVE_FILM = 'لا طبقة تخميل هنا: هذا المعدن يتآكل تآكلًا عامًّا موزّعًا على السطح كلّه، لا نقرًا موضعيًّا نافذًا. النقر ظاهرة المعادن المخمَّلة.'
const NO_SENSITISATION = 'التحسّس ظاهرة السبائك التي تعتمد حمايتها على عنصر يُستنفد عند الحدود الحبيبية (الكروم في الفولاذ غير القابل للصدأ، والمغنيسيوم في Al-Mg). لا يوجد ما يُستنفد هنا.'

export const ALLOYS: Alloy[] = [
  // ================================================================ stainless
  {
    id: '304', en: '1.4301', label: '304', family: 'stainless',
    structure: 'austenitic', structureAr: 'أوستنيتي', lattice: 'FCC',
    E: 193, nu: 0.29, rho: 8000, tmK: 1700,
    Rp02: 250, Rm: 600, elong: 0.55, ra: 0.7, n: 0.37, hardness: 160,
    kic: 220, fatigue1e7: 240, parisC: 5.6e-12, parisM: 3.1, dbtt: null, cvnUpper: 190,
    cr: 18.2, ni: 8.5, mo: 0, nItr: 0.05, c: 0.06,
    susceptibility: { scc: 1.0, igc: 0.85, hydrogen: 0.1 },
    maxServiceC: 870,
    noteAr: 'السبيكة الأكثر شيوعًا. مطيلة جدًّا وصلبة عند كل درجات الحرارة، لكنها الأضعف أمام تشقّق الكلوريدات.',
  },
  {
    id: '316L', en: '1.4404', label: '316L', family: 'stainless',
    structure: 'austenitic', structureAr: 'أوستنيتي', lattice: 'FCC',
    E: 193, nu: 0.29, rho: 8000, tmK: 1670,
    Rp02: 240, Rm: 560, elong: 0.5, ra: 0.68, n: 0.34, hardness: 155,
    kic: 210, fatigue1e7: 225, parisC: 6.0e-12, parisM: 3.1, dbtt: null, cvnUpper: 180,
    cr: 17.0, ni: 11.5, mo: 2.3, nItr: 0.05, c: 0.02,
    susceptibility: { scc: 0.9, igc: 0.12, hydrogen: 0.1 },
    maxServiceC: 870,
    noteAr: 'إضافة Mo ترفع مقاومة النقر، وخفض الكربون (L) يمنع التحسّس عند اللحام.',
  },
  {
    id: '321', en: '1.4541', label: '321', family: 'stainless',
    structure: 'austenitic', structureAr: 'أوستنيتي مثبّت', lattice: 'FCC',
    E: 193, nu: 0.29, rho: 8000, tmK: 1700,
    Rp02: 235, Rm: 560, elong: 0.45, ra: 0.65, n: 0.31, hardness: 160,
    kic: 200, fatigue1e7: 220, parisC: 6.2e-12, parisM: 3.1, dbtt: null, cvnUpper: 175,
    cr: 17.5, ni: 9.5, mo: 0, nItr: 0.04, c: 0.05,
    susceptibility: { scc: 0.95, igc: 0.08, hydrogen: 0.1 },
    maxServiceC: 900,
    noteAr: 'مثبّتة بالتيتانيوم: يرتبط الكربون كـ TiC فلا يتبقّى ما يستهلك الكروم عند الحدود الحبيبية.',
  },
  {
    id: '430', en: '1.4016', label: '430', family: 'stainless',
    structure: 'ferritic', structureAr: 'فرّيتي', lattice: 'BCC',
    E: 200, nu: 0.3, rho: 7700, tmK: 1750,
    Rp02: 310, Rm: 500, elong: 0.22, ra: 0.5, n: 0.16, hardness: 175,
    kic: 90, fatigue1e7: 230, parisC: 8.5e-12, parisM: 3.3, dbtt: 25, cvnUpper: 60,
    cr: 16.5, ni: 0.3, mo: 0, nItr: 0.03, c: 0.06,
    susceptibility: { scc: 0.1, igc: 0.6, hydrogen: 0.45 },
    maxServiceC: 815,
    noteAr: 'بنية BCC بلا نيكل: رخيصة ومقاوِمة لتشقّق الكلوريدات، لكنها تصبح قصفة تحت درجة الانتقال DBTT.',
  },
  {
    id: '2205', en: '1.4462', label: '2205', family: 'stainless',
    structure: 'duplex', structureAr: 'ثنائي الطور', lattice: 'FCC+BCC',
    E: 200, nu: 0.3, rho: 7800, tmK: 1720,
    Rp02: 480, Rm: 760, elong: 0.25, ra: 0.55, n: 0.18, hardness: 260,
    kic: 140, fatigue1e7: 330, parisC: 5.0e-12, parisM: 3.2, dbtt: -50, cvnUpper: 120,
    cr: 22.0, ni: 5.5, mo: 3.1, nItr: 0.16, c: 0.02,
    susceptibility: { scc: 0.2, igc: 0.15, hydrogen: 0.55 },
    maxServiceC: 300,
    noteAr: 'ضعف مقاومة الخضوع مع مقاومة ممتازة لتشقّق الكلوريدات — لكن لا تتجاوز 300 °م بسبب هشاشة 475 °م وطور سيجما.',
  },
  {
    id: '904L', en: '1.4539', label: '904L', family: 'stainless',
    structure: 'austenitic', structureAr: 'أوستنيتي فائق', lattice: 'FCC',
    E: 195, nu: 0.29, rho: 8000, tmK: 1650,
    Rp02: 230, Rm: 560, elong: 0.4, ra: 0.62, n: 0.28, hardness: 165,
    kic: 200, fatigue1e7: 225, parisC: 6.0e-12, parisM: 3.1, dbtt: null, cvnUpper: 180,
    cr: 20.0, ni: 25.0, mo: 4.4, nItr: 0.05, c: 0.015,
    susceptibility: { scc: 0.18, igc: 0.08, hydrogen: 0.1 },
    maxServiceC: 400,
    noteAr: 'النيكل العالي (25%) هو ما يُخرجها من نطاق تشقّق الكلوريدات، وMo العالي يرفع PREN فوق 35.',
  },
  {
    id: '17-4PH', en: '1.4542', label: '17-4 PH (H900)', family: 'stainless',
    structure: 'martensitic-ph', structureAr: 'مارتنزيتي بترسيب', lattice: 'BCT',
    E: 196, nu: 0.27, rho: 7800, tmK: 1700,
    Rp02: 1170, Rm: 1310, elong: 0.1, ra: 0.4, n: 0.05, hardness: 420,
    kic: 55, fatigue1e7: 560, parisC: 1.1e-11, parisM: 3.5, dbtt: 10, cvnUpper: 25,
    cr: 16.0, ni: 4.2, mo: 0.2, nItr: 0.02, c: 0.04,
    susceptibility: { scc: 0.5, igc: 0.2, hydrogen: 1.0 },
    maxServiceC: 300,
    noteAr: 'الأقوى بين الفولاذ غير القابل للصدأ وأقلّها تسامحًا: عند 420 HB تتجاوز عتبة 22 HRC فتصبح شديدة القابلية لتقصّف الهيدروجين.',
  },

  // ============================================================ carbon steel
  {
    id: 'S235', en: '1.0038 / A36', label: 'S235 إنشائي', family: 'carbon-steel',
    structure: 'ferritic-pearlitic', structureAr: 'فرّيتي-بيرلايتي', lattice: 'BCC',
    E: 210, nu: 0.3, rho: 7850, tmK: 1770,
    Rp02: 250, Rm: 400, elong: 0.26, ra: 0.6, n: 0.2, hardness: 115,
    kic: 150, fatigue1e7: 190, parisC: 6.9e-12, parisM: 3.0, dbtt: -20, cvnUpper: 120,
    cr: 0.1, ni: 0.1, mo: 0, nItr: 0.005, c: 0.15,
    susceptibility: { scc: 0.3, igc: 0, hydrogen: 0.3 },
    sccThresholdC: 60,
    maxServiceC: 400,
    notApplicable: { pitting: NO_PASSIVE_FILM, igc: NO_SENSITISATION },
    noteAr: 'فولاذ الجسور والهياكل. رخيص ولحيم ومطيل، لكنه بلا حماية ذاتية: يصدأ، وله درجة انتقال قريبة من حرارة الشتاء.',
  },
  {
    id: '4140', en: '1.7225 / 42CrMo4', label: '4140 مقسّى', family: 'carbon-steel',
    structure: 'tempered-martensite', structureAr: 'مارتنزيت مُرجَع', lattice: 'BCC',
    E: 205, nu: 0.29, rho: 7850, tmK: 1700,
    Rp02: 800, Rm: 1000, elong: 0.14, ra: 0.5, n: 0.1, hardness: 300,
    kic: 80, fatigue1e7: 470, parisC: 1.0e-11, parisM: 3.2, dbtt: -40, cvnUpper: 70,
    cr: 1.0, ni: 0.2, mo: 0.2, nItr: 0, c: 0.4,
    susceptibility: { scc: 0.45, igc: 0, hydrogen: 0.85 },
    sccThresholdC: 20,
    maxServiceC: 450,
    notApplicable: { pitting: NO_PASSIVE_FILM, igc: NO_SENSITISATION },
    noteAr: 'فولاذ الأعمدة والمسامير عالية المتانة. عند 300 HB يدخل نطاق تقصّف الهيدروجين، وهو المثال الكلاسيكي للفشل بعد الطلاء الكهربائي.',
  },

  // ================================================================ cast iron
  {
    id: 'GJL250', en: 'EN-GJL-250 / GG25', label: 'حديد زهر رمادي', family: 'cast-iron',
    structure: 'grey-iron', structureAr: 'رقائق جرافيت في بيرلايت', lattice: 'BCC+graphite',
    E: 110, nu: 0.26, rho: 7200, tmK: 1450,
    Rp02: 170, Rm: 250, elong: 0.008, ra: 0.02, n: 0.1, hardness: 210, compressive: 850,
    kic: 20, fatigue1e7: 110, parisC: 2.0e-11, parisM: 3.5, dbtt: 400, cvnUpper: 12,
    cr: 0, ni: 0, mo: 0, nItr: 0, c: 3.3,
    susceptibility: { scc: 0.05, igc: 0, hydrogen: 0.05 },
    maxServiceC: 400,
    notApplicable: {
      pitting: 'حديد الزهر يتآكل تآكلًا جرافيتيًّا Graphitic Corrosion: يذوب الحديد ويبقى هيكل الجرافيت الأسود الطريّ. عامّ لا نقري.',
      igc: NO_SENSITISATION,
      scc: 'لا تُسجَّل له حالات تشقّق إجهادي عملية؛ هو قصف أصلًا ويفشل بالحمل مباشرةً.',
      hydrogen: 'رقائق الجرافيت تجعله قصفًا أصلًا؛ الهيدروجين لا يضيف شيئًا يُقاس.',
    },
    noteAr: 'كتل المحرّكات والمشدّات. رقائق الجرافيت شقوق جاهزة: 0.8% استطالة فقط، وقصف عند كل حرارة — لكنه يحمل في الضغط ثلاثة أضعاف ما يحمله في الشدّ.',
  },
  {
    id: 'GJS400', en: 'EN-GJS-400-15', label: 'حديد زهر مطيل', family: 'cast-iron',
    structure: 'ductile-iron', structureAr: 'جرافيت كروي في فرّيت', lattice: 'BCC+graphite',
    E: 169, nu: 0.275, rho: 7100, tmK: 1420,
    Rp02: 250, Rm: 400, elong: 0.15, ra: 0.2, n: 0.11, hardness: 150,
    kic: 45, fatigue1e7: 180, parisC: 1.3e-11, parisM: 3.3, dbtt: -10, cvnUpper: 16,
    cr: 0, ni: 0, mo: 0, nItr: 0, c: 3.5,
    susceptibility: { scc: 0.1, igc: 0, hydrogen: 0.15 },
    maxServiceC: 400,
    notApplicable: {
      pitting: 'يتآكل تآكلًا جرافيتيًّا عامًّا كالزهر الرمادي، لا نقرًا.',
      igc: NO_SENSITISATION,
    },
    noteAr: 'المغنيسيوم يكوّر الجرافيت فتزول الشقوق الجاهزة: 15% استطالة بدل 0.8%. أنابيب المياه وأذرع التعليق.',
  },

  // ================================================================ aluminium
  {
    id: '6061', en: 'EN AW-6061-T6', label: '6061-T6', family: 'aluminium',
    structure: 'age-hardened', structureAr: 'مصلَّد بالترسيب T6', lattice: 'FCC',
    E: 69, nu: 0.33, rho: 2700, tmK: 855,
    Rp02: 275, Rm: 310, elong: 0.12, ra: 0.35, n: 0.06, hardness: 95,
    kic: 29, fatigue1e7: 96, parisC: 3.0e-11, parisM: 3.0, dbtt: null, cvnUpper: 20,
    cr: 0.2, ni: 0, mo: 0, nItr: 0, c: 0,
    susceptibility: { scc: 0.15, igc: 0.15, hydrogen: 0.05 },
    sccThresholdC: 40, cptC: 12,
    maxServiceC: 150,
    notApplicable: {
      igc: 'التحسّس البيّن خاصّ بسبائك Al-Mg عالية المغنيسيوم (5xxx). 6061 تُصنَّف مقاوِمة للتآكل بين-الحبيبي.',
      hydrogen: 'الألمنيوم محصَّن عمليًّا ضدّ تقصّف الهيدروجين بالمعنى الفولاذي.',
    },
    noteAr: 'سبيكة الألمنيوم الإنشائية الأشهر: هياكل الدرّاجات والهياكل الخفيفة. ثلث وزن الفولاذ وثلث صلابته، وبلا حدّ كلال.',
  },
  {
    id: '7075', en: 'EN AW-7075-T6', label: '7075-T6', family: 'aluminium',
    structure: 'age-hardened', structureAr: 'مصلَّد بالترسيب T6', lattice: 'FCC',
    E: 71, nu: 0.33, rho: 2810, tmK: 750,
    Rp02: 503, Rm: 572, elong: 0.11, ra: 0.3, n: 0.05, hardness: 150,
    kic: 24, fatigue1e7: 159, parisC: 4.0e-11, parisM: 3.1, dbtt: null, cvnUpper: 12,
    cr: 0.2, ni: 0, mo: 0, nItr: 0, c: 0,
    susceptibility: { scc: 0.75, igc: 0.4, hydrogen: 0.1 },
    sccThresholdC: 20, cptC: 5,
    maxServiceC: 120,
    notApplicable: {
      igc: 'نمط 7075 هو التآكل التقشّري Exfoliation في الاتجاه العرضي، وهو غير التحسّس ولا يُمثَّل هنا.',
      hydrogen: 'الألمنيوم محصَّن عمليًّا ضدّ تقصّف الهيدروجين بالمعنى الفولاذي.',
    },
    noteAr: 'أقوى سبائك الألمنيوم الشائعة — متانة فولاذ إنشائي بثلث الوزن. الثمن: تشقّق إجهادي في الهواء الرطب عند حرارة الغرفة، ومقاومة تآكل رديئة.',
  },
  {
    id: '5083', en: 'EN AW-5083-H116', label: '5083-H116', family: 'aluminium',
    structure: 'strain-hardened', structureAr: 'مصلَّد بالتشغيل', lattice: 'FCC',
    E: 71, nu: 0.33, rho: 2660, tmK: 850,
    Rp02: 228, Rm: 317, elong: 0.16, ra: 0.4, n: 0.12, hardness: 85,
    kic: 40, fatigue1e7: 130, parisC: 3.0e-11, parisM: 3.0, dbtt: null, cvnUpper: 25,
    cr: 0.1, ni: 0, mo: 0, nItr: 0, c: 0,
    susceptibility: { scc: 0.35, igc: 0.6, hydrogen: 0.05 },
    sccThresholdC: 65, cptC: 30,
    sensitisation: { lowC: 50, highC: 200, noseC: 120, widthC: 40, baseHours: 200 },
    maxServiceC: 65,
    notApplicable: {
      hydrogen: 'الألمنيوم محصَّن عمليًّا ضدّ تقصّف الهيدروجين بالمعنى الفولاذي.',
    },
    noteAr: 'سبيكة القوارب وخزّانات الغاز المسال. ممتازة في ماء البحر — ما دامت تحت 65 °م، فوقها يترسّب Mg2Al3 عند الحدود وتتحسّس خلال أشهر.',
  },

  // =================================================================== copper
  {
    id: 'CuZn37', en: 'CW508L / C27200', label: 'نحاس أصفر CuZn37', family: 'copper',
    structure: 'strain-hardened', structureAr: 'أوستنيتي α نصف صلد', lattice: 'FCC',
    E: 110, nu: 0.34, rho: 8440, tmK: 1175,
    Rp02: 250, Rm: 400, elong: 0.25, ra: 0.5, n: 0.18, hardness: 110,
    kic: 70, fatigue1e7: 110, parisC: 8.0e-12, parisM: 3.2, dbtt: null, cvnUpper: 70,
    cr: 0, ni: 0, mo: 0, nItr: 0, c: 0,
    susceptibility: { scc: 0.9, igc: 0.5, hydrogen: 0.05 },
    sccThresholdC: 20, cptC: 40,
    maxServiceC: 200,
    notApplicable: {
      igc: 'نمط النحاس الأصفر هو نزع الزنك Dezincification — إذابة انتقائية تترك إسفنجة نحاس هشّة — وهو غير التحسّس ولا يُمثَّل هنا.',
      hydrogen: 'النحاس وسبائكه لا تتقصّف بالهيدروجين إلّا في وجود الأكسجين المذاب (Hydrogen Sickness) وهي حالة أخرى.',
    },
    noteAr: 'الخراطيش والصنابير. مطيل جدًّا ويتشكّل ببرودة، لكنه يتشقّق في أثر أمونيا مع إجهاد تشغيل متبقّ — التشقّق الموسمي Season Cracking.',
  },
  {
    id: 'CuSn8', en: 'CW453K / C52100', label: 'برونز فوسفوري CuSn8', family: 'copper',
    structure: 'strain-hardened', structureAr: 'أوستنيتي α صلد', lattice: 'FCC',
    E: 110, nu: 0.34, rho: 8800, tmK: 1120,
    Rp02: 350, Rm: 560, elong: 0.25, ra: 0.45, n: 0.18, hardness: 150,
    kic: 60, fatigue1e7: 180, parisC: 8.0e-12, parisM: 3.2, dbtt: null, cvnUpper: 60,
    cr: 0, ni: 0, mo: 0, nItr: 0, c: 0,
    susceptibility: { scc: 0.15, igc: 0.05, hydrogen: 0.05 },
    sccThresholdC: 60, cptC: 60,
    maxServiceC: 200,
    notApplicable: {
      igc: 'البرونز لا يتحسّس ولا يُنزَع منه القصدير بالمعنى الذي يُنزَع به الزنك من النحاس الأصفر.',
      hydrogen: 'النحاس وسبائكه لا تتقصّف بالهيدروجين إلّا في وجود الأكسجين المذاب.',
    },
    noteAr: 'النوابض والمحامل وأدوات الملاحة. القصدير يحسّن مقاومة التآكل والكلال معًا، وهو أفضل من النحاس الأصفر في ماء البحر بوضوح.',
  },

  // ================================================================= titanium
  {
    id: 'Ti64', en: 'Ti-6Al-4V / Grade 5', label: 'Ti-6Al-4V', family: 'titanium',
    structure: 'alpha-beta', structureAr: 'ألفا + بيتا مُلدَّن', lattice: 'HCP+BCC',
    E: 114, nu: 0.34, rho: 4430, tmK: 1877,
    Rp02: 880, Rm: 950, elong: 0.14, ra: 0.36, n: 0.06, hardness: 334,
    kic: 75, fatigue1e7: 510, parisC: 1.5e-11, parisM: 3.4, dbtt: null, cvnUpper: 25,
    cr: 0, ni: 0, mo: 0, nItr: 0, c: 0,
    susceptibility: { scc: 0.3, igc: 0.05, hydrogen: 0.7 },
    sccThresholdC: 60, cptC: 120,
    maxServiceC: 400,
    notApplicable: {
      igc: 'التيتانيوم لا يتحسّس: طبقة TiO2 لا تعتمد على عنصر يُستنفد عند الحدود الحبيبية.',
    },
    noteAr: 'الطائرات والزرعات الطبّية. متانة فولاذ مقسّى بنصف الوزن، وTiO2 تجعله شبه محصَّن في ماء البحر — لكن الهيدروجين يكوّن فيه هيدريدات هشّة.',
  },

  // ====================================================================== tin
  {
    id: 'SAC305', en: 'Sn-3.0Ag-0.5Cu', label: 'لحام SAC305', family: 'tin',
    structure: 'beta-tin', structureAr: 'قصدير β مع Ag3Sn', lattice: 'BCT',
    E: 50, nu: 0.4, rho: 7400, tmK: 490,
    Rp02: 32, Rm: 45, elong: 0.25, ra: 0.6, n: 0.15, hardness: 15,
    kic: 10, fatigue1e7: 12, parisC: 5.0e-10, parisM: 3.0, dbtt: null, cvnUpper: 8,
    cr: 0, ni: 0, mo: 0, nItr: 0, c: 0,
    susceptibility: { scc: 0.05, igc: 0, hydrogen: 0.02 },
    maxServiceC: 100,
    notApplicable: {
      pitting: 'القصدير لا يُخمَّل بالمعنى المفيد؛ تآكله عامّ وبطيء. النقر ليس نمط فشله.',
      igc: NO_SENSITISATION,
      scc: 'لا تشقّق إجهادي عمليّ للحام القصديري؛ يفشل بالزحف والكلال الحراري.',
      hydrogen: 'لا يُذكر للقصدير.',
    },
    noteAr: 'لحام الإلكترونيات الخالي من الرصاص. ينصهر عند 217 °م، فحرارة الغرفة تعادل 60% من انصهاره بالكلفن: يزحف على مكتبك، ولهذا تفشل وصلات BGA بالدورات الحرارية.',
  },
]

export const DEFAULT_ALLOY_ID = '304'

export function alloyById(id: string): Alloy {
  return ALLOYS.find((a) => a.id === id) ?? ALLOYS[0]
}

/** Whether a failure mode has any physical meaning for the grade. */
export function modeApplies(a: Alloy, modeId: string): boolean {
  return !(a.notApplicable && modeId in a.notApplicable)
}
