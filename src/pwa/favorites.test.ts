import { describe, expect, it } from 'vitest'
import { favoritesCodec, moveFavorite, splitFavorites, toggleFavorite } from './favorites'

const tools = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

describe('Favoriten der Rechner-PWA', () => {
  it('liest nur Listen von Texten, ohne Doppelte', () => {
    expect(favoritesCodec.parse('["b","a","b",3]')).toEqual(['b', 'a'])
    expect(favoritesCodec.parse('{"a":1}')).toBeNull()
    expect(favoritesCodec.parse('kaputt')).toBeNull()
    expect(favoritesCodec.parse(favoritesCodec.format(['c', 'a']))).toEqual(['c', 'a'])
  })

  it('heftet ans Ende an und wieder ab', () => {
    expect(toggleFavorite(['a'], 'c')).toEqual(['a', 'c'])
    expect(toggleFavorite(['a', 'c'], 'a')).toEqual(['c'])
  })

  it('verschiebt um einen Platz, am Rand nicht weiter', () => {
    expect(moveFavorite(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b'])
    expect(moveFavorite(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c'])
    const favs = ['a', 'b']
    expect(moveFavorite(favs, 'a', -1)).toBe(favs)
    expect(moveFavorite(favs, 'b', 1)).toBe(favs)
    expect(moveFavorite(favs, 'x', 1)).toBe(favs)
  })

  it('teilt in Favoriten (eigene Reihenfolge) und Rest (App-Reihenfolge)', () => {
    const { favorites, rest } = splitFavorites(tools, ['c', 'weg', 'a'])
    expect(favorites.map((t) => t.id)).toEqual(['c', 'a'])
    expect(rest.map((t) => t.id)).toEqual(['b', 'd'])
  })
})
