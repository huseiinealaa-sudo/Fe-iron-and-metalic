/**
 * The specimen material: a MeshStandardMaterial patched with the deformation
 * and damage shaders.
 *
 * Patching rather than replacing keeps three's physically based lighting,
 * shadows and environment reflections — which is what makes the coupon read as
 * metal instead of plastic. The vertex stage moves the geometry; the fragment
 * stage paints the stress map and the corrosion damage.
 *
 * Axis convention inside the shader: x is axial, (y, z) is the cross-section.
 */

import { Color, MeshStandardMaterial, type IUniform } from 'three'
import { NOISE_GLSL } from './noise.glsl'

/** Which analytical stress distribution the colour map should draw. */
export const STRESS_MODE = {
  uniform: 0,
  bending: 1,
  torsion: 2,
  shear: 3,
  none: 4,
} as const

export type SteelUniforms = Record<string, IUniform>

export function createSteelUniforms(): SteelUniforms {
  return {
    uAxialStrain: { value: 0 },
    uNeck: { value: 0 },
    uBarrel: { value: 0 },
    uBow: { value: 0 },
    uBendAngle: { value: 0 },
    uTwist: { value: 0 },
    uShearOffset: { value: 0 },
    uCrackDepth: { value: 0 },
    uCrackAngle: { value: 0 },
    uGap: { value: 0 },
    uPitDensity: { value: 0 },
    uPitDepth: { value: 0 },
    uBranching: { value: 0 },
    uGbOpen: { value: 0 },
    uBrittle: { value: 0 },
    uGlow: { value: 0 },
    uFrost: { value: 0 },
    uUtilisation: { value: 0 },
    uStressMode: { value: 0 },
    uStressMix: { value: 1 },
    uBeach: { value: 0 },
    uGrid: { value: 1 },
    uWeldBands: { value: 0 },
    uTime: { value: 0 },
    uGaugeHalf: { value: 30 },
    uGaugeR: { value: 6 },
    uHalfLen: { value: 62 },
  }
}

const VERTEX_DECL = /* glsl */ `
attribute float aFace;
uniform float uAxialStrain, uNeck, uBarrel, uBow, uBendAngle, uTwist, uShearOffset;
uniform float uCrackDepth, uGap, uPitDepth, uBrittle, uStressMode;
uniform float uGaugeHalf, uGaugeR, uHalfLen;
varying float vFace, vRn, vAng, vX0, vStressLocal;
varying vec3 vLocal;
`

/**
 * Position and normal deformation.
 *
 * Only the reduced gauge section deforms; the shoulders translate and rotate
 * rigidly, exactly as a coupon held in real grips behaves.
 */
