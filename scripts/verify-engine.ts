/**
 * Engine checks. Run with `npm run verify:engine`.
 *
 * These are not unit tests of the code — they are assertions that the physics
 * still lands on published values. If a constant is edited carelessly, this
 * fails loudly.
 */
import { ALLOYS, alloyById, cpt, isBrittle, modeApplies, pren } from '../src/data/alloys'
import { MODES } from '../src/data/modes'
import { engStress, fractureStrain, sampleCurve, charpyEnergy, uniformStrain } from '../src/engine/curve'
import { evaluate, fatigueLife, hasEnduranceLimit, rupturTime, sccLife, sensitisationTime, hydrogenThreshold } from '../src/engine/failure'
import { DEFAULT_PARAMS, paramsForMode, resolveDriver } from '../src/engine/params'

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
  check(`${a.label}: ${isBrittle(a) ? 'no necking, fracture at the end of the rise' : 'necking before fracture'}`,
    uniformStrain(a) < fractureStrain(a), `eu=${uniformStrain(a).toFixed(3)} ef=${fractureStrain(a)}`)
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
check('2205 is clearly weaker in creep than 304',
  rupturTime(alloyById('2205'), 65, 600) < rupturTime(alloyById('304'), 65, 600) / 5)

console.log('\n— creep across families: homologous temperature decides —')
const sac = alloyById('SAC305')
check('SAC305 solder creeps at room temperature (0.9 Rp0.2 → under a year)',
  rupturTime(sac, 0.9 * sac.Rp02, 20) < 8760, `${rupturTime(sac, 0.9 * sac.Rp02, 20).toExponential(2)} h`)
check('6061 does not creep at room temperature',
  rupturTime(alloyById('6061'), 137, 20) > 1e8)
check('6061 does creep at 200 C', rupturTime(alloyById('6061'), 137, 200) < 1e4,
  `${rupturTime(alloyById('6061'), 137, 200).toExponential(2)} h`)
check('above the melting point there is no creep to speak of', rupturTime(sac, 10, 250) === 0)
check('304 anchors are unchanged by the generalisation', near(Math.log10(rupturTime(alloyById('304'), 65, 600)), 5, 0.12))

console.log('\n— brittle grades —')
const gjl = alloyById('GJL250')
check('grey iron is brittle in tension at room temperature', charpyEnergy(gjl, 20) < 15, `${charpyEnergy(gjl, 20).toFixed(0)} J`)
check('grey iron reaches Rm at its (tiny) fracture strain', near(engStress(gjl, fractureStrain(gjl)), gjl.Rm, 0.01))
check('grey iron carries more than three times Rm in compression', (gjl.compressive ?? 0) > 3 * gjl.Rm)
check('ductile iron is not brittle', !isBrittle(alloyById('GJS400')))

console.log('\n— endurance limit follows the lattice —')
check('S235 (BCC) has an endurance limit', hasEnduranceLimit(alloyById('S235')))
check('6061 (FCC) has none', !hasEnduranceLimit(alloyById('6061')))
check('brass (FCC) has none', !hasEnduranceLimit(alloyById('CuZn37')))
check('tin solder has none', !hasEnduranceLimit(sac))

console.log('\n— SCC in other families —')
check('brass cracks at room temperature (ammonia)', Number.isFinite(sccLife(alloyById('CuZn37'), 25, 0.5, 1000)))
check('7075-T6 cracks at room temperature', Number.isFinite(sccLife(alloyById('7075'), 25, 0.5, 1000)))
check('6061-T6 does not crack at room temperature', !Number.isFinite(sccLife(alloyById('6061'), 25, 0.5, 1000)))
check('titanium is safe in warm seawater', !Number.isFinite(sccLife(alloyById('Ti64'), 40, 0.5, 20000)))

console.log('\n— sensitisation windows —')
const al5083 = alloyById('5083')
check('5083 sensitises at 120 C', Number.isFinite(sensitisationTime(al5083, 120)))
check('5083 needs months, not minutes', sensitisationTime(al5083, 120) > 100, `${sensitisationTime(al5083, 120).toFixed(0)} h`)
check('5083 does not sensitise at 700 C (it would melt)', !Number.isFinite(sensitisationTime(al5083, 700)))
check('5083 is safe below 50 C', !Number.isFinite(sensitisationTime(al5083, 40)))

console.log('\n— applicability —')
check('pitting is not offered for carbon steel', !modeApplies(alloyById('S235'), 'pitting'))
check('hydrogen is not offered for aluminium', !modeApplies(alloyById('7075'), 'hydrogen'))
check('every alloy still has all eight mechanical modes',
  ALLOYS.every((a) => ['tension', 'compression', 'bending', 'torsion', 'shear', 'fatigue', 'creep', 'impact'].every((m) => modeApplies(a, m))))
check('CPT is defined for every grade that offers pitting',
  ALLOYS.filter((a) => modeApplies(a, 'pitting')).every((a) => Number.isFinite(cpt(a))))

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
    if (!modeApplies(a, m.id)) continue
    const base = paramsForMode(m, DEFAULT_PARAMS, a)
    const primary = resolveDriver(m.primary, a, m.id)
    let bad = ''
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      const key = primary.key
      const p = { ...base, [key]: primary.min + (primary.max - primary.min) * t }
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
