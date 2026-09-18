import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { BackSide, Color, PMREMGenerator, ShaderMaterial, type Texture } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CameraFit } from './CameraFit'
import { Specimen } from './Specimen'
import { Rig } from './Rig'

/** Studio palette. Horizon is what the fog fades into. */
const SKY_TOP = '#0d141d'
const SKY_HORIZON = '#25344a'
const SKY_BOTTOM = '#06080b'
const FLOOR = '#101822'
const FLOOR_LINE = '#34465a'

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

/**
 * A cyclorama: a large inverted sphere with a vertical gradient, brightest at
 * the horizon so the specimen's silhouette always sits against a lighter band.
 * Fog is off on it — it is the thing the fog fades towards.
 */
function Backdrop() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new Color(SKY_TOP) },
          uHorizon: { value: new Color(SKY_HORIZON) },
          uBottom: { value: new Color(SKY_BOTTOM) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop, uHorizon, uBottom;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c = h > 0.0
              ? mix(uHorizon, uTop, pow(h, 0.55))
              : mix(uHorizon, uBottom, pow(-h, 0.7));
            // A soft key-side glow, as a studio's soft box would leave.
            float glow = max(0.0, dot(vDir, normalize(vec3(0.5, 0.35, 0.6))));
            c += vec3(0.08, 0.09, 0.11) * pow(glow, 5.0);
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh material={material} scale={[40, 40, 40]} renderOrder={-10}>
      <sphereGeometry args={[1, 32, 24]} />
    </mesh>
  )
}

/**
 * A measuring floor: a fine grid that fades out radially, so the coupon
 * reads at a real scale without a hard-edged plane cutting the backdrop.
 */
function Floor() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uFloor: { value: new Color(FLOOR) },
          uLine: { value: new Color(FLOOR_LINE) },
        },
        vertexShader: /* glsl */ `
          varying vec2 vXZ;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vXZ = w.xz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uFloor, uLine;
          varying vec2 vXZ;
          void main() {
            float r = length(vXZ);
            float fade = 1.0 - smoothstep(2.2, 9.0, r);
            vec2 f = abs(fract(vXZ * 2.0) - 0.5);
            float line = 1.0 - smoothstep(0.0, 0.035, min(f.x, f.y));
            vec2 fm = abs(fract(vXZ * 0.5) - 0.5);
            float major = 1.0 - smoothstep(0.0, 0.012, min(fm.x, fm.y));
            float ink = max(line * 0.5, major * 0.9);
            vec3 c = mix(uFloor, uLine, ink);
            gl_FragColor = vec4(c, fade * (0.75 + 0.25 * ink));
          }
        `,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.803, 0]}>
      <circleGeometry args={[10, 64]} />
    </mesh>
  )
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
      <Backdrop />

      {/* Three-point studio lighting: warm key, cool fill, amber rim, plus a
          hemisphere so the underside of the coupon never goes dead black. */}
      <hemisphereLight args={['#8fa6c2', '#2b241c', 0.75]} />
      <ambientLight intensity={0.1} />
      <directionalLight
        position={[3, 5, 4]}
        intensity={1.9}
        color="#fff1e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0008}
        shadow-radius={4}
      />
      <directionalLight position={[-4, 2, -3]} intensity={0.55} color="#9fc4ff" />
      <spotLight position={[0, 4, -4]} intensity={1.0} angle={0.7} penumbra={1} color="#ffd9a0" />

      <Specimen />
      <Rig />

      <ContactShadows
        position={[0, -0.8, 0]}
        opacity={0.55}
        scale={12}
        blur={2.6}
        far={1.6}
        resolution={1024}
      />
      <Floor />
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
      onCreated={({ gl }) => { gl.toneMappingExposure = 1.0 }}
      // The canvas stays LTR even though the panels around it are RTL.
      style={{ direction: 'ltr', touchAction: 'none' }}
    >
      <fog attach="fog" args={[SKY_HORIZON, 9, 26]} />
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
