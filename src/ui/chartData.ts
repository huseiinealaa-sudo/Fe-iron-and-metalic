/**
 * The diagram that belongs to each failure mode.
 *
 * Every mode gets the chart an engineer would actually reach for: a tensile
 * curve for overload, an S-N curve for fatigue, a TTT C-curve for
 * sensitisation, a Charpy transition curve for impact. The marker is always the
 * current state of the simulation, so the 3D view and the diagram are two
 * readings of the same numbers.
 */

import { ALLOYS, alloyById, cpt, pren, type Alloy } from '../data/alloys'
import { SPECIMEN } from '../data/specimen'
import {
  charpyEnergy, engStress, fractureStrain, hotFactor, sampleCurve,
} from '../engine/curve'
import {
  fatigueLife, hydrogenThreshold, rupturTime, sccLife, sensitisationTime,
} from '../engine/failure'
import type { Params } from '../engine/params'

export interface Series {
  points: Array<[number, number]>
  color: string
  dashed?: boolean
  labelAr?: string
}

export interface Guide {
  axis: 'x' | 'y'
  value: number
  labelAr: string
  color?: string
}

export interface ChartSpec {
  titleAr: string
  xLabel: string
  yLabel: string
  xLog?: boolean
  yLog?: boolean
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  series: Series[]
  guides: Guide[]
  marker: [number, number] | null
  /** Shade everything above this y value as the failure region. */
  failAboveY?: number
  noteAr?: string
}

const HOT = '#e0642a'
const MAIN = '#f0b429'
const GHOST = '#5b6c7c'
const OK = '#2fa36b'

function curvePoints(a: Alloy, hot: number): Array<[number, number]> {
  return sampleCurve(a, 200).map(([e, s]) => [e * 100, s * hot] as [number, number])
}

