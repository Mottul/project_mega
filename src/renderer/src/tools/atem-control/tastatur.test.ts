import { describe, expect, it } from 'vitest'
import { tasteGiltFuerMischer, tasteZuAktion, type Taste } from './tastatur'

const taste = (code: string, p: Partial<Taste> = {}): Taste => ({
  code,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  ...p
})

describe('tasteZuAktion', () => {
  it('schaltet Vorschau und mit Umschalt Programm', () => {
    expect(tasteZuAktion(taste('Digit1'))).toEqual({ art: 'vorschau', index: 0 })
    expect(tasteZuAktion(taste('Digit9'))).toEqual({ art: 'vorschau', index: 8 })
    expect(tasteZuAktion(taste('Digit3', { shiftKey: true }))).toEqual({
      art: 'programm',
      index: 2
    })
    expect(tasteZuAktion(taste('Numpad2'))).toEqual({ art: 'vorschau', index: 1 })
  })

  it('kennt Cut und Auto', () => {
    expect(tasteZuAktion(taste('Space'))).toEqual({ art: 'cut' })
    expect(tasteZuAktion(taste('Enter'))).toEqual({ art: 'auto' })
  })

  it('wiederholt keine gehaltene Taste', () => {
    expect(tasteZuAktion(taste('Space', { repeat: true }))).toBeNull()
    expect(tasteZuAktion(taste('Digit1', { repeat: true }))).toBeNull()
  })

  it('lässt Tastenkürzel der App in Ruhe', () => {
    expect(tasteZuAktion(taste('Digit1', { ctrlKey: true }))).toBeNull()
    expect(tasteZuAktion(taste('Digit1', { altKey: true }))).toBeNull()
    expect(tasteZuAktion(taste('Enter', { metaKey: true }))).toBeNull()
    expect(tasteZuAktion(taste('Enter', { shiftKey: true }))).toBeNull()
    expect(tasteZuAktion(taste('KeyA'))).toBeNull()
    expect(tasteZuAktion(taste('Digit0'))).toBeNull()
  })
})

/** Kleiner Ersatz für ein DOM-Element: `closest` trifft, wenn der Selektor das Tag enthält */
function element(tag: string, drin = false): Element {
  return {
    closest: (selektor: string) => (selektor.includes(tag) ? ({} as Element) : null),
    drin
  } as unknown as Element
}

const flaeche = {
  contains: (e: Element) => (e as unknown as { drin: boolean }).drin
} as unknown as Element

describe('tasteGiltFuerMischer', () => {
  it('gilt ohne Fokus', () => {
    expect(tasteGiltFuerMischer(null, flaeche)).toBe(true)
    expect(tasteGiltFuerMischer(element('div'), flaeche)).toBe(true)
  })

  it('gilt nie in Textfeldern und Auswahllisten', () => {
    expect(tasteGiltFuerMischer(element('input', true), flaeche)).toBe(false)
    expect(tasteGiltFuerMischer(element('textarea', true), flaeche)).toBe(false)
    expect(tasteGiltFuerMischer(element('select', true), flaeche)).toBe(false)
  })

  it('unterscheidet Knöpfe in und außerhalb der Mischfläche', () => {
    expect(tasteGiltFuerMischer(element('button', true), flaeche)).toBe(true)
    expect(tasteGiltFuerMischer(element('button', false), flaeche)).toBe(false)
  })
})
