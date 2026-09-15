/**
 * The test coupon. Every dimension is in millimetres, converted once at the
 * render boundary by SCENE_SCALE. Nothing downstream hard-codes a size.
 *
 * Proportions follow a standard round tensile specimen: a reduced gauge
 * section between two shoulders that the grips hold.
 */
export const SPECIMEN = {
  /** Reduced (gauge) section. */
  gaugeLength: 60,
  gaugeDiameter: 12,
  /** Shoulder the grip clamps. */
  shoulderDiameter: 20,
  shoulderLength: 24,
  /** Radius blending gauge into shoulder. */
  filletRadius: 10,
  /** Notional wall thickness used by the corrosion modes, mm. */
  wallThickness: 3,
} as const

/** Axial run of the fillet that blends gauge into shoulder, mm. */
export const FILLET_RUN = Math.sqrt(
  SPECIMEN.filletRadius ** 2 -
    (SPECIMEN.filletRadius - (SPECIMEN.shoulderDiameter - SPECIMEN.gaugeDiameter) / 2) ** 2,
)

export const HALF_LENGTH =
  SPECIMEN.gaugeLength / 2 + FILLET_RUN + SPECIMEN.shoulderLength

export const TOTAL_LENGTH = 2 * HALF_LENGTH

/** Half of the constant-diameter gauge section, mm. */
export const GAUGE_HALF = SPECIMEN.gaugeLength / 2
export const GAUGE_RADIUS = SPECIMEN.gaugeDiameter / 2
export const SHOULDER_RADIUS = SPECIMEN.shoulderDiameter / 2

/** Millimetres to scene units. Applied once, in the Specimen component. */
export const SCENE_SCALE = 0.02
