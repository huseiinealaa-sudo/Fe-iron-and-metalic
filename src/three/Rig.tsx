import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshStandardMaterial, type Group, type Mesh } from 'three'
import { GAUGE_HALF, GAUGE_RADIUS, HALF_LENGTH, SCENE_SCALE } from '../data/specimen'
import { evaluate } from '../engine/failure'
import { useStore } from '../store/useStore'

/** Modes held in tensile grips — the coupon is simply pulled or held. */
const GRIPPED = new Set(['tension', 'fatigue', 'creep', 'scc', 'hydrogen'])
/** Modes that put the coupon in a corrosive bath. */
const IMMERSED = new Set(['pitting', 'scc'])

function useFixtureMaterials() {
  return useMemo(
    () => ({
      jaw: new MeshStandardMaterial({ color: '#39434e', metalness: 0.85, roughness: 0.45 }),
      ram: new MeshStandardMaterial({ color: '#8b6a25', metalness: 0.8, roughness: 0.35 }),
      anvil: new MeshStandardMaterial({ color: '#2b333c', metalness: 0.7, roughness: 0.55 }),
      liquid: new MeshStandardMaterial({
        color: '#2e6f7a', metalness: 0.1, roughness: 0.08,
        transparent: true, opacity: 0.1, depthWrite: false,
      }),
    }),
    [],
  )
}

