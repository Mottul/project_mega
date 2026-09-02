import { describe, expect, it } from 'vitest'
import { ALL_TRACKS, BATTLE_ARENAS, RACE_TRACKS, trackById } from '../src/game/tracks'
import { WORLD_SIZE } from '../src/game/config'
import { DRIVERS } from '../src/game/drivers'

describe('Streckendaten', () => {
  it('hat eindeutige IDs', () => {
    const ids = ALL_TRACKS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('hält alle Stützpunkte in der Welt', () => {
    for (const track of ALL_TRACKS) {
      for (const [x, y] of track.points) {
        expect(x).toBeGreaterThan(0)
        expect(y).toBeGreaterThan(0)
        expect(x).toBeLessThan(WORLD_SIZE)
        expect(y).toBeLessThan(WORLD_SIZE)
      }
    }
  })

  it('lässt zwischen Strecke und Weltrand Platz für das Gelände', () => {
    for (const track of RACE_TRACKS) {
      for (const [x, y] of track.points) {
        expect(Math.min(x, y, WORLD_SIZE - x, WORLD_SIZE - y)).toBeGreaterThan(track.roadWidth)
      }
    }
  })

  it('definiert Arenen als Rechteck mit Hindernissen', () => {
    for (const arena of BATTLE_ARENAS) {
      expect(arena.kind).toBe('battle')
      expect(arena.points.length).toBe(4)
      expect((arena.blocks ?? []).length).toBeGreaterThan(0)
    }
  })

  it('findet Strecken über die ID', () => {
    expect(trackById('wiese')?.name).toBe('Grüne Wiese')
    expect(trackById('gibtesnicht')).toBeUndefined()
  })

  it('bietet genug Fahrer für ein volles Feld', () => {
    expect(DRIVERS.length).toBeGreaterThanOrEqual(8)
    expect(new Set(DRIVERS.map((d) => d.id)).size).toBe(DRIVERS.length)
  })
})
