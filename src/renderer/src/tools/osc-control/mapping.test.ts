import { describe, expect, it } from 'vitest'
import { formatMeterNumber, labelForValue } from './mapping'
import type { OscItem } from './store'

const mk = (value: number, label: string): OscItem => ({ label, address: '', value })

describe('formatMeterNumber', () => {
  it('zeigt Ganzzahlen ohne Nachkomma', () => {
    expect(formatMeterNumber(3)).toBe('3')
    expect(formatMeterNumber(0)).toBe('0')
  })
  it('zeigt Dezimalzahlen mit zwei Stellen', () => {
    expect(formatMeterNumber(0.5)).toBe('0.50')
    expect(formatMeterNumber(0.333)).toBe('0.33')
  })
  it('fängt ungültige Werte ab', () => {
    expect(formatMeterNumber(NaN)).toBe('–')
  })
})

describe('labelForValue', () => {
  it('gibt den Rohwert zurück, wenn keine Zuordnung existiert', () => {
    expect(labelForValue(0.5, [])).toBe('0.50')
    expect(labelForValue(3, [])).toBe('3')
  })

  it('trifft exakte Werte', () => {
    const items = [mk(0, 'Add'), mk(0.5, 'Multiply'), mk(1, 'Screen')]
    expect(labelForValue(0, items)).toBe('Add')
    expect(labelForValue(0.5, items)).toBe('Multiply')
    expect(labelForValue(1, items)).toBe('Screen')
  })

  it('snappt Float-Ungenauigkeit auf die nächste Zuordnung', () => {
    const items = [mk(0, 'Add'), mk(0.333, 'Multiply'), mk(0.667, 'Screen'), mk(1, 'Overlay')]
    expect(labelForValue(0.33334, items)).toBe('Multiply')
    expect(labelForValue(0.6669, items)).toBe('Screen')
  })

  it('behandelt Ganzzahl-Indizes (Toleranz 0.5)', () => {
    const items = [mk(0, 'Add'), mk(1, 'Multiply'), mk(2, 'Screen')]
    expect(labelForValue(2, items)).toBe('Screen')
    expect(labelForValue(0.99, items)).toBe('Multiply')
  })

  it('zeigt den Rohwert, wenn der Wert weit außerhalb liegt', () => {
    const items = [mk(0, 'Add'), mk(0.2, 'Multiply')] // minGap 0.2 -> Toleranz 0.1
    expect(labelForValue(0.9, items)).toBe('0.90')
  })

  it('ignoriert Einträge ohne Text als Ziel', () => {
    const items = [mk(0, ''), mk(1, 'Screen')]
    expect(labelForValue(1, items)).toBe('Screen')
    expect(labelForValue(0, items)).toBe('0') // 0 hat kein Label, „Screen" ist zu weit
  })
})
