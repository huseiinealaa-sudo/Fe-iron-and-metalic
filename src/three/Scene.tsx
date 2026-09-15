import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { PMREMGenerator, type Texture } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CameraFit } from './CameraFit'
import { Specimen } from './Specimen'
import { Rig } from './Rig'

/**
 * A studio environment generated in code.
 *
 * Metal without reflections reads as plastic, and a downloaded HDR would be a
 * runtime network dependency, so the environment is built from three's own
 * RoomEnvironment and pre-filtered on the GPU at start-up.
 */
function StudioEnvironment() {
  const { gl, scene } = useThree()
  const envMap = useMemo<Texture>(() => {
    const pmrem = new PMREMGenerator(gl)
    const map = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    return map
  }, [gl])

  useEffect(() => {
    scene.environment = envMap
    return () => {
      scene.environment = null
      envMap.dispose()
    }
  }, [scene, envMap])

  return null
}

function Stage() {
  const { gl } = useThree()
  useEffect(() => {
    // The section view needs per-material clipping planes.
    gl.localClippingEnabled = true
  }, [gl])

  return (
    <>
      <StudioEnvironment />
      <CameraFit />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[3, 5, 4]}
        intensity={1.35}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0008}
      />
      <directionalLight position={[-4, 2, -3]} intensity={0.45} color="#9fc4ff" />
      <spotLight position={[0, 4, -4]} intensity={0.8} angle={0.7} penumbra={1} color="#ffd9a0" />

      <Specimen />
      <Rig />

      <ContactShadows
        position={[0, -0.8, 0]}
        opacity={0.45}
        scale={12}
        blur={2.4}
        far={1.4}
        resolution={1024}
      />
      <gridHelper args={[16, 48, '#1d2833', '#161d25']} position={[0, -0.802, 0]} />
    </>
  )
}

export function Scene() {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, alpha: false }}
      camera={{ position: [1.6, 1.4, 4.6], fov: 34, near: 0.05, far: 100 }}
      onCreated={({ gl }) => { gl.toneMappingExposure = 0.92 }}
      // The canvas stays LTR even though the panels around it are RTL.
      style={{ direction: 'ltr', touchAction: 'none' }}
    >
      <color attach="background" args={['#0a0e13']} />
      <fog attach="fog" args={['#0a0e13', 9, 26]} />
      <Stage />
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={1.2}
        maxDistance={14}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI * 0.86}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.8}
        zoomSpeed={0.9}
        target={[0, 0, 0]}
      />
    </Canvas>
  )
}
