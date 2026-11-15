import { describe, expect, it } from 'vitest'
import type { MediaItem } from '@shared/types'
import {
  danach,
  danachIndex,
  gesamtdauer,
  sucheMedien,
  PLAYER_RASTER,
  zeilenSchluessel,
  zielPlatz
} from './layout'

const medium = (id: string, durationSec: number | null): MediaItem => ({
  id,
  kind: durationSec === null ? 'image' : 'video',
  title: id,
  originalName: `${id}.mp4`,
  url: `media://library/${id}.mp4`,
  thumbUrl: null,
  width: 1920,
  height: 1080,
  durationSec,
  fitMode: 'bars',
  hasAudio: false,
  sizeBytes: 1,
  sourcePath: null,
  addedAt: 0
})

describe('gesamtdauer', () => {
  it('Videos mit ihrer Länge, Bilder mit der Standzeit', () => {
    expect(gesamtdauer([medium('a', 12.5), medium('b', null), medium('c', 30)], 10)).toBe(52.5)
  })

  it('leere Playlist dauert nichts', () => {
    expect(gesamtdauer([], 10)).toBe(0)
  })

  it('dasselbe Medium zweimal zählt zweimal', () => {
    const a = medium('a', 5)
    expect(gesamtdauer([a, a], 10)).toBe(10)
  })
})

describe('zeilenSchluessel', () => {
  it('zählt je Medium, nicht je Platz', () => {
    expect(
      zeilenSchluessel([{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'c' }, { id: 'a' }])
    ).toEqual(['a#1', 'b#1', 'a#2', 'c#1', 'a#3'])
  })

  it('bleibt beim Umsortieren an seiner Zeile', () => {
    // b wandert nach vorn: b behält seinen Schlüssel, die beiden a ihre Reihenfolge
    expect(zeilenSchluessel([{ id: 'b' }, { id: 'a' }, { id: 'a' }])).toEqual(['b#1', 'a#1', 'a#2'])
  })

  it('jeder Schlüssel nur einmal', () => {
    const k = zeilenSchluessel(['x', 'y', 'x', 'x', 'y'].map((id) => ({ id })))
    expect(new Set(k).size).toBe(k.length)
  })
})

describe('zielPlatz', () => {
  /** So setzt der main `move` um (playerState.ts): herausnehmen, an `to` einsetzen */
  const zieh = (liste: string, von: number, ziel: number, hinter: boolean): string => {
    const to = zielPlatz(von, ziel, hinter)
    if (to < 0 || to === von) return liste
    const l = [...liste]
    const [x] = l.splice(von, 1)
    l.splice(to, 0, x)
    return l.join('')
  }

  it('vor bzw. hinter eine spätere Zeile', () => {
    expect(zieh('abcd', 0, 2, false)).toBe('bacd')
    expect(zieh('abcd', 0, 2, true)).toBe('bcad')
    expect(zieh('abcd', 2, 3, true)).toBe('abdc')
  })

  it('vor bzw. hinter eine frühere Zeile', () => {
    expect(zieh('abcd', 3, 0, false)).toBe('dabc')
    expect(zieh('abcd', 3, 0, true)).toBe('adbc')
  })

  it('an den Platz, an dem sie schon steht: kein Befehl', () => {
    expect(zielPlatz(1, 2, false)).toBe(1) // b vor c – steht schon da
    expect(zielPlatz(1, 0, true)).toBe(1) // b hinter a
    expect(zielPlatz(1, 1, false)).toBe(1) // auf sich selbst
  })

  it('unbekannte Zeile: −1', () => {
    expect(zielPlatz(-1, 2, false)).toBe(-1)
    expect(zielPlatz(0, -1, true)).toBe(-1)
  })
})

