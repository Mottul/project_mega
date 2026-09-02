import { Rng } from '../core/rng'

export type ItemKind = 'turbo' | 'turbo3' | 'rakete' | 'kugel' | 'oel' | 'mine' | 'schild' | 'blitz'

export interface ItemInfo {
  kind: ItemKind
  name: string
  short: string
  color: string
  /** Anzahl der Anwendungen, wenn man das Item bekommt. */
  uses: number
}

export const ITEMS: Record<ItemKind, ItemInfo> = {
  turbo: { kind: 'turbo', name: 'Turbo', short: 'TUR', color: '#ff9f2e', uses: 1 },
  turbo3: { kind: 'turbo3', name: 'Dreifach-Turbo', short: 'TU3', color: '#ffca4a', uses: 3 },
  rakete: { kind: 'rakete', name: 'Zielrakete', short: 'RAK', color: '#e34a4a', uses: 1 },
  kugel: { kind: 'kugel', name: 'Prallkugel', short: 'KUG', color: '#7fd4ff', uses: 1 },
  oel: { kind: 'oel', name: 'Ölfleck', short: 'ÖL', color: '#4b4560', uses: 1 },
  mine: { kind: 'mine', name: 'Stachelmine', short: 'MIN', color: '#9aa0b5', uses: 1 },
  schild: { kind: 'schild', name: 'Schutzschild', short: 'SCH', color: '#8affc0', uses: 1 },
  blitz: { kind: 'blitz', name: 'Blitz', short: 'BLZ', color: '#ffe94a', uses: 1 },
}

/**
 * Gewichtete Item-Verteilung. rank01 = 0 (Führender) .. 1 (Letzter):
 * Hinten gibt es die starken Sachen - das ist der Ausgleichsmechanismus,
 * ohne den ein Vorsprung nie mehr aufzuholen wäre.
 */
export function rollItem(rng: Rng, rank01: number, battle: boolean): ItemKind {
  const weights: [ItemKind, number][] = battle
    ? [
        ['rakete', 26],
        ['kugel', 24],
        ['oel', 14],
        ['mine', 14],
        ['schild', 12],
        ['turbo', 10],
      ]
    : [
        ['turbo', 14 + rank01 * 14],
        ['turbo3', 2 + rank01 * 12],
        ['rakete', 10 + rank01 * 16],
        ['kugel', 20 - rank01 * 6],
        ['oel', 20 - rank01 * 12],
        ['mine', 14 - rank01 * 8],
        ['schild', 12 - rank01 * 4],
        ['blitz', rank01 > 0.6 ? 6 * (rank01 - 0.6) * 2.5 : 0],
      ]

  const total = weights.reduce((sum, [, w]) => sum + Math.max(0, w), 0)
  let pick = rng.next() * total
  for (const [kind, w] of weights) {
    pick -= Math.max(0, w)
    if (pick <= 0) return kind
  }
  return 'turbo'
}