export function chartFor(alloyId: string, modeId: string, p: Params): ChartSpec {
  const a = alloyById(alloyId)
  const hot = hotFactor(a, p.tempC)

  switch (modeId) {
    case 'tension':
    case 'compression':
    case 'bending': {
      const ef = fractureStrain(a)
      const eps =
        modeId === 'compression'
          ? p.drive
          : modeId === 'bending'
            // Surface strain of a guided bend: r * curvature.
            ? (SPECIMEN.gaugeDiameter / 2) * ((p.drive * Math.PI) / SPECIMEN.gaugeLength)
            : (p.drive / 0.92) * ef
      const shown = Math.min(eps, ef)
      const guides: Guide[] = [
        { axis: 'y', value: a.Rp02 * hot, labelAr: 'Rp0.2', color: OK },
        { axis: 'y', value: a.Rm * hot, labelAr: 'Rm', color: HOT },
      ]
      if (modeId === 'compression') {
        const sigmaCr = (Math.PI * Math.PI * a.E * 1000) / (p.slenderness * p.slenderness)
        if (sigmaCr < a.Rm * hot * 1.4) {
          guides.push({ axis: 'y', value: sigmaCr, labelAr: 'إجهاد Euler الحرج', color: '#d02f2f' })
        }
      }
      return {
        titleAr: modeId === 'bending' ? 'منحنى الإجهاد–الانفعال لليف الخارجي' : 'منحنى الإجهاد–الانفعال',
        xLabel: 'الانفعال %', yLabel: 'الإجهاد MPa',
        xMin: 0, xMax: ef * 100 * 1.04, yMin: 0, yMax: a.Rm * Math.max(hot, 1) * 1.15,
        series: [{ points: curvePoints(a, hot), color: MAIN, labelAr: a.label }],
        guides,
        marker: [shown * 100, engStress(a, shown) * hot],
        noteAr: 'القمّة هي Rm، وعندها يبدأ العنق. ما بعدها هبوط في الإجهاد الهندسي بينما الإجهاد الحقيقي يواصل الصعود.',
      }
    }

    case 'torsion':
    case 'shear': {
      const ef = fractureStrain(a)
      const gammaF = ef * Math.sqrt(3) * (modeId === 'torsion' ? 0.8 : 0.55)
      const pts: Array<[number, number]> = []
      for (let i = 0; i <= 160; i++) {
        const g = gammaF * Math.pow(i / 160, 2)
        pts.push([g * 100, (engStress(a, g / Math.sqrt(3)) * hot) / Math.sqrt(3)])
      }
      const div = modeId === 'torsion' ? 0.9 : 0.85
      const gNow = Math.min((p.drive / div) * gammaF, gammaF)
      return {
        titleAr: 'منحنى القصّ المكافئ (von Mises)',
        xLabel: 'انفعال القصّ γ %', yLabel: 'إجهاد القصّ τ MPa',
        xMin: 0, xMax: gammaF * 100 * 1.04, yMin: 0, yMax: ((a.Rm * hot) / Math.sqrt(3)) * 1.2,
        series: [{ points: pts, color: MAIN, labelAr: a.label }],
        guides: [
          { axis: 'y', value: (a.Rp02 * hot) / Math.sqrt(3), labelAr: 'Rp0.2/√3', color: OK },
          { axis: 'y', value: 0.67 * a.Rm * hot, labelAr: '≈ مقاومة القصّ', color: HOT },
        ],
        marker: [gNow * 100, (engStress(a, gNow / Math.sqrt(3)) * hot) / Math.sqrt(3)],
        noteAr: 'الخضوع بالقصّ يقع عند Rp0.2 مقسومة على جذر ثلاثة — هذا هو معيار von Mises مرسومًا.',
      }
    }

    case 'fatigue': {
      const build = (al: Alloy): Array<[number, number]> => {
        const out: Array<[number, number]> = []
        for (let i = 0; i <= 120; i++) {
          const amp = 40 + (0.95 * al.Rm - 40) * (i / 120)
          const n = fatigueLife(al, amp)
          if (Number.isFinite(n) && n >= 1e2 && n <= 1e10) out.push([Math.log10(n), amp])
        }
        return out.sort((u, v) => u[0] - v[0])
      }
      const ghost = a.dbtt === null ? alloyById('430') : alloyById('304')
      return {
        titleAr: 'منحنى S–N',
        xLabel: 'عدد الدورات N (لوغاريتمي)', yLabel: 'سعة الإجهاد MPa',
        xMin: 2, xMax: 10, yMin: 0, yMax: Math.max(a.Rm, ghost.Rm) * 1.0,
        series: [
          { points: build(ghost), color: GHOST, dashed: true, labelAr: ghost.label },
          { points: build(a), color: MAIN, labelAr: a.label },
        ],
        guides: [
          { axis: 'y', value: a.fatigue1e7, labelAr: 'مقاومة الكلال عند 10⁷', color: OK },
          { axis: 'y', value: a.Rp02, labelAr: 'Rp0.2', color: '#5b6c7c' },
          { axis: 'x', value: 7, labelAr: '10⁷', color: '#3a4856' },
        ],
        marker: [p.cyclesLog, p.stressAmp],
        noteAr: a.dbtt === null
          ? 'لاحظ أن المنحنى الأوستنيتي لا يستوي أبدًا: لا حدّ كلال حقيقيًّا، فالتصميم يكون على عمر محدّد.'
          : 'البنية BCC تعطي حدّ كلال: تحت هذا المستوى عمر غير محدود نظريًّا.',
      }
    }

    case 'creep': {
      const pts: Array<[number, number]> = []
      for (let i = 0; i <= 120; i++) {
        const sigma = 2 + (a.Rp02 * 0.95 - 2) * (i / 120)
        const t = rupturTime(a, sigma, p.tempC)
        if (Number.isFinite(t) && t > 1e-2 && t < 1e8) pts.push([Math.log10(t), sigma])
      }
      const ghostT = p.tempC >= 700 ? p.tempC - 150 : p.tempC + 150
      const ghost: Array<[number, number]> = []
      for (let i = 0; i <= 120; i++) {
        const sigma = 2 + (a.Rp02 * 0.95 - 2) * (i / 120)
        const t = rupturTime(a, sigma, ghostT)
        if (Number.isFinite(t) && t > 1e-2 && t < 1e8) ghost.push([Math.log10(t), sigma])
      }
      return {
        titleAr: 'منحنى الانهيار بالزحف',
        xLabel: 'زمن الانهيار بالساعات (لوغاريتمي)', yLabel: 'الإجهاد MPa',
        xMin: -1, xMax: 6, yMin: 0, yMax: a.Rp02 * 0.9,
        series: [
          { points: ghost, color: GHOST, dashed: true, labelAr: `${Math.round(ghostT)} °م` },
          { points: pts, color: MAIN, labelAr: `${Math.round(p.tempC)} °م` },
        ],
        guides: [{ axis: 'x', value: Math.log10(8760 * 10), labelAr: '10 سنوات', color: '#3a4856' }],
        marker: [p.timeLogH, p.stressFrac * a.Rp02],
        noteAr: 'حرّك درجة الحرارة وراقب انزياح المنحنى بالكامل: مئة درجة تختصر العمر إلى جزء من ألف.',
      }
    }

    case 'impact': {
      const build = (al: Alloy): Array<[number, number]> => {
        const out: Array<[number, number]> = []
        for (let t = -200; t <= 160; t += 4) out.push([t, charpyEnergy(al, t)])
        return out
      }
      const ghost = a.dbtt === null ? alloyById('430') : alloyById('304')
      return {
        titleAr: 'منحنى انتقال الصدم Charpy',
        xLabel: 'درجة الحرارة °م', yLabel: 'طاقة الصدم J',
        xMin: -200, xMax: 160, yMin: 0, yMax: Math.max(a.cvnUpper, ghost.cvnUpper) * 1.12,
        series: [
          { points: build(ghost), color: GHOST, dashed: true, labelAr: `${ghost.label} (${ghost.structure === 'austenitic' ? 'FCC' : 'BCC'})` },
          { points: build(a), color: MAIN, labelAr: `${a.label} (${a.structure === 'austenitic' ? 'FCC' : a.structure === 'duplex' ? 'FCC+BCC' : 'BCC'})` },
        ],
        guides: [
          { axis: 'y', value: 27, labelAr: 'حدّ القبول 27 J', color: '#d02f2f' },
          ...(a.dbtt !== null ? [{ axis: 'x' as const, value: a.dbtt, labelAr: 'DBTT', color: HOT }] : []),
        ],
        marker: [p.tempC, charpyEnergy(a, p.tempC)],
        noteAr: 'الخطّ المتّصل سبيكتك والمتقطّع من العائلة الأخرى. الفارق بينهما هو الفارق بين FCC وBCC كلّه.',
      }
    }

    case 'pitting': {
      const critical = cpt(a)
      const cl = Math.pow(10, p.chlorideLog)
      const above = p.tempC - critical
      const rate = cl >= 10 && above > 0
        ? 0.16 * Math.pow(above / 40, 0.8) * Math.min(1.6, Math.max(0.1, Math.log10(cl / 10) / 2))
        : 0
      const pts: Array<[number, number]> = []
      for (let i = 0; i <= 120; i++) {
        const lt = (5 * i) / 120
        pts.push([lt, Math.min(SPECIMEN.wallThickness, rate * Math.sqrt(Math.pow(10, lt)))])
      }
      // The alloy ladder: where every grade's CPT sits.
      const ladder: Array<[number, number]> = ALLOYS.map((x) => [0, cpt(x)])
      void ladder
      return {
        titleAr: 'تعمّق الحفرة مع الزمن',
        xLabel: 'الزمن بالساعات (لوغاريتمي)', yLabel: 'عمق الحفرة mm',
        xMin: 0, xMax: 5, yMin: 0, yMax: SPECIMEN.wallThickness * 1.2,
        series: [{ points: pts, color: rate > 0 ? MAIN : GHOST, labelAr: a.label }],
        guides: [{ axis: 'y', value: SPECIMEN.wallThickness, labelAr: 'سُمك الجدار — الاختراق', color: '#d02f2f' }],
        marker: [p.timeLogH, Math.min(SPECIMEN.wallThickness, rate * Math.sqrt(Math.pow(10, p.timeLogH)))],
        failAboveY: SPECIMEN.wallThickness,
        noteAr: rate > 0
          ? `PREN ${pren(a).toFixed(1)} يعطي CPT ${critical} °م، ونحن فوقها بـ ${above.toFixed(0)} درجة.`
          : `PREN ${pren(a).toFixed(1)} يعطي CPT ${critical} °م. تحتها لا يبدأ النقر أصلًا — المنحنى مسطّح على الصفر.`,
      }
    }

    case 'scc': {
      const cl = Math.pow(10, p.chlorideLog)
      const build = (al: Alloy): Array<[number, number]> => {
        const out: Array<[number, number]> = []
        for (let t = 20; t <= 200; t += 2) {
          const life = sccLife(al, t, p.stressFrac, cl)
          if (Number.isFinite(life) && life < 1e7) out.push([t, Math.log10(life)])
        }
        return out
      }
      const ghost = a.id === '304' ? alloyById('2205') : alloyById('304')
      return {
        titleAr: 'الزمن حتى التشقّق مقابل الحرارة',
        xLabel: 'درجة الحرارة °م', yLabel: 'الزمن حتى الفشل (لوغاريتم الساعات)',
        xMin: 20, xMax: 200, yMin: 0, yMax: 6,
        series: [
          { points: build(ghost), color: GHOST, dashed: true, labelAr: ghost.label },
          { points: build(a), color: MAIN, labelAr: a.label },
        ],
        guides: [
          { axis: 'y', value: Math.log10(8760), labelAr: 'سنة واحدة', color: '#3a4856' },
          { axis: 'x', value: 60, labelAr: '60 °م', color: '#3a4856' },
        ],
        marker: (() => {
          const life = sccLife(a, p.tempC, p.stressFrac, cl)
          return Number.isFinite(life) ? [p.tempC, Math.log10(life)] : null
        })(),
        noteAr: 'حيث ينقطع المنحنى لا يوجد تشقّق إطلاقًا: إمّا الحرارة دون العتبة أو أحد أضلاع المثلّث مفقود.',
      }
    }

    case 'igc': {
      // The classic TTT C-curve: time on x, temperature on y.
      const build = (al: Alloy): Array<[number, number]> => {
        const out: Array<[number, number]> = []
        for (let t = 426; t <= 814; t += 3) {
          const ts = sensitisationTime(al, t)
          if (Number.isFinite(ts)) out.push([Math.log10(ts), t])
        }
        return out
      }
      const ghost = a.id === '304' ? alloyById('316L') : alloyById('304')
      return {
        titleAr: 'منحنى التحسّس TTT',
        xLabel: 'الزمن بالساعات (لوغاريتمي)', yLabel: 'درجة الحرارة °م',
        xMin: -3, xMax: 3, yMin: 400, yMax: 850,
        series: [
          { points: build(ghost), color: GHOST, dashed: true, labelAr: ghost.label },
          { points: build(a), color: MAIN, labelAr: a.label },
        ],
        guides: [
          { axis: 'y', value: 700, labelAr: 'أنف المنحنى 700 °م', color: HOT },
          { axis: 'y', value: 425, labelAr: '425 °م', color: '#3a4856' },
          { axis: 'y', value: 815, labelAr: '815 °م', color: '#3a4856' },
        ],
        marker: [p.timeLogH, p.tempC],
        noteAr: 'يسار المنحنى آمن ويمينه متحسّس. المسافة الأفقية بين الخطّين هي كل الفرق بين 304 وسبيكة L.',
      }
    }

    case 'hydrogen': {
      const build = (al: Alloy): Array<[number, number]> => {
        const out: Array<[number, number]> = []
        for (let i = 0; i <= 120; i++) {
          const ppm = (10 * i) / 120
          out.push([ppm, hydrogenThreshold(al, ppm) * 100])
        }
        return out
      }
      const ghost = a.susceptibility.hydrogen > 0.4 ? alloyById('304') : alloyById('17-4PH')
      return {
        titleAr: 'إجهاد العتبة مقابل الهيدروجين الممتصّ',
        xLabel: 'الهيدروجين ppm', yLabel: 'إجهاد العتبة % من Rp0.2',
        xMin: 0, xMax: 10, yMin: 0, yMax: 105,
        series: [
          { points: build(ghost), color: GHOST, dashed: true, labelAr: ghost.label },
          { points: build(a), color: MAIN, labelAr: a.label },
        ],
        guides: [{ axis: 'y', value: p.stressFrac * 100, labelAr: 'الإجهاد المسلّط', color: '#d02f2f' }],
        marker: [p.hydrogenPpm, hydrogenThreshold(a, p.hydrogenPpm) * 100],
        noteAr: 'حين يهبط المنحنى تحت الخطّ الأحمر يقع الفشل — عند إجهاد كان آمنًا تمامًا قبل دخول الهيدروجين.',
      }
    }

    default:
      return {
        titleAr: '', xLabel: '', yLabel: '', xMin: 0, xMax: 1, yMin: 0, yMax: 1,
        series: [], guides: [], marker: null,
      }
  }
}
