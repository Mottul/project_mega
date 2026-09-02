import { describe, expect, it } from 'vitest'
import { buildLoop, generateArena, generateRaceTrack, trackName, validateLoop } from '../src/game/procedural'
import { Rng } from '../src/core/rng'
import { buildCenterline } from '../src/game/trackgen'
import { WORLD_SIZE } from '../src/game/config'
import { angleDelta } from '../src/core/math'

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919)

describe('Zufalls-Rennstrecken', () => {
  it('sind für jeden Seed gültig befahrbar', () => {
    for (const seed of SEEDS) {
      const track = generateRaceTrack(seed)
      expect(validateLoop(track.points, track.roadWidth), `Seed ${seed}`).toBeNull()
    }
  })

  it('bleiben mit Fahrbahnbreite innerhalb der Welt', () => {
    for (const seed of SEEDS) {
      const track = generateRaceTrack(seed)
      for (const wp of buildCenterline(track.points)) {
        expect(Math.min(wp.x, wp.y, WORLD_SIZE - wp.x, WORLD_SIZE - wp.y)).toBeGreaterThan(track.roadWidth)
      }
    }
  })

  it('haben keine Kurve, die enger als der Kartradius ist', () => {
    for (const seed of SEEDS) {
      const track = generateRaceTrack(seed)
      const wps = buildCenterline(track.points)
      for (let i = 0; i < wps.length; i++) {
        const delta = Math.abs(angleDelta(wps[i]!.dir, wps[(i + 1) % wps.length]!.dir))
        expect(delta).toBeLessThan(0.13)
      }
    }
  })

  it('haben eine sinnvolle Rundenlänge', () => {
    for (const seed of SEEDS) {
      const track = generateRaceTrack(seed)
      const wps = buildCenterline(track.points)
      const length = wps[wps.length - 1]!.dist
      expect(length).toBeGreaterThan(4000)
      expect(length).toBeLessThan(20000)
    }
  })

  it('sind bei gleichem Seed identisch und bei anderem Seed verschieden', () => {
    expect(generateRaceTrack(4242)).toEqual(generateRaceTrack(4242))
    expect(generateRaceTrack(4242).points).not.toEqual(generateRaceTrack(4243).points)
  })

  it('setzen Boost- und Itemfelder über die ganze Runde', () => {
    const track = generateRaceTrack(777)
    for (const p of [...track.boostAt, ...track.itemsAt]) {
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThan(1)
    }
    expect(track.itemsAt.length).toBeGreaterThanOrEqual(3)
  })

  it('kommt fast immer ohne die Ausweichstrecke aus', () => {
    // Fällt der Zufall regelmäßig auf die Notfall-Ellipse zurück, sähen alle
    // Zufallsstrecken gleich aus - das wäre der stille Totalausfall.
    let fallback = 0
    let attempts = 0
    for (let seed = 1; seed <= 300; seed++) {
      const result = buildLoop(new Rng(seed), 255 + (seed % 80))
      if (result.fallback) fallback++
      attempts += result.attempts
    }
    expect(fallback).toBe(0)
    expect(attempts / 300).toBeLessThan(12)
  })

  it('erzeugt unterschiedlich geformte Strecken, keine Kreise', () => {
    // Ohne diese Prüfung könnte der Generator unbemerkt zu lauter runden,
    // langweiligen Strecken zusammenfallen.
    const ratios = SEEDS.map((seed) => {
      const wps = buildCenterline(generateRaceTrack(seed).points)
      const radii = wps.map((w) => Math.hypot(w.x - WORLD_SIZE / 2, w.y - WORLD_SIZE / 2))
      return Math.max(...radii) / Math.max(1, Math.min(...radii))
    })
    const median = [...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)]!
    expect(median).toBeGreaterThan(1.25)
  })

  it('vergibt lesbare Namen', () => {
    expect(trackName(1)).toMatch(/^\S+ \S+$/)
    expect(trackName(1)).toBe(trackName(1))
  })
})

describe('Zufallsarenen', () => {
  it('halten Hindernisse innerhalb der Mauern', () => {
    for (const seed of SEEDS) {
      const arena = generateArena(seed)
      const xs = arena.points.map((p) => p[0])
      const ys = arena.points.map((p) => p[1])
      for (const [bx, by, bw, bh] of arena.blocks ?? []) {
        expect(bx - bw).toBeGreaterThan(Math.min(...xs))
        expect(bx + bw).toBeLessThan(Math.max(...xs))
        expect(by - bh).toBeGreaterThan(Math.min(...ys))
        expect(by + bh).toBeLessThan(Math.max(...ys))
      }
    }
  })

  it('lassen zwischen den Hindernissen befahrbare Gassen', () => {
    for (const seed of SEEDS) {
      const arena = generateArena(seed)
      const blocks = arena.blocks ?? []
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          const a = blocks[i]!
          const b = blocks[j]!
          const gapX = Math.abs(a[0] - b[0]) - a[2] - b[2]
          const gapY = Math.abs(a[1] - b[1]) - a[3] - b[3]
          // Mindestens eine Achse muss eine Durchfahrt lassen.
          expect(Math.max(gapX, gapY)).toBeGreaterThan(150)
        }
      }
    }
  })

  it('sind punktsymmetrisch zur Mitte', () => {
    const arena = generateArena(99)
    const center = WORLD_SIZE / 2
    for (const [bx, by, bw, bh] of arena.blocks ?? []) {
      const mirrored = (arena.blocks ?? []).some(
        (o) => Math.abs(o[0] - (2 * center - bx)) < 1 && Math.abs(o[1] - (2 * center - by)) < 1
      )
      expect(mirrored, `Block ${bx},${by},${bw},${bh}`).toBe(true)
    }
  })
})