describe('PLAYER_RASTER', () => {
  it('jede Stufe kennt alle drei Felder, jedes Feld genau einmal je Zeile', () => {
    for (const [stufe, r] of Object.entries(PLAYER_RASTER)) {
      const namen = new Set(r.areas.flat())
      expect([...namen].sort(), stufe).toEqual(['bibliothek', 'buehne', 'playlist'])
    }
  })

  it('schmal: Bühne vor Playlist vor Bibliothek', () => {
    expect(PLAYER_RASTER.schmal.areas.flat()).toEqual(['buehne', 'playlist', 'bibliothek'])
  })

  it('so viele Spalten und Zeilen, wie das Raster angibt', () => {
    for (const r of Object.values(PLAYER_RASTER)) {
      const spalten = r.areas[0].length
      expect(r.areas.every((z) => z.length === spalten)).toBe(true)
      expect(r.rows.trim().split(/\s+(?![^(]*\))/).length).toBe(r.areas.length)
    }
  })
})

describe('danach', () => {
  const liste = ['a', 'b', 'c'].map((id) => medium(id, 5))
  const stand = (
    index: number,
    weiter: Partial<{ loop: 'all' | 'one' | 'none'; shuffle: boolean; shuffleNext: number }> = {}
  ) => ({
    playlist: liste,
    index,
    loop: 'all' as const,
    shuffle: false,
    shuffleNext: -1,
    ...weiter
  })

  it('nennt den nächsten Eintrag', () => {
    expect(danach(stand(0))).toBe('b')
  })

  it('Loop „Eines“: derselbe Titel', () => {
    expect(danach(stand(1, { loop: 'one' }))).toBe('b')
  })

  it('am Ende: mit Loop „Alle“ wieder der erste, ohne Loop „Ende“', () => {
    expect(danach(stand(2))).toBe('a')
    expect(danach(stand(2, { loop: 'none' }))).toBe('Ende')
  })

  it('Zufall: der vorab gewürfelte Eintrag', () => {
    expect(danach(stand(0, { shuffle: true, shuffleNext: 2 }))).toBe('c')
  })

  it('nichts, solange nichts läuft', () => {
    expect(danach(stand(-1))).toBeNull()
    expect(danach({ ...stand(0), playlist: [] })).toBeNull()
  })

  it('die Marke in der Playlist steht am selben Eintrag, den die Bühne nennt', () => {
    expect(danachIndex(stand(0))).toBe(1)
    expect(danachIndex(stand(1, { loop: 'one' }))).toBe(1)
    expect(danachIndex(stand(2))).toBe(0)
    expect(danachIndex(stand(0, { shuffle: true, shuffleNext: 2 }))).toBe(2)
  })

  it('keine Marke am Ende ohne Loop und solange nichts läuft', () => {
    expect(danachIndex(stand(2, { loop: 'none' }))).toBe(-1)
    expect(danachIndex(stand(-1, { loop: 'none' }))).toBe(-1)
    expect(danachIndex({ ...stand(0), playlist: [] })).toBe(-1)
  })
})

describe('sucheMedien', () => {
  const titel = (...namen: string[]): { title: string }[] => namen.map((title) => ({ title }))
  const bib = titel('Sponsor Bank', 'Sponsor Auto', 'Keynote Vorspann', 'Übergang Blau')
  const gefunden = (suche: string): string[] => sucheMedien(bib, suche).map((m) => m.title)

  it('ohne Suchwort alle, auch nur mit Leerzeichen', () => {
    expect(sucheMedien(bib, '')).toBe(bib)
    expect(sucheMedien(bib, '   ')).toBe(bib)
  })

  it('ein Teil des Titels, Groß- und Kleinschreibung egal (auch Umlaute)', () => {
    expect(gefunden('sponsor')).toEqual(['Sponsor Bank', 'Sponsor Auto'])
    expect(gefunden('VORSP')).toEqual(['Keynote Vorspann'])
    expect(gefunden('übergang')).toEqual(['Übergang Blau'])
  })

  it('jedes Wort muss vorkommen, die Reihenfolge ist egal', () => {
    expect(gefunden('auto sponsor')).toEqual(['Sponsor Auto'])
    expect(gefunden(' Sponsor  Bank ')).toEqual(['Sponsor Bank'])
    expect(gefunden('sponsor keynote')).toEqual([])
  })

  it('ohne Treffer eine leere Liste', () => {
    expect(gefunden('Gibt es nicht')).toEqual([])
  })
})
