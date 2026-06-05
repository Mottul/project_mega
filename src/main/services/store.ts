import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_PLAYER_SETTINGS, DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

// Schlanker Settings-Store: eine JSON-Datei in userData. Bewusst ohne externe
// Abhaengigkeit (electron-store ist ESM-only und macht im CJS-main Aerger).

let cache: AppSettings | null = null

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  if (cache) return cache
  try {
    if (existsSync(settingsFile())) {
      const raw = JSON.parse(readFileSync(settingsFile(), 'utf-8')) as Partial<AppSettings>
      // player verschachtelt -> tief mergen, damit neue Felder nicht wegfallen
      cache = {
        ...DEFAULT_SETTINGS,
        ...raw,
        player: { ...DEFAULT_PLAYER_SETTINGS, ...(raw.player ?? {}) }
      }
    } else {
      cache = { ...DEFAULT_SETTINGS }
    }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  cache = next
  try {
    writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf-8')
  } catch {
    // nicht kritisch -- Settings bleiben zumindest im Cache
  }
  return next
}
