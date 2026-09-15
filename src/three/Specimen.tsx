import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, Plane, Vector3, type Mesh } from 'three'
import { GAUGE_HALF, GAUGE_RADIUS, HALF_LENGTH, SCENE_SCALE } from '../data/specimen'
import { evaluate } from '../engine/failure'
import { useStore } from '../store/useStore'
import { buildHalfSpecimen } from './specimenGeometry'
import { createSteelMaterial, createSteelUniforms, STRESS_MODE } from './steelMaterial'

/** Which analytical stress picture belongs to which failure mode. */
const STRESS_BY_MODE: Record<string, number> = {
  tension: STRESS_MODE.uniform,
  compression: STRESS_MODE.uniform,
  bending: STRESS_MODE.bending,
  torsion: STRESS_MODE.torsion,
  shear: STRESS_MODE.shear,
  fatigue: STRESS_MODE.uniform,
  creep: STRESS_MODE.uniform,
  impact: STRESS_MODE.bending,
  pitting: STRESS_MODE.none,
  scc: STRESS_MODE.uniform,
  igc: STRESS_MODE.none,
  hydrogen: STRESS_MODE.uniform,
}

/** Exponential approach — frame-rate independent smoothing. */
function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

export function Specimen() {
  const geometry = useMemo(() => buildHalfSpecimen(), [])
  const uniforms = useMemo(() => createSteelUniforms(), [])
  const material = useMemo(
    () =>
      createSteelMaterial(uniforms, {
        gaugeHalf: GAUGE_HALF,
        gaugeRadius: GAUGE_RADIUS,
        halfLength: HALF_LENGTH,
      }),
    [uniforms],
  )
  const sectionPlane = useMemo(() => new Plane(new Vector3(0, 0, -1), 0), [])
  const right = useRef<Mesh>(null)
  const left = useRef<Mesh>(null)
  /** Smoothed copy of the uniform targets, so dragging a slider reads as motion. */
  const smooth = useRef<Record<string, number>>({})
  /** Smoothing must not carry one mode's shape into the next one. */
  const lastMode = useRef<string>('')

  useEffect(() => {
    material.side = DoubleSide
    return () => {
      material.dispose()
      geometry.dispose()
    }
  }, [material, geometry])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useStore.getState()
    const st = evaluate(s.alloyId, s.modeId, s.params)
    const g = st.geom
    const t = performance.now() / 1000

    // Changing mode is a cut, not a transition: snap rather than ease, or a
    // slow frame rate leaves the previous mode's bend or twist on screen.
    const modeChanged = lastMode.current !== s.modeId
    lastMode.current = s.modeId

    material.clippingPlanes = s.sectioned ? [sectionPlane] : []

    // The cyclic modes keep breathing while you watch them.
    const wobble = g.cyclicAmp * Math.sin(t * 7.5)

    const target: Record<string, number> = {
      uAxialStrain: g.axialStrain + wobble,
      uNeck: g.neck,
      uBarrel: g.barrel,
      uBow: g.bow,
      uBendAngle: g.bendAngle,
      uTwist: g.twist,
      uShearOffset: g.shearOffset,
      uCrackDepth: g.crackDepth,
      uCrackAngle: g.crackAngle,
      uGap: g.gap,
      uPitDensity: g.pitDensity,
      uPitDepth: g.pitDepth,
      uBranching: g.branching,
      uGbOpen: g.gbOpen,
      uBrittle: g.brittle,
      uGlow: g.glow,
      uFrost: g.frost,
      uUtilisation: st.utilisation,
      uStressMix: s.showStress ? 1 : 0,
      uBeach: s.modeId === 'fatigue' ? 1 : 0,
      uWeldBands: s.modeId === 'igc' ? 1 : 0,
      uStressMode: STRESS_BY_MODE[s.modeId] ?? STRESS_MODE.uniform,
    }

    for (const [key, value] of Object.entries(target)) {
      const u = uniforms[key]
      if (!u) continue
      // Discrete switches snap; continuous quantities are eased.
      const snap = modeChanged || key === 'uStressMode' || key === 'uBeach' || key === 'uWeldBands'
      const prev = smooth.current[key] ?? value
      const next = snap ? value : damp(prev, value, 14, dt)
      smooth.current[key] = next
      u.value = next
    }
    uniforms.uTime.value = t
  })

  return (
    <group scale={SCENE_SCALE}>
      <mesh ref={right} geometry={geometry} material={material} castShadow receiveShadow />
      <mesh
        ref={left}
        geometry={geometry}
        material={material}
        scale={[-1, 1, 1]}
        castShadow
        receiveShadow
      />
    </group>
  )
}
