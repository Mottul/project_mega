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
  usePacking.setState({ projectName: '', categories: ['A', 'B', 'C'], items: [], saved: [] })
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

describe('usePacking – gespeicherte Jobs', () => {
  it('speichert, lädt und löscht Jobs; gleicher Name überschreibt', () => {
    usePacking.setState({
      projectName: 'Konzert',
      categories: ['A'],
      items: [mk('a1', 'A', 'Kabel')]
    })
    usePacking.getState().saveJob('Konzert')
    expect(usePacking.getState().saved).toHaveLength(1)
    const jobId = usePacking.getState().saved[0].id

    // Aktuelle Liste ändern, dann Job erneut speichern -> überschreibt (kein Duplikat)
    usePacking.setState({ items: [mk('a1', 'A', 'Kabel'), mk('a2', 'A', 'Case')] })
    usePacking.getState().saveJob('Konzert')
    expect(usePacking.getState().saved).toHaveLength(1)
    expect(usePacking.getState().saved[0].id).toBe(jobId) // gleiche ID behalten

    // Liste leeren, dann Job laden -> stellt 2 Positionen wieder her
    usePacking.setState({ items: [] })
    usePacking.getState().loadJob(jobId)
    expect(namesIn('A')).toEqual(['Kabel', 'Case'])
    expect(usePacking.getState().projectName).toBe('Konzert')

    // Geladene Positionen sind Kopien (keine geteilten Referenzen mit dem Job)
    usePacking.getState().updateItem(usePacking.getState().items[0].id, { name: 'X' })
    expect(usePacking.getState().saved[0].items[0].name).toBe('Kabel')

    usePacking.getState().deleteJob(jobId)
    expect(usePacking.getState().saved).toHaveLength(0)
  })
})

describe('usePacking – Farben der Blöcke', () => {
  beforeEach(() => usePacking.setState({ colors: {} }))

  it('setzen, beim Umbenennen mitnehmen, beim Löschen entfernen; ungültig = keine', () => {
    const s = (): ReturnType<typeof usePacking.getState> => usePacking.getState()
    s().setColor('A', '#22C55E')
    expect(s().colors).toEqual({ A: '#22c55e' })
    s().renameCategory('A', 'Ton')
    expect(s().colors).toEqual({ Ton: '#22c55e' })
    s().setColor('B', 'rot')
    expect(s().colors.B).toBeUndefined()
    s().removeCategory('Ton')
    expect(s().colors).toEqual({})
  })

  it('mehrere LED-Wände bekommen beim Übernehmen je eine eigene Farbe, eine einzelne keine', () => {
    usePacking.getState().mergeItems([
      { category: 'LED-Wall · Bühne', name: 'Modul', qty: 4, unit: 'Stk.', note: '' },
      { category: 'LED-Wall · Bar', name: 'Modul', qty: 2, unit: 'Stk.', note: '' },
      { category: 'LED-Wall', name: 'Modul', qty: 1, unit: 'Stk.', note: '' }
    ])
    const c = usePacking.getState().colors
    expect(c['LED-Wall · Bühne']).toMatch(/^#[0-9a-f]{6}$/)
    expect(c['LED-Wall · Bar']).toMatch(/^#[0-9a-f]{6}$/)
    expect(c['LED-Wall · Bühne']).not.toBe(c['LED-Wall · Bar'])
    expect(c['LED-Wall']).toBeUndefined()
    // eine schon gewählte Farbe bleibt beim nächsten Übernehmen
    usePacking.getState().setColor('LED-Wall · Bar', '#000000')
    usePacking
      .getState()
      .mergeItems([{ category: 'LED-Wall · Bar', name: 'Modul', qty: 3, unit: 'Stk.', note: '' }])
    expect(usePacking.getState().colors['LED-Wall · Bar']).toBe('#000000')
  })

  it('Jobs nehmen die Farben mit', () => {
    usePacking.setState({
      categories: ['A'],
      items: [mk('a1', 'A', 'Kabel')],
      colors: { A: '#3b82f6' }
    })
    usePacking.getState().saveJob('Mit Farbe')
    usePacking.setState({ colors: {} })
    usePacking
      .getState()
      .loadJob(usePacking.getState().saved.find((j) => j.name === 'Mit Farbe')!.id)
    expect(usePacking.getState().colors).toEqual({ A: '#3b82f6' })
  })
})
