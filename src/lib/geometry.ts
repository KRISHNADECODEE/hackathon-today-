// Pure geometry helpers. Inputs are MediaPipe normalized image landmarks:
// x,y in [0,1] relative to frame width/height, so x is scaled by the aspect
// ratio before measuring angles. These are image-plane angles, not calibrated
// physical measurements.

export type Point = { x: number; y: number; visibility?: number }
export type Vec = { x: number; y: number }

export const sub = (a: Point, b: Point): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y
export const magnitude = (v: Vec) => Math.hypot(v.x, v.y)
export const toDegrees = (rad: number) => (rad * 180) / Math.PI
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const EPS = 1e-9

/** Angle in degrees between vectors u and v, or null if either has zero length. */
export function vectorAngle(u: Vec, v: Vec): number | null {
  const mu = magnitude(u)
  const mv = magnitude(v)
  if (mu < EPS || mv < EPS) return null
  return toDegrees(Math.acos(clamp(dot(u, v) / (mu * mv), -1, 1)))
}

/** Angle ABC at joint B, in degrees, or null when unavailable. */
export function jointAngle(a?: Point, b?: Point, c?: Point): number | null {
  if (!a || !b || !c) return null
  if (
    !Number.isFinite(a.x) || !Number.isFinite(a.y) ||
    !Number.isFinite(b.x) || !Number.isFinite(b.y) ||
    !Number.isFinite(c.x) || !Number.isFinite(c.y)
  ) return null
  return vectorAngle(sub(a, b), sub(c, b))
}

export const isReliable = (p: Point | undefined, minVisibility: number) =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= minVisibility

/** Scale x by aspect ratio (width/height) so both axes share one unit. */
export const toSquare = (p: Point, aspect: number): Point => ({ ...p, x: p.x * aspect })

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Exponential moving average: smoothed = alpha * current + (1 - alpha) * previous. */
export class Ema {
  private value: number | null = null
  alpha: number
  constructor(alpha = 0.3) {
    this.alpha = alpha
  }
  next(current: number): number {
    this.value = this.value === null ? current : this.alpha * current + (1 - this.alpha) * this.value
    return this.value
  }
  reset() {
    this.value = null
  }
  get current() {
    return this.value
  }
}
