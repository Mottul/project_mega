import { describe, expect, it } from 'vitest'
import { ausgabeZiel, doppelEsc } from './ausgabe'

describe('Ausgabefenster', () => {
  it('Ziel: Monitor-Id oder „fenster“, sonst nichts', () => {
    expect(ausgabeZiel(2779098405)).toBe(2779098405)
    expect(ausgabeZiel('fenster')).toBe('fenster')
    for (const v of [1.5, NaN, Infinity, '1', 'Fenster', null, undefined, {}]) {
      expect(ausgabeZiel(v)).toBeNull()
    }
  })

  it('erst das zweite Esc innerhalb einer Sekunde schließt, danach zählt es von vorn', () => {
    const esc = doppelEsc(1000)
    expect(esc(0)).toBe(false)
    expect(esc(400)).toBe(true)
    // der nächste Druck beginnt neu
    expect(esc(600)).toBe(false)
    // zu spät: zählt als neuer erster Druck
    expect(esc(1700)).toBe(false)
    expect(esc(2700)).toBe(true)
  })
})
