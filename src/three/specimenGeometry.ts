/**
 * The test coupon, built as two mirrored halves that meet at x = 0.
 *
 * Splitting it in two is what makes a real fracture possible: the plane at
 * x = 0 carries a cap on each half, and those caps ARE the fracture surfaces.
 * While the specimen is whole the caps are discarded in the fragment shader and
 * the two lateral surfaces meet seamlessly.
 *
 * The axis is X. Everything is in millimetres; SCENE_SCALE converts once, on
 * the mesh.
 */

import { BufferAttribute, BufferGeometry } from 'three'
import {
  FILLET_RUN, GAUGE_HALF, GAUGE_RADIUS, HALF_LENGTH, SHOULDER_RADIUS, SPECIMEN,
} from '../data/specimen'

/** Face tags handed to the shader. */
export const FACE_LATERAL = 0
export const FACE_FRACTURE = 1
export const FACE_GRIP = 2

/** Radius of the coupon at an axial station, mm. */
export function profileRadius(x: number): number {
  const ax = Math.abs(x)
  if (ax <= GAUGE_HALF) return GAUGE_RADIUS
  if (ax <= GAUGE_HALF + FILLET_RUN) {
    // Circular fillet, tangent to the gauge at its start.
    const t = ax - GAUGE_HALF
    const R = SPECIMEN.filletRadius
    return GAUGE_RADIUS + (R - Math.sqrt(Math.max(0, R * R - t * t)))
  }
  return SHOULDER_RADIUS
}

const AXIAL_SEGMENTS = 170
const RADIAL_SEGMENTS = 72
const CAP_RINGS = 14

/**
 * Axial stations, bunched towards x = 0 so the neck and the crack have enough
 * vertices to bend smoothly.
 */
function axialStations(): number[] {
  const out: number[] = []
  for (let i = 0; i <= AXIAL_SEGMENTS; i++) {
    out.push(HALF_LENGTH * Math.pow(i / AXIAL_SEGMENTS, 1.4))
  }
  return out
}

/**
 * One half of the coupon, spanning x = 0 to +HALF_LENGTH.
 * The other half is the same geometry mirrored on X by the component.
 */
export function buildHalfSpecimen(): BufferGeometry {
  const xs = axialStations()
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const face: number[] = []
  const idx: number[] = []

  const push = (
    x: number, y: number, z: number,
    nx: number, ny: number, nz: number,
    u: number, v: number, f: number,
  ) => {
    pos.push(x, y, z)
    nor.push(nx, ny, nz)
    uv.push(u, v)
    face.push(f)
    return pos.length / 3 - 1
  }

  // ---------------------------------------------------------- lateral surface
  const lateralStart = pos.length / 3
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]
    const r = profileRadius(x)
    // Slope of the profile, for the surface-of-revolution normal.
    const h = 0.05
    const dr = (profileRadius(x + h) - profileRadius(Math.max(0, x - h))) / (x < h ? h : 2 * h)
    const len = Math.hypot(1, dr)
    const nAx = -dr / len
    const nRad = 1 / len
    for (let j = 0; j <= RADIAL_SEGMENTS; j++) {
      const a = (j / RADIAL_SEGMENTS) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      push(
        x, r * c, r * s,
        nAx, nRad * c, nRad * s,
        j / RADIAL_SEGMENTS, x / HALF_LENGTH,
        FACE_LATERAL,
      )
    }
  }
  const ring = RADIAL_SEGMENTS + 1
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < RADIAL_SEGMENTS; j++) {
      const a = lateralStart + i * ring + j
      const b = a + 1
      const c = a + ring
      const d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  }

  // ------------------------------------------------- fracture cap at x = 0
  pushCap(0, -1, FACE_FRACTURE, GAUGE_RADIUS)
  // ------------------------------------------------- grip cap at the far end
  pushCap(HALF_LENGTH, 1, FACE_GRIP, SHOULDER_RADIUS)

  function pushCap(x: number, dir: number, f: number, radius: number) {
    const centre = push(x, 0, 0, dir, 0, 0, 0.5, 0.5, f)
    const rings: number[][] = []
    for (let k = 1; k <= CAP_RINGS; k++) {
      const r = (radius * k) / CAP_RINGS
      const row: number[] = []
      for (let j = 0; j <= RADIAL_SEGMENTS; j++) {
        const a = (j / RADIAL_SEGMENTS) * Math.PI * 2
        row.push(push(x, r * Math.cos(a), r * Math.sin(a), dir, 0, 0, k / CAP_RINGS, j / RADIAL_SEGMENTS, f))
      }
      rings.push(row)
    }
    for (let j = 0; j < RADIAL_SEGMENTS; j++) {
      const a = rings[0][j]
      const b = rings[0][j + 1]
      if (dir > 0) idx.push(centre, a, b)
      else idx.push(centre, b, a)
    }
    for (let k = 0; k < CAP_RINGS - 1; k++) {
      for (let j = 0; j < RADIAL_SEGMENTS; j++) {
        const a = rings[k][j]
        const b = rings[k][j + 1]
        const c = rings[k + 1][j]
        const d = rings[k + 1][j + 1]
        if (dir > 0) idx.push(a, c, b, b, c, d)
        else idx.push(a, b, c, b, d, c)
      }
    }
  }

  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setAttribute('aFace', new BufferAttribute(new Float32Array(face), 1))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}
