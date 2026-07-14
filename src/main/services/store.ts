import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_OSC_SETTINGS,
  DEFAULT_PLAYER_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_TICKER_STYLE,
  type AppSettings,
  type TickerStyle,
  type TrailerPreset
} from '@shared/types'

// Schlanker Settings-Store: eine JSON-Datei in userData. Bewusst ohne externe
// Abhaengigkeit (electron-store ist ESM-only und macht im CJS-main Aerger).

let cache: AppSettings | null = null

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** Trailer-Presets vervollständigen: fehlende tickerStyle-Blöcke (ältere
 *  settings.json) aus den früheren Flach-Feldern (tickerHeight, tickerColor, …)
 *  bzw. den Defaults auffüllen -- danach sehen ALLE Konsumenten volle Presets. */
function normalizeTrailerPresets(player: AppSettings['player'], rawPlayer: unknown): void {
  const legacy = (rawPlayer ?? {}) as Record<string, unknown>
  const legacyStyle: Partial<TickerStyle> = {}
  if (typeof legacy.tickerHeight === 'number') legacyStyle.heightPx = legacy.tickerHeight
  if (typeof legacy.tickerSpeed === 'number') legacyStyle.speed = legacy.tickerSpeed
  if (typeof legacy.tickerColor === 'string') legacyStyle.color = legacy.tickerColor
  if (typeof legacy.tickerBg === 'string') legacyStyle.bg = legacy.tickerBg
  if (typeof legacy.tickerLogoUrl === 'string' || legacy.tickerLogoUrl === null)
    legacyStyle.logoUrl = legacy.tickerLogoUrl as string | null
  if (legacy.tickerLogoMode === 'fixed' || legacy.tickerLogoMode === 'scroll')
    legacyStyle.logoMode = legacy.tickerLogoMode

  player.trailerPresets = (player.trailerPresets ?? []).map((p: Partial<TrailerPreset>) => ({
    name: p.name ?? 'Preset',
    width: p.width ?? 1152,
    height: p.height ?? 576,
    ticker: !!p.ticker,
    tickerStyle: { ...DEFAULT_TICKER_STYLE, ...legacyStyle, ...(p.tickerStyle ?? {}) }
  }))
  if (player.trailerPresets.length === 0)
    player.trailerPresets = DEFAULT_PLAYER_SETTINGS.trailerPresets.map((p) => ({
      ...p,
      tickerStyle: { ...p.tickerStyle }
    }))
  if (!Array.isArray(player.tickerStyles)) player.tickerStyles = []
}

export function getSettings(): AppSettings {
  if (cache) return cache
  try {
    if (existsSync(settingsFile())) {
      const raw = JSON.parse(readFileSync(settingsFile(), 'utf-8')) as Partial<AppSettings>
      // verschachtelte Bereiche -> tief mergen, damit neue Felder nicht wegfallen
      cache = {
        ...DEFAULT_SETTINGS,
        ...raw,
        player: { ...DEFAULT_PLAYER_SETTINGS, ...(raw.player ?? {}) },
        osc: { ...DEFAULT_OSC_SETTINGS, ...(raw.osc ?? {}) }
      }
      normalizeTrailerPresets(cache.player, raw.player)
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
