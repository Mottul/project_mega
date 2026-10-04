import { describe, expect, it } from 'vitest'
import { mergeSettings } from './settingsMerge'
import { DEFAULT_SETTINGS, type AppSettings } from './types'

const base = (): AppSettings => structuredClone(DEFAULT_SETTINGS)

describe('Einstellungen zusammenführen', () => {
  it('ändert in Bereichen nur die übergebenen Felder', () => {
    const s = mergeSettings(base(), { player: { wallWidth: 3840 } })
    expect(s.player.wallWidth).toBe(3840)
    expect(s.player.wallHeight).toBe(DEFAULT_SETTINGS.player.wallHeight)
    expect(s.player.defaultFit).toBe(DEFAULT_SETTINGS.player.defaultFit)
    // zweite Teiländerung (anderes Fenster) überschreibt die erste nicht
    const t = mergeSettings(s, { player: { imageDurationSec: 5 } })
    expect(t.player).toMatchObject({ wallWidth: 3840, imageDurationSec: 5 })
  })

  it('führt verschachtelte Bereiche tief zusammen', () => {
    const s = mergeSettings(base(), { remoteControls: { osc: { enabled: true } } })
    expect(s.remoteControls.osc).toEqual({ enabled: true, port: 8091 })
    expect(s.remoteControls.jingle).toEqual(DEFAULT_SETTINGS.remoteControls.jingle)
  })

  it('ersetzt Listen und einfache Werte vollständig', () => {
    const groups = [{ id: 'a', name: 'A', span: 6, toolIds: ['timecode'] }]
    const s = mergeSettings(
      mergeSettings(base(), {
        favoriteGroups: [...groups, { id: 'b', name: 'B', span: 6, toolIds: [] }]
      }),
      { favoriteGroups: groups, kioskToolId: 'video-player' }
    )
    expect(s.favoriteGroups).toEqual(groups)
    expect(s.kioskToolId).toBe('video-player')
    expect(mergeSettings(s, { kioskToolId: null }).kioskToolId).toBeNull()
  })

  it('ignoriert undefined, falsche Typen und Prototyp-Schlüssel', () => {
    const before = base()
    const s = mergeSettings(before, {
      theme: undefined,
      player: null,
      osc: 'kaputt',
      favoriteToolIds: { 0: 'x' },
      ...JSON.parse('{"__proto__": {"polluted": true}}')
    })
    expect(s).toEqual(before)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(mergeSettings(before, 'kein Objekt')).toBe(before)
  })

  it('füllt beim Lesen fehlende Felder aus den Vorgaben auf', () => {
    const raw = { theme: 'light', player: { wallWidth: 1280 }, unbekannt: 1 }
    const s = mergeSettings(base(), raw)
    expect(s.theme).toBe('light')
    expect(s.player.wallWidth).toBe(1280)
    expect(s.player.remotePort).toBe(DEFAULT_SETTINGS.player.remotePort)
    expect((s as unknown as Record<string, unknown>).unbekannt).toBe(1)
  })

  it('lässt die Vorlage unverändert', () => {
    const before = base()
    const copy = structuredClone(before)
    mergeSettings(before, { player: { wallWidth: 1 }, remoteControls: { timer: { port: 1 } } })
    expect(before).toEqual(copy)
  })
})