const VERTEX_BODY = /* glsl */ `
  vec3 p = position;
  float x0 = p.x;
  float r0 = length(p.yz);
  float ang = atan(p.z, p.y);

  vFace = aFace;
  vRn = clamp(r0 / uGaugeR, 0.0, 1.4);
  vAng = ang;
  vX0 = x0;
  vLocal = position;

  // --- the fracture face itself: cup and cone, or a flat cleavage plane ---
  if (aFace > 0.5 && aFace < 1.5) {
    float u = clamp(r0 / uGaugeR, 0.0, 1.0);
    float d = 0.20 * uGaugeR * (1.0 - uBrittle);
    // Fibrous cup out to 72% of the radius, then the 45 degree shear lip.
    float cup = u < 0.72
      ? -d * (1.0 - pow(u / 0.72, 2.0))
      :  d * 0.55 * ((u - 0.72) / 0.28);
    float facet = uBrittle * uGaugeR * 0.05 * (hash21(vec2(ang * 3.0, u * 9.0)) - 0.5);
    p.x += cup + facet;
    x0 = p.x;
  }

  // 1 inside the gauge, fading to 0 across the fillet into the shoulder.
  float gm = 1.0 - smoothstep(uGaugeHalf * 0.96, uGaugeHalf * 1.22, abs(x0));

  // --- axial: the gauge stretches, the shoulders ride along rigidly ---
  float xg = clamp(x0, -uGaugeHalf, uGaugeHalf);
  float xx = x0 + xg * uAxialStrain;

  // --- radial: constant volume, then the neck, the barrel and the pits ---
  float neckW = 0.30 * uGaugeHalf;
  float neckShape = exp(-pow(x0 / neckW, 2.0));
  float barrelShape = 1.0 - pow(clamp(x0 / uGaugeHalf, -1.0, 1.0), 2.0);
  float rsPoisson = 1.0 / sqrt(max(0.25, 1.0 + uAxialStrain));
  float rsNeck = 1.0 - 0.62 * uNeck * neckShape;
  float rsBarrel = 1.0 + 0.32 * uBarrel * barrelShape;
  float rsPit = 1.0 - 0.06 * uPitDepth;
  float rs = mix(1.0, rsPoisson * rsNeck * rsBarrel * rsPit, gm);

  vec2 rad = p.yz * rs;

  // Slope the necking and barrelling add to the profile — needed for shading.
  float dSlope = r0 * gm * (
      0.62 * uNeck * neckShape * (2.0 * x0 / (neckW * neckW))
    - 0.32 * uBarrel * 2.0 * x0 / (uGaugeHalf * uGaugeHalf)
  );

  vec3 nrm = objectNormal;
  nrm.x -= dSlope * length(nrm.yz);

  // --- torsion: cross-sections rotate in proportion to axial position ---
  float tw = uTwist * 0.5 * clamp(x0 / uGaugeHalf, -1.0, 1.0);
  if (abs(uTwist) > 1e-5) {
    float ct = cos(tw), st = sin(tw);
    rad = vec2(rad.x * ct - rad.y * st, rad.x * st + rad.y * ct);
    nrm.yz = vec2(nrm.y * ct - nrm.z * st, nrm.y * st + nrm.z * ct);
    // The twist gradient tilts the surface along the helix.
    nrm.x -= (uTwist * 0.5 / uGaugeHalf) * r0 * gm;
    nrm = normalize(nrm);
  }

  // --- direct shear: a displacement discontinuity across one narrow band ---
  rad.x += uShearOffset * uGaugeR * clamp(xx / (0.10 * uGaugeHalf), -1.0, 1.0);

  // --- the crack opens along the transverse plane ---
  float open = uCrackDepth * uGaugeR * 0.07;
  xx += open * exp(-pow(xx / (0.07 * uGaugeHalf), 2.0));

  // --- buckling: a half sine bow, zero at the grips ---
  rad.x += uBow * uHalfLen * cos(1.5707963 * clamp(xx / uHalfLen, -1.0, 1.0));

  // --- bending: constant curvature over the gauge, rigid tails ---
  float phi = 0.0;
  if (uBendAngle > 1e-4) {
    float kappa = uBendAngle / (2.0 * uGaugeHalf);
    float R = 1.0 / kappa;
    float xb = clamp(xx, -uGaugeHalf, uGaugeHalf);
    float tail = xx - xb;
    phi = kappa * xb;
    float rr = R + rad.x;
    float bx = rr * sin(phi) + tail * cos(phi);
    float by = rr * cos(phi) - R - tail * sin(phi);
    by -= R * cos(kappa * uGaugeHalf) - R;   // keep the grips level
    xx = bx;
    rad.x = -by;                              // sag downwards, tension underneath
    float cp = cos(phi), sp = sin(phi);
    nrm = vec3(nrm.x * cp + nrm.y * sp, -(-nrm.x * sp + nrm.y * cp), nrm.z);
  }

  // --- separation of the two halves once it has actually broken ---
  xx += uGap * uHalfLen;

  objectNormal = normalize(nrm);

  // --- where the stress actually sits, for the colour map ---
  float sm = uStressMode;
  float local = 1.0;
  if (sm < 0.5) {
    local = 1.0 + 1.8 * uNeck * neckShape;          // uniform, sharpened by the neck
  } else if (sm < 1.5) {
    // Bending: signed across the depth. Fibres at +y sit further from the
    // centre of curvature, so they are the ones that stretch; the bend
    // transform then flips them onto the outside of the arc.
    local = p.y / uGaugeR;
  } else if (sm < 2.5) {
    local = r0 / uGaugeR;                            // torsion: zero on the axis
  } else if (sm < 3.5) {
    local = exp(-pow(x0 / (0.14 * uGaugeHalf), 2.0)); // direct shear: one plane
  } else {
    local = 0.0;
  }
  vStressLocal = local * gm + (sm < 0.5 ? (1.0 - gm) * 0.35 : 0.0);

  vec3 gPos = vec3(xx, rad.x, rad.y);
`

