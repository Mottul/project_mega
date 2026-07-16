import { describe, expect, it } from 'vitest'
import { parse, serialize } from './io'
import type { PackItem } from './store'

const item = (over: Partial<PackItem> = {}): PackItem => ({
  id: 'x',
  category: 'A',
  name: 'Kabel',
  qty: 3,
  unit: 'Stk.',
  checked: false,
  note: '',
  ...over
})

describe('packing-list io', () => {
  it('serialisiert/liest verlustfrei zurück (bis auf neue IDs)', () => {
    const snap = {
      projectName: 'Show 1',
      categories: ['A', 'B'],
      items: [item(), item({ category: 'B', name: 'Case', qty: 1, note: 'oben' })]
    }
    const back = parse(serialize(snap))
    expect(back).not.toBeNull()
    expect(back!.projectName).toBe('Show 1')
    expect(back!.categories).toEqual(['A', 'B'])
    expect(back!.items.map((i) => [i.category, i.name, i.qty, i.note])).toEqual([
      ['A', 'Kabel', 3, ''],
      ['B', 'Case', 1, 'oben']
    ])
    // IDs werden beim Import neu vergeben
    expect(back!.items.every((i) => i.id && i.id !== 'x')).toBe(true)
  })

  it('ergänzt fehlende Felder und Kategorien tolerant', () => {
    const back = parse(JSON.stringify({ items: [{ name: 'Nur Name', category: 'Neu' }] }))
    expect(back).not.toBeNull()
    expect(back!.items[0]).toMatchObject({ name: 'Nur Name', qty: 1, unit: 'Stk.', checked: false })
    expect(back!.categories).toContain('Neu')
  })

  it('lehnt Unsinn ab', () => {
    expect(parse('kein json')).toBeNull()
    expect(parse('{}')).toBeNull() // kein items-Array
    expect(parse(JSON.stringify({ type: 'anderes', items: [] }))).toBeNull()
  })
})
