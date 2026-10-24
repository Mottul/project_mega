import { describe, expect, it } from 'vitest'
import { DEFAULT_FIRMENPROFIL } from '@shared/types'
import { fortschritt } from './fortschritt'
import { leeresGeraet, type Anleitung } from './model'
import { pruefung } from './pruefung'
import type { SeitenKontext } from './seiten'
import { neueAnleitung } from './vorlage'

const ctx: SeitenKontext = {
  stufe: 2,
  lern: false,
  firma: DEFAULT_FIRMENPROFIL,
  datum: '24.10.2026',
  modus: 'druck'
}
const stand = (a: Anleitung): Record<string, boolean> =>
  Object.fromEntries(
    fortschritt(a, pruefung(a, ctx, { ledWallNeuer: null })).map((m) => [m.id, m.erledigt])
  )

describe('Was fehlt noch', () => {
  it('eine neue Anleitung: Ein-/Ausschalten und Fälle stehen schon, der Rest ist offen', () => {
    expect(stand(neueAnleitung())).toEqual({
      projekt: false,
      ledwall: false,
      geraete: false,
      einAus: true,
      fehlersuche: true,
      kontakt: false,
      platzhalter: false,
      pruefung: true
    })
  })

  it('offene Punkte führen an ihre Stelle; ein leerer Platzhalter nennt sich selbst', () => {
    const m = fortschritt(neueAnleitung(), pruefung(neueAnleitung(), ctx, { ledWallNeuer: null }))
    expect(m.find((x) => x.id === 'kontakt')).toMatchObject({
      text: 'Kontakt wählen',
      ziel: 'kontakt'
    })
    expect(m.find((x) => x.id === 'platzhalter')?.text).toMatch(/Platzhalter \{.+\} ohne Wert/)
  })

  it('abgewählte Kapitel zählen nicht; Eingetragenes ist erledigt', () => {
    const a = neueAnleitung()
    a.deckblatt.projekt = 'Messe'
    a.geraete = [{ ...leeresGeraet(), name: 'Laptop' }]
    a.kapitel = a.kapitel.map((k) => (k.id === 'ledWall' ? { ...k, an: false } : k))
    const s = stand(a)
    expect('ledwall' in s).toBe(false)
    expect([s.projekt, s.geraete]).toEqual([true, true])
  })
})
