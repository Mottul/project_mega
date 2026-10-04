import { app } from 'electron'
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { join } from 'node:path'
import { mergeSettings } from '@shared/settingsMerge'
import { DEFAULT_SETTINGS, type AppSettings, type SettingsPatch } from '@shared/types'
import { logLine } from './log'

// Schlanker Settings-Store: eine JSON-Datei in userData. Bewusst ohne externe
// Abhaengigkeit (electron-store ist ESM-only und macht im CJS-main Aerger).
// Aenderungen werden feldweise zusammengefuehrt (settingsMerge.ts) und die Datei
// atomar ersetzt -- ein Absturz mitten im Schreiben kostet nie alle Einstellungen.

let cache: AppSettings | null = null

/** origin = webContents-ID des auslösenden Fensters (null = main/Handy). */
type ChangeListener = (settings: AppSettings, origin: number | null) => void
const listeners = new Set<ChangeListener>()

/** Benachrichtigung nach jeder Änderung (z. B. an die übrigen Fenster weiterreichen). */
export function onSettingsChange(fn: ChangeListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  if (cache) return cache
  try {
    if (existsSync(settingsFile())) {
      const raw: unknown = JSON.parse(readFileSync(settingsFile(), 'utf-8'))
      // tief mit den Vorgaben zusammenfuehren: neue Felder (auch in player/osc/…)
      // bekommen ihren Standard, Bereiche mit falschem Typ fallen auf ihn zurueck
      cache = mergeSettings(DEFAULT_SETTINGS, raw)
    } else {
      cache = { ...DEFAULT_SETTINGS }
    }
  } catch (err) {
    // Defekte Datei NICHT kommentarlos beim nächsten Write überschreiben ->
    // wegsichern (recoverbar) und mit Standardwerten weitermachen.
    try {
      const f = settingsFile()
      if (existsSync(f)) renameSync(f, `${f}.corrupt-${Date.now()}`)
      logLine(
        '[settings] settings.json defekt – gesichert, nutze Standardwerte:',
        err instanceof Error ? err.message : String(err)
      )
    } catch (e2) {
      logLine('[settings] Sichern der defekten settings.json fehlgeschlagen:', e2)
    }
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

/**
 * Atomar schreiben: erst vollstaendig (und auf den Datentraeger) in eine Nachbardatei,
 * dann umbenennen. Bricht der Strom mitten im Schreiben weg, bleibt die alte Datei heil.
 */
function writeFileAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, text, null, 'utf-8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    renameSync(tmp, file)
  } catch (err) {
    // Windows: Virenscanner/Indexer halten die Datei kurz -> dann eben direkt schreiben
    logLine('[settings] Umbenennen fehlgeschlagen, schreibe direkt:', String(err))
    writeFileSync(file, text, 'utf-8')
    rmSync(tmp, { force: true })
  }
}

/**
 * Teiländerung übernehmen: nur die übergebenen Felder – auch innerhalb von player/osc/… –,
 * Listen werden ganz ersetzt. Kein Lesen-Ändern-Schreiben mehr nötig (das konnte parallele
 * Änderungen anderer Fenster oder des Handys überschreiben).
 */
export function setSettings(patch: SettingsPatch, origin: number | null = null): AppSettings {
  const next = mergeSettings(getSettings(), patch)
  cache = next
  try {
    writeFileAtomic(settingsFile(), JSON.stringify(next, null, 2))
  } catch (err) {
    // nicht kritisch -- Settings bleiben zumindest im Cache
    logLine(
      '[settings] Speichern fehlgeschlagen:',
      err instanceof Error ? err.message : String(err)
    )
  }
  for (const fn of listeners) fn(next, origin)
  return next
}
