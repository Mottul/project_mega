/** Kleine Mathe-Helfer, die im gesamten Spiel gebraucht werden. */

export const TAU = Math.PI * 2

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Normalisiert einen Winkel auf [-PI, PI) - Basis für jede Kurvenregelung. */
export function wrapAngle(a: number): number {
  let x = (a + Math.PI) % TAU
  if (x < 0) x += TAU
  return x - Math.PI
}

/** Kürzeste Winkeldifferenz von a nach b. */
export function angleDelta(a: number, b: number): number {
  return wrapAngle(b - a)
}

/** Rahmenratenunabhängiges Annähern: t ist die Halbwertszeit in Sekunden. */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target
  return lerp(target, current, Math.pow(2, -dt / halfLife))
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/** Catmull-Rom-Interpolation - erzeugt aus Stützpunkten eine weiche Strecke. */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--'--''---"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${m}'${String(s).padStart(2, '0')}''${String(ms).padStart(3, '0')}`
}
