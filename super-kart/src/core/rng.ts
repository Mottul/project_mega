/**
 * Deterministischer PRNG (mulberry32). Rennen sollen mit gleichem Seed gleich
 * ablaufen - das macht Fehler reproduzierbar und Strecken stabil.
 */
export class Rng {
  private state: number

  constructor(seed = 0x9e3779b9) {
    this.state = seed >>> 0
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo)
  }

  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1))
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!
  }
}

/** Hasht einen Streckennamen zu einem Seed, damit Strecken reproduzierbar sind. */
export function seedFrom(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
