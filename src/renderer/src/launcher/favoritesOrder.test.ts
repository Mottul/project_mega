import { describe, expect, it } from 'vitest'
import { dropOn, moveBy, sortByName } from './favoritesOrder'

describe('Favoriten-Reihenfolge', () => {
  const list = ['a', 'b', 'c', 'd']

  it('Ziehen & Ablegen: vor bzw. hinter das Ziel', () => {
    expect(dropOn(list, 'd', 'a', false)).toEqual(['d', 'a', 'b', 'c'])
    expect(dropOn(list, 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd'])
    expect(dropOn(list, 'b', 'b', true)).toBe(list)
    expect(dropOn(list, 'x', 'a', true)).toBe(list)
  })

  it('Pfeile: Nachbarn unter den sichtbaren, unbekannte IDs bleiben stehen', () => {
    const stored = ['a', 'alt', 'b', 'c']
    const visible = ['a', 'b', 'c']
    expect(moveBy(stored, visible, 'b', -1)).toEqual(['b', 'a', 'alt', 'c'])
    expect(moveBy(stored, visible, 'c', 1)).toBe(stored)
    expect(moveBy(stored, visible, 'a', -1)).toBe(stored)
  })

  it('A–Z nach Anzeigename, Umlaute richtig, unbekannte ans Ende', () => {
    const names: Record<string, string> = { t: 'Timer', o: 'Öffnungswinkel', a: 'Audio' }
    expect(sortByName(['t', 'weg', 'o', 'a'], (id) => names[id])).toEqual(['a', 'o', 't', 'weg'])
  })
})
