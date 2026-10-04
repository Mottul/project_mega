import { describe, expect, it } from 'vitest'
import type { FavoriteGroup } from '@shared/types'
import {
  addGroup,
  canMoveTool,
  dropGroup,
  dropTool,
  flatten,
  moveGroup,
  moveToolBy,
  nextGroupName,
  normalizeGroups,
  removeGroup,
  renameGroup,
  setSpan,
  sortGroup,
  toggleTool
} from './favoriteGroups'

const g = (id: string, toolIds: string[], span = 12, name = id): FavoriteGroup => ({
  id,
  name,
  span,
  toolIds
})
const ids = (groups: FavoriteGroup[]): string[][] => groups.map((x) => x.toolIds)
const all = (): boolean => true

describe('Favoriten-Kategorien', () => {
  it('Altbestand wird zur Gruppe „Favoriten", Dubletten/ungültige Breite bereinigt', () => {
    expect(normalizeGroups(undefined, ['a', 'b'])).toEqual([
      { id: 'favoriten', name: 'Favoriten', span: 12, toolIds: ['a', 'b'] }
    ])
    const n = normalizeGroups([g('x', ['a', 'a'], 7, '  '), g('y', ['a', 'b'])], ['a', 'b', 'c'])
    expect(n.map((x) => [x.name, x.span])).toEqual([
      ['Favoriten', 12],
      ['y', 12]
    ])
    // c war nur in der flachen Liste -> erste Kategorie
    expect(ids(n)).toEqual([['a', 'c'], ['b']])
    expect(normalizeGroups([], [])).toEqual([])
  })

  it('Stern: hinzufügen in die erste Kategorie (oder neue), entfernen überall', () => {
    const first = toggleTool([], 'a')
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ name: 'Favoriten', toolIds: ['a'] })
    const two = [g('x', ['a']), g('y', ['b'])]
    expect(ids(toggleTool(two, 'c'))).toEqual([['a', 'c'], ['b']])
    expect(ids(toggleTool(two, 'b'))).toEqual([['a'], []])
  })

  it('Kategorien anlegen, umbenennen, Breite, verschieben, ziehen', () => {
    const { groups, id } = addGroup([g('x', [])], 'Licht', 4)
    expect(groups[1]).toMatchObject({ id, name: 'Licht', span: 4 })
    expect(renameGroup(groups, id, '  Ton ')[1].name).toBe('Ton')
    expect(renameGroup(groups, id, '   ')).toBe(groups)
    expect(setSpan(groups, id, 6)[1].span).toBe(6)
    expect(setSpan(groups, id, 5)).toBe(groups)
    const three = [g('x', []), g('y', []), g('z', [])]
    expect(moveGroup(three, 'z', -1).map((x) => x.id)).toEqual(['x', 'z', 'y'])
    expect(moveGroup(three, 'x', -1)).toBe(three)
    expect(dropGroup(three, 'x', 'z', true).map((x) => x.id)).toEqual(['y', 'z', 'x'])
    expect(nextGroupName(three)).toBe('Kategorie 4')
  })

  it('Löschen: Werkzeuge bleiben Favoriten (Nachbar-Kategorie), letzte nur leer', () => {
    const groups = [g('x', ['a']), g('y', ['b', 'c'])]
    expect(ids(removeGroup(groups, 'y'))).toEqual([['a', 'b', 'c']])
    expect(ids(removeGroup(groups, 'x'))).toEqual([['b', 'c', 'a']])
    expect(removeGroup([g('x', ['a'])], 'x')).toHaveLength(1)
    expect(removeGroup([g('x', [])], 'x')).toEqual([])
  })

  it('Werkzeug ziehen: vor/hinter ein anderes, ans Ende, auch aus „Alle" (neuer Favorit)', () => {
    const groups = [g('x', ['a', 'b']), g('y', ['c'])]
    expect(ids(dropTool(groups, 'a', 'y', { toolId: 'c', after: false }))).toEqual([
      ['b'],
      ['a', 'c']
    ])
    expect(ids(dropTool(groups, 'b', 'x', { toolId: 'a', after: false }))).toEqual([
      ['b', 'a'],
      ['c']
    ])
    expect(ids(dropTool(groups, 'n', 'y'))).toEqual([
      ['a', 'b'],
      ['c', 'n']
    ])
    expect(flatten(dropTool(groups, 'a', 'x', { toolId: 'a', after: true }))).toEqual([
      'a',
      'b',
      'c'
    ])
  })

  it('Pfeile wandern über Kategoriegrenzen, unsichtbare IDs werden übersprungen', () => {
    const groups = [g('x', ['a', 'alt']), g('y', ['b'])]
    const exists = (id: string): boolean => id !== 'alt'
    expect(ids(moveToolBy(groups, 'a', 1, exists))).toEqual([['alt'], ['a', 'b']])
    expect(ids(moveToolBy(groups, 'b', -1, exists))).toEqual([['a', 'alt', 'b'], []])
    expect(canMoveTool(groups, 'a', -1, exists)).toBe(false)
    expect(canMoveTool(groups, 'b', 1, all)).toBe(false)
  })

  it('A–Z innerhalb einer Kategorie', () => {
    const names: Record<string, string> = { t: 'Timer', o: 'Öffnung', a: 'Audio' }
    expect(sortGroup([g('x', ['t', 'weg', 'o', 'a'])], 'x', (id) => names[id])[0].toolIds).toEqual([
      'a',
      'o',
      't',
      'weg'
    ])
  })
})
