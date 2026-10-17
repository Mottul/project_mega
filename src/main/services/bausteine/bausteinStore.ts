// Eigene Bausteine des Mini-Manuals: eine JSON-Datei je Baustein unter userData/Bausteine. Eine
// Datei je Baustein, damit ein geteilter Ordner (Phase 5, NAS/Nextcloud) keine Sync-Konflikte
// zwischen Kollegen erzeugt. Namen kommen nie vom Renderer: Die Datei heißt nach der geprüften
// Kennung. Lesen tolerant (kaputte Dateien übersprungen), Inhalt prüft das Werkzeug.

import { app } from 'electron'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { BAUSTEIN_GRENZEN, isBausteinId, sanitizeEigenerBaustein } from '@shared/bausteine'
import type { EigenerBaustein } from '@shared/types'
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
