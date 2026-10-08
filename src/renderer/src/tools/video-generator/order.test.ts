import { describe, expect, it } from 'vitest'
import { moveItem, moveMany, nudge, shuffle, sortItems } from './order'

const items = (...names: string[]): { id: string; path: string; kind: string }[] =>
  names.map((n) => ({
    id: n,
    path: `C:\\Show\\${n}`,
    kind: n.endsWith('.mp4') ? 'video' : n.endsWith('.gif') ? 'gif' : 'image'
  }))
const ids = (l: { id: string }[]): string[] => l.map((x) => x.id)

describe('Video-Generator – Reihenfolge', () => {
  it('moveItem: nach vorn und hinten', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 4)).toEqual(['a', 'c', 'd', 'b'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })

  it('moveMany: Auswahl als Block vor ein Ziel oder ans Ende', () => {
    const l = items('a', 'b', 'c', 'd', 'e')
    expect(ids(moveMany(l, ['b', 'd'], 'a'))).toEqual(['b', 'd', 'a', 'c', 'e'])
    expect(ids(moveMany(l, ['a', 'c'], null))).toEqual(['b', 'd', 'e', 'a', 'c'])
    expect(moveMany(l, ['b'], 'b')).toBe(l)
  })

  it('nudge: Auswahl einen Schritt, am Rand nicht weiter', () => {
    const l = items('a', 'b', 'c', 'd')
    expect(ids(nudge(l, ['b', 'c'], -1))).toEqual(['b', 'c', 'a', 'd'])
    expect(ids(nudge(l, ['b', 'c'], 1))).toEqual(['a', 'd', 'b', 'c'])
    expect(nudge(l, ['a'], -1)).toBe(l)
  })

  it('Sortieren nach Name natürlich, Typ, Datum (ohne Datum ans Ende)', () => {
    const l = items('Bild 10.jpg', 'bild 2.jpg', 'clip.mp4', 'anim.gif', 'Bild 1.jpg')
    expect(ids(sortItems(l, 'name'))).toEqual([
      'anim.gif',
      'Bild 1.jpg',
      'bild 2.jpg',
      'Bild 10.jpg',
      'clip.mp4'
    ])
    expect(ids(sortItems(l, 'type'))).toEqual([
      'Bild 1.jpg',
      'bild 2.jpg',
      'Bild 10.jpg',
      'anim.gif',
      'clip.mp4'
    ])
    const dates: Record<string, number> = { 'clip.mp4': 5, 'Bild 10.jpg': 1 }
    expect(ids(sortItems(l, 'date', (x) => dates[x.id] ?? null))).toEqual([
      'Bild 10.jpg',
      'clip.mp4',
      'anim.gif',
      'Bild 1.jpg',
      'bild 2.jpg'
    ])
  })

  it('Mischen: deterministisch je Startwert, nie die alte Reihenfolge', () => {
    const l = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(shuffle(l, 42)).toEqual(shuffle(l, 42))
    expect(shuffle(l, 42)).not.toEqual(l)
    expect([...shuffle(l, 7)].sort()).toEqual(l)
    expect(shuffle(['a', 'b'], 1)).toEqual(['b', 'a'])
    expect(shuffle(['a'], 1)).toEqual(['a'])
  })
})
