import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'
import { HALF_LENGTH, SCENE_SCALE } from '../data/specimen'
import { useStore } from '../store/useStore'

/** How much room each mode's fixtures need, in millimetres from the centre. */
function extentFor(modeId: string): { halfWidth: number; halfHeight: number } {
  switch (modeId) {
    case 'impact':   return { halfWidth: HALF_LENGTH + 16, halfHeight: 62 }
    case 'tension': case 'fatigue': case 'creep': case 'scc': case 'hydrogen':
      return { halfWidth: HALF_LENGTH + 48, halfHeight: 34 }
    case 'compression': return { halfWidth: HALF_LENGTH + 24, halfHeight: 42 }
    case 'torsion':  return { halfWidth: HALF_LENGTH + 30, halfHeight: 34 }
    case 'bending':  return { halfWidth: HALF_LENGTH + 10, halfHeight: 46 }
    default:         return { halfWidth: HALF_LENGTH + 12, halfHeight: 34 }
  }
}

/**
 * Frames the whole rig, at any aspect ratio.
 *
 * A portrait tablet has a much narrower horizontal field of view than a
 * landscape one, so a fixed camera distance either crops the grips or leaves
 * the coupon a speck. The distance is solved from the bounding box instead.
 */
export function CameraFit() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const modeId = useStore((s) => s.modeId)

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const e = extentFor(modeId)
    const width = e.halfWidth * 2 * SCENE_SCALE
    const height = e.halfHeight * 2 * SCENE_SCALE
    const vFov = (camera.fov * Math.PI) / 180
    const aspect = size.width / Math.max(1, size.height)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const dist = Math.max(height / 2 / Math.tan(vFov / 2), width / 2 / Math.tan(hFov / 2)) * 1.12

    const dir = camera.position.clone()
    if (dir.lengthSq() < 1e-6) dir.set(0.35, 0.3, 1)
    dir.normalize()
    camera.position.copy(dir.multiplyScalar(dist))
    camera.lookAt(new Vector3(0, 0, 0))
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height, modeId])

  return null
}