const FRAGMENT_DECL = /* glsl */ `
uniform float uCrackDepth, uCrackAngle, uGap, uPitDensity, uPitDepth;
uniform float uBranching, uGbOpen, uBrittle, uGlow, uFrost;
uniform float uUtilisation, uStressMode, uStressMix, uBeach, uTime, uGrid, uWeldBands;
uniform float uGaugeHalf, uGaugeR;
varying float vFace, vRn, vAng, vX0, vStressLocal;
varying vec3 vLocal;

/** Cool blue through green and amber to red. */
vec3 stressRamp(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.184, 0.435, 0.816);
  vec3 c1 = vec3(0.184, 0.639, 0.420);
  vec3 c2 = vec3(0.847, 0.647, 0.165);
  vec3 c3 = vec3(0.878, 0.392, 0.165);
  vec3 c4 = vec3(0.816, 0.184, 0.184);
  if (t < 0.35) return mix(c0, c1, t / 0.35);
  if (t < 0.62) return mix(c1, c2, (t - 0.35) / 0.27);
  if (t < 0.82) return mix(c2, c3, (t - 0.62) / 0.20);
  return mix(c3, c4, (t - 0.82) / 0.18);
}

/** Signed version — compression reads cold, tension reads hot. */
vec3 stressRampSigned(float s){
  if (s >= 0.0) return stressRamp(s);
  return mix(vec3(0.42, 0.47, 0.52), vec3(0.16, 0.36, 0.74), clamp(-s, 0.0, 1.0));
}
`

/** Damage and stress painting, injected where the base colour is decided. */
const FRAGMENT_COLOR = /* glsl */ `
  // The fracture faces exist only once the coupon has actually separated.
  if (vFace > 0.5 && vFace < 1.5 && uGap < 0.002) discard;

  // Surface coordinates in millimetres, so features keep a physical size.
  vec2 sp = vec2(vAng * uGaugeR, vX0);

  float dark = 0.0;     // how much the surface is eaten away
  float rough = 0.0;    // extra roughness from oxide and tearing
  vec3 tint = vec3(0.0);

  // --- pitting: a sparse set of self-accelerating craters ---
  if (uPitDensity > 0.001) {
    vec2 vo = voronoi(sp * 0.42);
    float seed = hash21(floor(sp * 0.42) + 3.7);
    float pitOn = step(1.0 - uPitDensity, hash21(vec2(vo.x * 13.0, seed * 31.0)) * 0.5 + seed * 0.5);
    float pit = 1.0 - smoothstep(0.05, 0.05 + 0.34 * uPitDepth, vo.x);
    float rim = smoothstep(0.30 * uPitDepth, 0.0, abs(vo.x - 0.06 - 0.32 * uPitDepth));
    dark += pitOn * pit * (0.55 + 0.45 * uPitDepth);
    tint += pitOn * pit * vec3(0.20, 0.10, 0.04) * uPitDepth;
    rough += pitOn * (pit * 0.6 + rim * 0.3);
  }

  // --- chloride SCC: a transgranular network that branches like a root ---
  if (uBranching > 0.001) {
    float r1 = ridged(sp * 0.30 + vec2(0.0, 2.1));
    float r2 = ridged(sp * 0.85 + vec2(5.3, 0.0));
    float thr = 1.0 - 0.30 * uBranching;
    float net = smoothstep(thr, thr + 0.06, r1) + 0.6 * smoothstep(thr + 0.03, thr + 0.09, r2);
    dark += clamp(net, 0.0, 1.0) * (0.55 + 0.45 * uBranching);
    rough += clamp(net, 0.0, 1.0) * 0.4;
  }

  // --- sensitisation: the grain boundary network opens up ---
  if (uGbOpen > 0.001) {
    vec2 vo = voronoi(sp * 1.15);
    float edge = 1.0 - smoothstep(0.0, 0.02 + 0.10 * uGbOpen, vo.y);
    // Weld decay attacks two bands a few millimetres either side of the bead —
    // the metal that lingered longest in the sensitising range — never the
    // weld itself. Creep opens boundaries everywhere instead.
    float band = 1.0;
    float bead = 0.0;
    if (uWeldBands > 0.5) {
      band = exp(-pow((abs(vX0) - 11.0) / 4.5, 2.0));
      bead = 1.0 - smoothstep(3.0, 4.6, abs(vX0));
      rough += bead * 0.45;
      tint += bead * vec3(0.05, 0.035, 0.02);
    }
    dark += edge * (0.35 + 0.65 * uGbOpen) * band;
    tint += edge * vec3(0.16, 0.09, 0.03) * uGbOpen * band;
    rough += edge * 0.5 * band;
    // The bead itself: a rippled fusion zone, immune to the decay beside it.
    dark += bead * 0.10 * (0.5 + 0.5 * sin(vAng * uGaugeR * 2.4));
  }

  // --- the crack itself, as a line on the outside surface ---
  if (uCrackDepth > 0.001) {
    float plane = vX0 * cos(uCrackAngle) + vAng * uGaugeR * sin(uCrackAngle);
    float w = 0.25 + 1.1 * uCrackDepth;
    float line = 1.0 - smoothstep(0.0, w, abs(plane));
    dark += line * clamp(uCrackDepth * 2.2, 0.0, 1.0);
    rough += line * 0.5;
  }

  dark = clamp(dark, 0.0, 1.0);

  // --- scribed reference grid ---
  // Rings every 10 mm and lines every 30 degrees, marked on the UNDEFORMED
  // coupon. A twisted round bar has an unchanged silhouette, so without these
  // marks torsion would be invisible; they also make the neck read as strain
  // localisation rather than as a shape.
  float gridInk = 0.0;
  if (uGrid > 0.001 && vFace < 0.5) {
    float ring = abs(fract(vX0 / 10.0 + 0.5) - 0.5) * 10.0;
    float linePitch = 3.1415926 / 6.0;
    float lon = abs(fract(vAng / linePitch + 0.5) - 0.5) * linePitch * uGaugeR;
    gridInk = max(
      1.0 - smoothstep(0.10, 0.34, ring),
      1.0 - smoothstep(0.10, 0.34, lon)
    ) * uGrid;
  }

  // --- the fracture surface gets its own texture ---
  if (vFace > 0.5 && vFace < 1.5) {
    vec2 fp = vec2(vRn * uGaugeR, vAng * uGaugeR * 0.5);
    float fibrous = fbm(fp * 2.2) * (1.0 - uBrittle);
    vec2 cleave = voronoi(fp * 1.6);
    float facets = (1.0 - smoothstep(0.0, 0.035, cleave.y)) * uBrittle;
    // Beach marks: arcs centred on the point the fatigue crack started from.
    float originD = length(vec2(vRn - 1.0, vAng * 0.9));
    float beach = uBeach * (0.5 + 0.5 * sin(originD * 26.0 - 1.0)) * smoothstep(1.6, 0.2, originD);
    dark = clamp(dark * 0.3 + fibrous * 0.35 + beach * 0.30, 0.0, 1.0);
    rough = mix(0.55, 0.12, uBrittle) + facets * 0.1;
    tint += vec3(0.02);
  }

  vec3 base = vec3(0.706, 0.749, 0.784);
  base = mix(base, vec3(0.86, 0.90, 0.94), uFrost * 0.7);
  base = mix(base, vec3(0.05, 0.04, 0.035) + tint, dark);

  // --- the stress map, drawn over the metal ---
  float util = clamp(uUtilisation, 0.0, 1.0);
  float signed = vStressLocal;
  float magnitude = util * abs(signed);
  vec3 smap = stressRampSigned(sign(signed) * magnitude);
  float mixAmt = uStressMix * (uStressMode > 3.5 ? 0.0 : 1.0) * clamp(abs(signed), 0.0, 1.0);
  // Raised contrast: at the neutral axis the map must still fade to bare
  // metal, but the mid-range has to be visible on a reflective surface.
  float stressStrength = pow(mixAmt, 0.6) * (0.45 + 0.55 * magnitude);
  base = mix(base, smap, stressStrength);

  base = mix(base, base * 0.32, gridInk * 0.55);

  diffuseColor.rgb = base;
  dDark = dark;
  dRough = clamp(rough, 0.0, 1.0);
  // A mirror shows the room, not its own colour. Stressed metal is pulled
  // towards a diffuse surface so the map is actually readable.
  dStress = stressStrength;
`