export function Rig() {
  const m = useFixtureMaterials()
  const gripR = useRef<Group>(null)
  const gripL = useRef<Group>(null)
  const platenR = useRef<Group>(null)
  const platenL = useRef<Group>(null)
  const bendRam = useRef<Group>(null)
  const bendSupports = useRef<Group>(null)
  const torqueR = useRef<Group>(null)
  const torqueL = useRef<Group>(null)
  const shearR = useRef<Group>(null)
  const shearL = useRef<Group>(null)
  const pendulum = useRef<Group>(null)
  const charpyAnvils = useRef<Group>(null)
  const bath = useRef<Mesh>(null)

  useFrame(() => {
    const s = useStore.getState()
    const st = evaluate(s.alloyId, s.modeId, s.params)
    const g = st.geom
    const mode = s.modeId

    const show = (ref: { current: Group | Mesh | null }, on: boolean) => {
      if (ref.current) ref.current.visible = on
    }

    // Grips ride with the end of the shoulder: gauge stretch plus any separation.
    const endShift = (GAUGE_HALF * g.axialStrain + g.gap * HALF_LENGTH) * SCENE_SCALE
    show(gripR, GRIPPED.has(mode))
    show(gripL, GRIPPED.has(mode))
    if (gripR.current) gripR.current.position.x = endShift
    if (gripL.current) gripL.current.position.x = -endShift

    // Compression platens close in, and tilt away if the column buckles.
    show(platenR, mode === 'compression')
    show(platenL, mode === 'compression')
    if (platenR.current) platenR.current.position.x = endShift
    if (platenL.current) platenL.current.position.x = -endShift

    // Three-point bend: the ram follows the sag it is causing.
    const bending = mode === 'bending'
    show(bendRam, bending)
    show(bendSupports, bending)
    if (bendRam.current) {
      const k = g.bendAngle / (2 * GAUGE_HALF)
      const sag = k > 1e-6 ? (1 - Math.cos(g.bendAngle / 2)) / k : 0
      bendRam.current.position.y = (-sag + GAUGE_RADIUS + 5) * SCENE_SCALE
    }

    // Torsion heads turn by exactly what the shader twists the gauge by.
    show(torqueR, mode === 'torsion')
    show(torqueL, mode === 'torsion')
    if (torqueR.current) torqueR.current.rotation.x = g.twist * 0.5
    if (torqueL.current) torqueL.current.rotation.x = -g.twist * 0.5

    // Direct shear: the two halves are driven past each other.
    show(shearR, mode === 'shear')
    show(shearL, mode === 'shear')
    const off = g.shearOffset * GAUGE_RADIUS * SCENE_SCALE
    if (shearR.current) shearR.current.position.y = off
    if (shearL.current) shearL.current.position.y = -off

    // Charpy: the pendulum falls, strikes at the halfway point, follows through.
    const impact = mode === 'impact'
    show(pendulum, impact)
    show(charpyAnvils, impact)
    if (pendulum.current) {
      const d = s.params.drive
      const angle = d < 0.5
        ? -2.0 + (d / 0.5) * 2.0
        : (d - 0.5) / 0.5 * 1.1
      pendulum.current.rotation.z = angle
    }

    // The corrosive bath only appears when there is chloride to worry about.
    const cl = Math.pow(10, s.params.chlorideLog)
    show(bath, IMMERSED.has(mode) && cl >= 10)
  })

  const gripGeom = { args: [40, 36, 36] as [number, number, number] }

  return (
    <group scale={SCENE_SCALE}>
      {/* ---- tensile grips ---- */}
      <group ref={gripR} position={[0, 0, 0]}>
        <mesh material={m.jaw} position={[HALF_LENGTH + 2, 0, 0]} castShadow>
          <boxGeometry {...gripGeom} />
        </mesh>
        <mesh material={m.jaw} position={[HALF_LENGTH + 32, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[12, 12, 28, 24]} />
        </mesh>
      </group>
      <group ref={gripL}>
        <mesh material={m.jaw} position={[-HALF_LENGTH - 2, 0, 0]} castShadow>
          <boxGeometry {...gripGeom} />
        </mesh>
        <mesh material={m.jaw} position={[-HALF_LENGTH - 32, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[12, 12, 28, 24]} />
        </mesh>
      </group>

      {/* ---- compression platens ---- */}
      <group ref={platenR}>
        <mesh material={m.ram} position={[HALF_LENGTH + 8, 0, 0]} castShadow>
          <boxGeometry args={[14, 64, 64]} />
        </mesh>
      </group>
      <group ref={platenL}>
        <mesh material={m.ram} position={[-HALF_LENGTH - 8, 0, 0]} castShadow>
          <boxGeometry args={[14, 64, 64]} />
        </mesh>
      </group>

      {/* ---- three point bend ---- */}
      <group ref={bendRam}>
        <mesh material={m.ram} position={[0, 10, 0]} castShadow>
          <cylinderGeometry args={[5, 5, 34, 20]} />
        </mesh>
        <mesh material={m.ram} position={[0, 30, 0]} castShadow>
          <boxGeometry args={[18, 30, 18]} />
        </mesh>
      </group>
      <group ref={bendSupports}>
        {[-1, 1].map((sgn) => (
          <mesh
            key={sgn}
            material={m.anvil}
            position={[sgn * GAUGE_HALF, -GAUGE_RADIUS - 5, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[5, 5, 34, 20]} />
          </mesh>
        ))}
      </group>

      {/* ---- torsion heads ---- */}
      <group ref={torqueR}>
        <mesh material={m.jaw} position={[HALF_LENGTH + 10, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[26, 26, 34, 6]} />
        </mesh>
      </group>
      <group ref={torqueL}>
        <mesh material={m.jaw} position={[-HALF_LENGTH - 10, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[26, 26, 34, 6]} />
        </mesh>
      </group>

      {/* ---- direct shear fixture ---- */}
      <group ref={shearR}>
        <mesh material={m.jaw} position={[GAUGE_HALF * 0.55, 0, 0]} castShadow>
          <boxGeometry args={[GAUGE_HALF * 0.8, 46, 46]} />
        </mesh>
      </group>
      <group ref={shearL}>
        <mesh material={m.jaw} position={[-GAUGE_HALF * 0.55, 0, 0]} castShadow>
          <boxGeometry args={[GAUGE_HALF * 0.8, 46, 46]} />
        </mesh>
      </group>

      {/* ---- Charpy pendulum and its anvils ---- */}
      <group ref={pendulum} position={[0, 110, 0]}>
        <mesh material={m.anvil} position={[0, -41, 0]} castShadow>
          <boxGeometry args={[6, 82, 6]} />
        </mesh>
        <mesh material={m.ram} position={[0, -86, 0]} castShadow>
          <boxGeometry args={[22, 26, 34]} />
        </mesh>
      </group>
      <group ref={charpyAnvils}>
        {[-1, 1].map((sgn) => (
          <mesh
            key={sgn}
            material={m.anvil}
            position={[sgn * 24, -GAUGE_RADIUS - 5, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[5, 5, 30, 18]} />
          </mesh>
        ))}
      </group>

      {/* ---- corrosive bath ---- */}
      <mesh ref={bath} material={m.liquid} position={[0, 0, 0]}>
        <boxGeometry args={[HALF_LENGTH * 2.05, 46, 46]} />
      </mesh>
    </group>
  )
}
