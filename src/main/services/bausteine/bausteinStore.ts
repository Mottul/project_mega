// Eigene Bausteine des Mini-Manuals: eine JSON-Datei je Baustein unter userData/Bausteine. Eine
// Datei je Baustein, damit ein geteilter Ordner (Phase 5, NAS/Nextcloud) keine Sync-Konflikte
// zwischen Kollegen erzeugt. Namen kommen nie vom Renderer: Die Datei heißt nach der geprüften
// Kennung. Lesen tolerant (kaputte Dateien übersprungen), Inhalt prüft das Werkzeug.

import { app, type BrowserWindow } from 'electron'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { basename, join } from 'node:path'
import {
  BAUSTEIN_DATEI,
  BAUSTEIN_GRENZEN,
  importZusammenfuehren,
  isBausteinId,
  packBausteine,
  sanitizeEigenerBaustein,
  unpackBausteine
} from '@shared/bausteine'
import type { BausteinExport, BausteinImport, EigenerBaustein } from '@shared/types'
import { showOpenDialog, showSaveDialog } from '../fileDialogs'
import { writeFileAtomicAsync } from '../fsAtomic'
import { logLine } from '../log'

async function dir(): Promise<string> {
  const d = join(app.getPath('userData'), 'Bausteine')
  await mkdir(d, { recursive: true })
  return d
}

function bearbeiter(): string {
  try {
    return userInfo().username.slice(0, 100)
  } catch {
    return ''
  }
}

async function lies(path: string): Promise<EigenerBaustein | null> {
  try {
    if ((await stat(path)).size > BAUSTEIN_GRENZEN.bytes) return null
    return sanitizeEigenerBaustein(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    return null
  }
}

export async function listBausteine(): Promise<EigenerBaustein[]> {
  const d = await dir()
  const names = (await readdir(d))
    .filter((n) => n.endsWith('.json') && isBausteinId(n.slice(0, -5)))
    .slice(0, BAUSTEIN_GRENZEN.anzahl)
  const out: EigenerBaustein[] = []
  for (const n of names) {
    const b = await lies(join(d, n))
    // Kennung muss zum Dateinamen passen – sonst zeigte „Löschen“ auf eine andere Datei
    if (b && `${b.id}.json` === n) out.push(b)
  }
  return out.sort((a, b) => a.titel.localeCompare(b.titel, 'de'))
}

export async function saveBaustein(raw: unknown): Promise<EigenerBaustein | null> {
  const b = sanitizeEigenerBaustein({ ...(raw && typeof raw === 'object' ? raw : {}), version: 1 })
  if (!b) {
    logLine('[bausteine] Speichern abgewiesen')
    return null
  }
  const path = join(await dir(), `${b.id}.json`)
  const vorher = await lies(path)
  const out: EigenerBaustein = {
    ...b,
    geaendertAm: new Date().toISOString(),
    geaendertVon: bearbeiter(),
    version: (vorher?.version ?? 0) + 1
  }
  const json = JSON.stringify(out)
  if (Buffer.byteLength(json, 'utf8') > BAUSTEIN_GRENZEN.bytes) {
    logLine('[bausteine] zu groß:', b.id)
    return null
  }
  await writeFileAtomicAsync(path, Buffer.from(json, 'utf8'))
  logLine('[bausteine] gespeichert', b.id, `Version ${out.version}`)
  return out
}

export async function removeBaustein(id: unknown): Promise<boolean> {
  if (!isBausteinId(id)) return false
  await rm(join(await dir(), `${id}.json`), { force: true })
  return true
}

/** Baustein so schreiben, wie er ist (Import: Version, Autor und Datum aus der Datei) */
async function schreibe(b: EigenerBaustein): Promise<boolean> {
  const s = sanitizeEigenerBaustein(b)
  if (!s) return false
  const json = JSON.stringify(s)
  if (Buffer.byteLength(json, 'utf8') > BAUSTEIN_GRENZEN.bytes) return false
  await writeFileAtomicAsync(join(await dir(), `${s.id}.json`), Buffer.from(json, 'utf8'))
  return true
}

const DATEI_FILTER = [{ name: 'Mottulbox-Bausteine', extensions: ['json'] }]

/**
 * Zum Weitergeben: die gewählten Bausteine (aus der eigenen Ablage, nicht vom Renderer) in eine
 * Datei, die der Nutzer im Dialog bestimmt. null = abgebrochen.
 */
export async function exportBausteine(
  parent: BrowserWindow | null,
  ids: unknown
): Promise<BausteinExport | null> {
  const wanted = new Set(Array.isArray(ids) ? ids.filter(isBausteinId) : [])
  const list = (await listBausteine()).filter((b) => wanted.has(b.id))
  if (!list.length) return { ok: false }
  const datum = new Date().toISOString().slice(0, 10)
  // Titel als Dateiname: „/“ oder „:“ würden im Dialog zu Ordnern bzw. ungültigen Namen
  const name =
    list[0].titel
      .replace(/\s+/g, ' ')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .trim() || datum
  const res = await showSaveDialog(
    parent,
    {
      title: 'Bausteine exportieren',
      defaultPath: list.length === 1 ? `Baustein ${name}.json` : `Bausteine ${datum}.json`,
      filters: DATEI_FILTER
    },
    'bausteine'
  )
  if (res.canceled || !res.filePath) return null
  await writeFileAtomicAsync(res.filePath, Buffer.from(packBausteine(list), 'utf8'))
  logLine('[bausteine] exportiert', list.length, res.filePath)
  return { ok: true, path: res.filePath, anzahl: list.length }
}

/**
 * Datei(en) eines Kollegen einlesen – fremde Eingabe: Größe begrenzt, Kopf und jede Hülle
 * geprüft (`unpackBausteine`), zusammengeführt nach `importZusammenfuehren` (nie still
 * überschreiben). null = abgebrochen.
 */
export async function importBausteine(
  parent: BrowserWindow | null
): Promise<BausteinImport[] | null> {
  const res = await showOpenDialog(
    parent,
    {
      title: 'Bausteine importieren',
      properties: ['openFile', 'multiSelections'],
      filters: DATEI_FILTER
    },
    'bausteine'
  )
  if (res.canceled || !res.filePaths.length) return null
  const out: BausteinImport[] = []
  for (const path of res.filePaths.slice(0, 50)) {
    const name = basename(path)
    try {
      if ((await stat(path)).size > BAUSTEIN_DATEI.bytes) {
        out.push({ ok: false, reason: 'zu-gross', name })
        continue
      }
      const list = unpackBausteine(JSON.parse(await readFile(path, 'utf8')))
      if (!list) {
        out.push({ ok: false, reason: 'keine-bausteine', name })
        continue
      }
      const r = importZusammenfuehren(await listBausteine(), list)
      let geschrieben = 0
      for (const b of r.schreiben) if (await schreibe(b)) geschrieben++
      logLine('[bausteine] importiert', name, `${geschrieben}/${r.schreiben.length}`)
      out.push({
        ok: true,
        neu: r.neu,
        aktualisiert: r.aktualisiert,
        uebersprungen: r.uebersprungen + (r.schreiben.length - geschrieben),
        umbenannt: r.umbenannt
      })
    } catch (err) {
      logLine('[bausteine] Import fehlgeschlagen', name, String(err))
      out.push({
        ok: false,
        reason: err instanceof SyntaxError ? 'keine-bausteine' : 'fehler',
        name
      })
    }
  }
  return out
}