export interface SteelMaterialOptions {
  gaugeHalf: number
  gaugeRadius: number
  halfLength: number
}

export function createSteelMaterial(
  uniforms: SteelUniforms,
  opts: SteelMaterialOptions,
): MeshStandardMaterial {
  uniforms.uGaugeHalf.value = opts.gaugeHalf
  uniforms.uGaugeR.value = opts.gaugeRadius
  uniforms.uHalfLen.value = opts.halfLength

  const mat = new MeshStandardMaterial({
    color: new Color('#b4bfc8'),
    metalness: 0.82,
    roughness: 0.32,
    envMapIntensity: 0.7,
  })

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${NOISE_GLSL}\n${VERTEX_DECL}\nvoid main() {`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${VERTEX_BODY}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = gPos;')

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${NOISE_GLSL}\n${FRAGMENT_DECL}\nvoid main() {\n  float dDark = 0.0;\n  float dRough = 0.0;\n  float dStress = 0.0;`)
      .replace('#include <map_fragment>', FRAGMENT_COLOR)
      .replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = clamp(roughness + dRough * 0.62 + uFrost * 0.25 + dStress * 0.3, 0.04, 1.0);',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        'float metalnessFactor = metalness * (1.0 - dDark * 0.75) * (1.0 - 0.85 * dStress);',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `totalEmissiveRadiance = emissive
           + vec3(1.0, 0.34, 0.06) * pow(uGlow, 1.6) * 2.4 * (1.0 - dDark * 0.5);`,
      )
  }

  // Force a recompile when the patch changes between hot reloads.
  mat.customProgramCacheKey = () => 'fe-steel-v1'
  return mat
}
