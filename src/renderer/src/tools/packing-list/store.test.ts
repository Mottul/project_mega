import { beforeEach, describe, expect, it } from 'vitest'
import { usePacking, type PackItem } from './store'

const mk = (id: string, category: string, name: string): PackItem => ({
  id,
  category,
  name,
  qty: 1,
  unit: 'Stk.',
  checked: false,
  note: ''
})

const namesIn = (cat: string): string[] =>
  usePacking
    .getState()
    .items.filter((i) => i.category === cat)
    .map((i) => i.name)

beforeEach(() => {
  usePacking.setState({ categories: ['A', 'B', 'C'], items: [] })
})

describe('usePacking – moveCategory', () => {
  it('verschiebt vor und zurück, respektiert die Ränder', () => {
    usePacking.getState().moveCategory('B', -1)
    expect(usePacking.getState().categories).toEqual(['B', 'A', 'C'])
    usePacking.getState().moveCategory('B', -1) // schon vorne -> no-op
    expect(usePacking.getState().categories).toEqual(['B', 'A', 'C'])
    usePacking.getState().moveCategory('C', 1) // schon hinten -> no-op
    expect(usePacking.getState().categories).toEqual(['B', 'A', 'C'])
  })
})

describe('usePacking – moveItem', () => {
  it('tauscht nur mit dem Nachbarn derselben Kategorie (auch bei Verschachtelung)', () => {
    // Global verschachtelt: A1, B1, A2, A3 (Kategorie A + ein B dazwischen).
    usePacking.setState({
      categories: ['A', 'B'],
      items: [mk('a1', 'A', 'A1'), mk('b1', 'B', 'B1'), mk('a2', 'A', 'A2'), mk('a3', 'A', 'A3')]
    })
    // A2 nach oben -> in Kategorie A: [A2, A1, A3]
    usePacking.getState().moveItem('a2', -1)
    expect(namesIn('A')).toEqual(['A2', 'A1', 'A3'])
    // Kategorie B bleibt unberührt
    expect(namesIn('B')).toEqual(['B1'])
  })

  it('ignoriert Bewegung über die Ränder der Kategorie hinaus', () => {
    usePacking.setState({
      categories: ['A'],
      items: [mk('a1', 'A', 'A1'), mk('a2', 'A', 'A2')]
    })
    usePacking.getState().moveItem('a1', -1) // schon oben
    usePacking.getState().moveItem('a2', 1) // schon unten
    expect(namesIn('A')).toEqual(['A1', 'A2'])
  })
})
