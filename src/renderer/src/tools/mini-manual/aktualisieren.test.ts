import { describe, expect, it } from 'vitest'
import { DEFAULT_FIRMENPROFIL, type EigenerBaustein } from '@shared/types'
import { aktualisiere, neuereFassungen, quellen } from './aktualisieren'
import { bausteinById, fallById } from './bibliothek'
import type { Anleitung, Block } from './model'
import { pruefung } from './pruefung'
import type { SeitenKontext } from './seiten'
import { neueAnleitung } from './vorlage'

/** Anleitung wie vor dem 22.10.2026: „Die ganze Wand ist dunkel“ in Version 1, ohne Glasfaser-Antwort */
function alteAnleitung(): Anleitung {
  const a = neueAnleitung()
  a.fehlerfaelle = a.fehlerfaelle.map((f) =>
    f.id === 'lib-wand-dunkel'
      ? {
          ...f,
          titel: 'Wand dunkel (alte Fassung)',
          herkunft: { baustein: f.id, version: 1 },
          schritte: f.schritte.map((s) => ({ ...s, antwortAus: null }))
        }
      : f
  )
  return a
}

describe('Bausteine aktualisieren', () => {
  it('eine frische Anleitung ist aktuell', () => {
    expect(neuereFassungen(neueAnleitung(), quellen())).toEqual([])
  })

  it('Fall der Bibliothek in neuerer Fassung: erkannt, ersetzt unter derselben Kennung', () => {
    const a = alteAnleitung()
    const n = neuereFassungen(a, quellen())
    expect(n).toEqual([
      {
        art: 'fall',
        baustein: 'lib-wand-dunkel',
        titel: 'Die ganze Wand ist dunkel',
        von: 1,
        auf: 2,
        eigen: false,
        fallId: 'lib-wand-dunkel'
      }
    ])
    const neu = aktualisiere(a, n[0], quellen())
    const f = neu.fehlerfaelle.find((x) => x.id === 'lib-wand-dunkel')!
    expect(f.titel).toBe('Die ganze Wand ist dunkel')
    expect(f.herkunft).toEqual({ baustein: 'lib-wand-dunkel', version: 2 })
    expect(f.schritte.find((s) => s.id === 'w9')?.antwortAus).toBe('glasfaser')
    // Reihenfolge der Fälle bleibt, nichts doppelt
    expect(neu.fehlerfaelle.map((x) => x.id)).toEqual(a.fehlerfaelle.map((x) => x.id))
    expect(neuereFassungen(neu, quellen())).toEqual([])
  })

  it('die Prüfung vor dem Export nennt neuere Fassungen der Bibliothek', () => {
    const ctx: SeitenKontext = {
      stufe: 2,
      lern: false,
      firma: DEFAULT_FIRMENPROFIL,
      datum: '22.10.2026',
      modus: 'druck'
    }
    const text = '„Die ganze Wand ist dunkel“: neuere Fassung in der Bibliothek (Version 1 → 2).'
    expect(pruefung(alteAnleitung(), ctx, { ledWallNeuer: null })).toContainEqual({
      schwere: 'info',
      text,
      kapitel: 'fehlersuche'
    })
    expect(pruefung(neueAnleitung(), ctx, { ledWallNeuer: null }).map((p) => p.text)).not.toContain(
      text
    )
  })

  it('Blöcke eines Bausteins: jede Gruppe an ihrer Stelle, eigene Blöcke bleiben', () => {
    const lib = bausteinById('lib-ein-aus')!
    const a = neueAnleitung()
    const eigen: Block = { id: 'mein', typ: 'text', stufe: 1, text: 'eigener Text' }
    a.kapitel = a.kapitel.map((k) =>
      k.id === 'einAus'
        ? {
            ...k,
            bloecke: [
              eigen,
              ...k.bloecke.map((b) =>
                'herkunft' in b && b.herkunft
                  ? { ...b, herkunft: { ...b.herkunft, version: 0 } }
                  : b
              )
            ]
          }
        : k
    )
    const n = neuereFassungen(a, quellen())
    expect(n.map((x) => [x.art, x.baustein, x.von, x.auf, x.kapitel])).toEqual([
      ['bloecke', 'lib-ein-aus', 0, lib.version, 'einAus']
    ])
    const neu = aktualisiere(a, n[0], quellen())
    const bl = neu.kapitel.find((k) => k.id === 'einAus')!.bloecke
    expect(bl[0]).toEqual(eigen)
    expect(bl.length).toBe(1 + lib.bloecke.length)
    expect(bl.slice(1).every((b) => 'herkunft' in b && b.herkunft?.version === lib.version)).toBe(
      true
    )
  })

  it('eigene Bausteine: neuere Version aus der Ablage (z. B. vom Kollegen importiert)', () => {
    const fall = structuredClone(fallById('lib-kein-signal')!)
    const e: EigenerBaustein = {
      id: 'eigen1',
      art: 'fall',
      titel: 'Mein Fall',
      kapitel: 'fehlersuche',
      daten: { ...fall, titel: 'Mein Fall v3' },
      geaendertAm: '',
      geaendertVon: '',
      version: 3
    }
    const a = neueAnleitung()
    a.fehlerfaelle.push({
      ...fall,
      id: 'x1',
      titel: 'Mein Fall v2',
      herkunft: { baustein: 'eigen1', version: 2 }
    })
    const q = quellen([e])
    const n = neuereFassungen(a, q)
    expect(n).toEqual([
      {
        art: 'fall',
        baustein: 'eigen1',
        titel: 'Mein Fall',
        von: 2,
        auf: 3,
        eigen: true,
        fallId: 'x1'
      }
    ])
    const f = aktualisiere(a, n[0], q).fehlerfaelle.find((x) => x.id === 'x1')!
    expect([f.titel, f.herkunft?.version]).toEqual(['Mein Fall v3', 3])
  })
})
