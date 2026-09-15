/**
 * Engine checks. Run with `npm run verify:engine`.
 *
 * These are not unit tests of the code — they are assertions that the physics
 * still lands on published values. If a constant is edited carelessly, this
 * fails loudly.
 */
import { ALLOYS, alloyById, cpt, pren } from '../src/data/alloys'
import { MODES } from '../src/data/modes'
import { engStress, fractureStrain, sampleCurve, charpyEnergy, uniformStrain } from '../src/engine/curve'
import { evaluate, fatigueLife, rupturTime, sccLife, sensitisationTime, hydrogenThreshold } from '../src/engine/failure'
import { DEFAULT_PARAMS, paramsForMode } from '../src/engine/params'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`)
}
function near(a: number, b: number, tolFrac: number) {
  return Math.abs(a - b) <= Math.abs(b) * tolFrac
}

console.log('\n— tensile curve reproduces the published tensile properties —')
for (const a of ALLOYS) {
  let peak = 0
  for (const [, s] of sampleCurve(a, 4000)) peak = Math.max(peak, s)
  check(`${a.label}: peak equals Rm`, near(peak, a.Rm, 0.02), `${peak.toFixed(0)} vs ${a.Rm}`)
  check(`${a.label}: necking before fracture`, uniformStrain(a) < fractureStrain(a),
    `eu=${uniformStrain(a).toFixed(3)} ef=${fractureStrain(a)}`)
  check(`${a.label}: stress is zero past fracture`, engStress(a, fractureStrain(a) * 1.01) === 0)
}

console.log('\n— PREN ordering and CPT —')
check('904L and 2205 outrank 316L, which outranks 304',
  pren(alloyById('904L')) > pren(alloyById('316L')) &&
  pren(alloyById('2205')) > pren(alloyById('316L')) &&
  pren(alloyById('316L')) > pren(alloyById('304')))
check('304 CPT is near ambient', cpt(alloyById('304')) >= 5 && cpt(alloyById('304')) <= 20, `${cpt(alloyById('304'))} C`)
check('2205 CPT is around 50 C', near(cpt(alloyById('2205')), 50, 0.2), `${cpt(alloyById('2205'))} C`)

console.log('\n— Charpy: FCC has no transition, BCC does —')
check('304 keeps its toughness at -196 C', charpyEnergy(alloyById('304'), -196) > 100,
  `${charpyEnergy(alloyById('304'), -196).toFixed(0)} J`)
check('430 is brittle at -40 C', charpyEnergy(alloyById('430'), -40) < 27,
  `${charpyEnergy(alloyById('430'), -40).toFixed(0)} J`)
check('430 is tough at 100 C', charpyEnergy(alloyById('430'), 100) > 50,
  `${charpyEnergy(alloyById('430'), 100).toFixed(0)} J`)

console.log('\n— fatigue: S-N passes through its two anchors —')
for (const a of ALLOYS) {
  check(`${a.label}: 1e7 anchor`, near(fatigueLife(a, a.fatigue1e7), 1e7, 0.05),
    fatigueLife(a, a.fatigue1e7).toExponential(2))
  check(`${a.label}: 1e3 anchor`, near(fatigueLife(a, 0.9 * a.Rm), 1e3, 0.05))
}
check('austenitic 304 has no endurance limit',
  Number.isFinite(fatigueLife(alloyById('304'), 150)))
check('ferritic 430 does have one',
  !Number.isFinite(fatigueLife(alloyById('430'), 150)))

console.log('\n— creep: Larson-Miller against 304 stress-rupture data —')
const t600 = rupturTime(alloyById('304'), 65, 600)
check('304 at 600 C / 65 MPa ruptures near 1e5 h', near(Math.log10(t600), 5, 0.12),
  `${t600.toExponential(2)} h`)
// Published: 304 ruptures in about 1e4 h at 700 C under roughly 30 MPa.
const t700 = rupturTime(alloyById('304'), 30, 700)
check('304 at 700 C / 30 MPa ruptures near 1e4 h', near(Math.log10(t700), 4, 0.12),
  `${t700.toExponential(2)} h`)
check('hotter at the same stress is always shorter',
  rupturTime(alloyById('304'), 65, 700) < rupturTime(alloyById('304'), 65, 600))
check('2205 is far weaker in creep than 304',
  rupturTime(alloyById('2205'), 65, 600) < rupturTime(alloyById('304'), 65, 600) / 100)

console.log('\n— SCC: the three-leg rule —')
const s304 = alloyById('304')
check('304 cracks at 90 C, 1000 ppm, 0.5 Rp0.2', Number.isFinite(sccLife(s304, 90, 0.5, 1000)),
  `${sccLife(s304, 90, 0.5, 1000).toFixed(0)} h`)
check('no chloride, no cracking', !Number.isFinite(sccLife(s304, 90, 0.5, 0)))
check('no stress, no cracking', !Number.isFinite(sccLife(s304, 90, 0, 1000)))
check('below the temperature threshold, no cracking', !Number.isFinite(sccLife(s304, 30, 0.5, 1000)))
check('hotter means sooner', sccLife(s304, 150, 0.5, 1000) < sccLife(s304, 90, 0.5, 1000))
check('2205 resists where 304 fails', !Number.isFinite(sccLife(alloyById('2205'), 90, 0.5, 1000)))

console.log('\n— sensitisation: the C-curve —')
const t304 = sensitisationTime(s304, 700)
check('304 sensitises within minutes at 700 C', t304 < 0.2, `${(t304 * 60).toFixed(1)} min`)
check('316L takes orders of magnitude longer', sensitisationTime(alloyById('316L'), 700) > t304 * 100)
check('321 is the most resistant', sensitisationTime(alloyById('321'), 700) > sensitisationTime(alloyById('316L'), 700))
check('nothing happens below 425 C', !Number.isFinite(sensitisationTime(s304, 400)))
check('nothing happens above 815 C', !Number.isFinite(sensitisationTime(s304, 900)))
check('700 C is the nose of the curve',
  sensitisationTime(s304, 700) < sensitisationTime(s304, 500) &&
  sensitisationTime(s304, 700) < sensitisationTime(s304, 800))

console.log('\n— hydrogen: hardness and structure decide —')
check('17-4PH collapses at 2 ppm', hydrogenThreshold(alloyById('17-4PH'), 2) < 0.4,
  hydrogenThreshold(alloyById('17-4PH'), 2).toFixed(2))
check('304 barely notices 10 ppm', hydrogenThreshold(s304, 10) > 0.85,
  hydrogenThreshold(s304, 10).toFixed(2))
check('clean metal has full threshold', hydrogenThreshold(alloyById('17-4PH'), 0) === 1)

console.log('\n— every alloy × mode evaluates, and the drive sweep is finite —')
for (const a of ALLOYS) {
  for (const m of MODES) {
    const base = paramsForMode(m, DEFAULT_PARAMS)
    let bad = ''
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      const key = m.primary.key
      const p = { ...base, [key]: m.primary.min + (m.primary.max - m.primary.min) * t }
      const st = evaluate(a.id, m.id, p)
      const g = st.geom
      for (const [k, v] of Object.entries(g)) {
        if (!Number.isFinite(v)) { bad = `geom.${k} = ${v} at t=${t}`; break }
      }
      if (!Number.isFinite(st.progress) || st.progress < 0 || st.progress > 1) bad = `progress=${st.progress}`
      if (st.readouts.some((r) => r.value.includes('NaN'))) bad = `NaN readout at t=${t}`
      if (bad) break
    }
    check(`${a.label} × ${m.id}`, bad === '', bad)
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
process.exit(failures === 0 ? 0 : 1)
