import { describe, expect, it } from 'vitest'
import type { MediaItem } from '@shared/types'
import { danach, gesamtdauer, PLAYER_RASTER, zeilenSchluessel } from './layout'

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
})
