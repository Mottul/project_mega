// settings.json: Teiländerungen zusammenführen, atomar schreiben, Änderungen melden.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'

let dir = ''
vi.mock('electron', () => ({ app: { getPath: () => dir, isPackaged: false } }))
vi.mock('./log', () => ({ logLine: () => {} }))

type Store = typeof import('./store')
/** Frisches Modul je Test (der Store merkt sich die Einstellungen im Speicher). */
async function load(): Promise<Store> {
  vi.resetModules()
  return import('./store')
}
const file = (): string => join(dir, 'settings.json')
const onDisk = (): Record<string, unknown> => JSON.parse(readFileSync(file(), 'utf-8'))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mottulbox-settings-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('settings.json', () => {
  it('führt Teiländerungen zweier Fenster zusammen, statt Bereiche zu ersetzen', async () => {
    const store = await load()
    // Fenster A ändert die Wand, Fenster B (Handy) gleichzeitig die Bild-Standzeit
    store.setSettings({ player: { wallWidth: 3840, wallHeight: 2160 } })
    store.setSettings({ player: { imageDurationSec: 7 } })
    const s = store.getSettings()
    expect(s.player).toMatchObject({ wallWidth: 3840, wallHeight: 2160, imageDurationSec: 7 })
    expect(s.player.defaultFit).toBe(DEFAULT_SETTINGS.player.defaultFit)
    expect(onDisk().player).toEqual(s.player)
  })

  it('schreibt atomar und hinterlässt keine Zwischendatei', async () => {
    const store = await load()
    store.setSettings({ theme: 'light' })
    store.setSettings({ accent: 'blue' })
    expect(readdirSync(dir)).toEqual(['settings.json'])
    expect(onDisk()).toMatchObject({ theme: 'light', accent: 'blue' })
  })

  it('meldet Änderungen samt auslösendem Fenster', async () => {
    const store = await load()
    const seen: Array<[string, number | null]> = []
    const off = store.onSettingsChange((s, origin) => seen.push([s.theme, origin]))
    store.setSettings({ theme: 'light' }, 7)
    store.setSettings({ theme: 'dark' })
    off()
    store.setSettings({ theme: 'system' })
    expect(seen).toEqual([
      ['light', 7],
      ['dark', null]
    ])
  })

  it('füllt beim Lesen fehlende Felder aus den Vorgaben auf', async () => {
    writeFileSync(
      file(),
      JSON.stringify({
        theme: 'light',
        player: { wallWidth: 1280 },
        remoteControls: { osc: { enabled: true } }
      })
    )
    const s = (await load()).getSettings()
    expect(s.theme).toBe('light')
    expect(s.player.wallWidth).toBe(1280)
    expect(s.player.savedPlaylists).toEqual([])
    expect(s.remoteControls.osc).toEqual({ enabled: true, port: 8091 })
    expect(s.remoteControls.timer).toEqual(DEFAULT_SETTINGS.remoteControls.timer)
  })

  it('sichert eine kaputte Datei, statt sie still zu überschreiben', async () => {
    writeFileSync(file(), '{ kaputt')
    const store = await load()
    expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)
    expect(readdirSync(dir).some((f) => f.startsWith('settings.json.corrupt-'))).toBe(true)
    expect(existsSync(file())).toBe(false)
  })
})
