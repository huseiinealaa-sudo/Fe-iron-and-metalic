export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (t: number) => {
  const x = clamp(t)
  return x * x * (3 - 2 * x)
}
/** Inverse lerp, clamped. */
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a || 1))

/** Format a number with a sensible number of significant digits for a readout. */
export function fmt(v: number, digits?: number): string {
  if (!Number.isFinite(v)) return '∞'
  const a = Math.abs(v)
  const d = digits ?? (a >= 1000 ? 0 : a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3)
  return v.toFixed(d)
}

/** Hours rendered as an engineer would read them. */
export function fmtHours(h: number): string {
  if (!Number.isFinite(h)) return '∞'
  if (h >= 8760) return `${fmt(h / 8760, 1)} سنة`
  if (h >= 720) return `${fmt(h / 720, 1)} شهر`
  if (h >= 24) return `${fmt(h / 24, 1)} يوم`
  if (h >= 1) return `${fmt(h, 1)} ساعة`
  return `${fmt(h * 60, 0)} دقيقة`
}

/** Cycle counts rendered compactly. */
export function fmtCycles(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  if (n >= 1e9) return `${fmt(n / 1e9, 1)} مليار`
  if (n >= 1e6) return `${fmt(n / 1e6, 1)} مليون`
  if (n >= 1e3) return `${fmt(n / 1e3, 1)} ألف`
  return fmt(n, 0)
}
