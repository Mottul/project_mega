import { describe, expect, it } from 'vitest'
import { Rng, seedFrom } from '../src/core/rng'
import { ITEMS, rollItem, type ItemKind } from '../src/game/items'

function distribution(rank01: number, battle = false, draws = 4000): Record<string, number> {
  const rng = new Rng(seedFrom(`items-${rank01}-${battle}`))
  const counts: Record<string, number> = {}
  for (let i = 0; i < draws; i++) {
    const item = rollItem(rng, rank01, battle)
    counts[item] = (counts[item] ?? 0) + 1
  }
  return counts
}

describe('Item-Verteilung', () => {
  it('liefert nur bekannte Items', () => {
    for (const kind of Object.keys(distribution(0.5)) as ItemKind[]) {
      expect(ITEMS[kind]).toBeDefined()
    }
  })

  it('gibt dem Führenden keinen Blitz', () => {
    expect(distribution(0)['blitz']).toBeUndefined()
    expect(distribution(0.5)['blitz']).toBeUndefined()
  })

  it('gibt Hinterherfahrenden häufiger Turbo als dem Führenden', () => {
    const leader = distribution(0)
    const last = distribution(1)
    const turboLeader = (leader['turbo'] ?? 0) + (leader['turbo3'] ?? 0)
    const turboLast = (last['turbo'] ?? 0) + (last['turbo3'] ?? 0)
    expect(turboLast).toBeGreaterThan(turboLeader * 1.4)
  })

  it('kennt im Battle keine Streckenitems wie den Blitz', () => {
    const battle = distribution(0.5, true)
    expect(battle['blitz']).toBeUndefined()
    expect(battle['turbo3']).toBeUndefined()
    expect(battle['rakete']).toBeGreaterThan(0)
  })
})
