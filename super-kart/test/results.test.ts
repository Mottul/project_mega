import { describe, expect, it } from 'vitest'
import { buildResultRows } from '../src/game/results'
import { createKart } from '../src/game/kart'
import { DRIVERS } from '../src/game/drivers'
import type { Kart } from '../src/game/kart'

function kart(index: number, player: number, patch: Partial<Kart> = {}): Kart {
  const k = createKart(index, DRIVERS[index]!, player, { x: 0, y: 0, angle: 0 })
  return Object.assign(k, patch)
}

describe('Ergebnisliste', () => {
  it('sortiert nach Platzierung, nicht nach Startnummer', () => {
    const rows = buildResultRows('race', [
      kart(0, 0, { rank: 3, finished: true, finishTime: 92.5 }),
      kart(1, -1, { rank: 1, finished: true, finishTime: 88.25 }),
      kart(2, -1, { rank: 2, finished: true, finishTime: 90 }),
    ])
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3])
    expect(rows[0]!.detail).toBe("1'28''250")
  })

  it('markiert lokale Spieler und beschriftet sie', () => {
    const rows = buildResultRows('race', [kart(0, 1, { rank: 1, finished: true, finishTime: 10 })])
    expect(rows[0]!.highlight).toBe(true)
    expect(rows[0]!.name).toContain('(P2)')
  })

  it('zeigt für Karts ohne Zieleinlauf den Rundenstand', () => {
    const rows = buildResultRows('race', [kart(0, -1, { rank: 4, finished: false, lap: 2 })], 3)
    expect(rows[0]!.detail).toBe('Runde 2/3')
  })

  it('zeigt im Battle Ballons und Treffer statt Zeiten', () => {
    const rows = buildResultRows('battle', [kart(0, 0, { rank: 1, balloons: 2, score: 5 })])
    expect(rows[0]!.detail).toBe('2 Ballons · 5 Treffer')
  })
})
