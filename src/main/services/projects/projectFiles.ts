// Projektdateien lesen und Abschnitte speichern (Dateisystem-Seite; die Regeln stehen rein und
// getestet in projectFileCore.ts).
//
// - Geschrieben wird nur in Pfade, die aus einem Dialog, einer geöffneten Datei oder „Zuletzt
//   geöffnet“ stammen und auf .mottul enden – nie in einen beliebigen Pfad vom Renderer.
// - Je Datei eine Warteschlange: LED-Wall und Anleitung können gleichzeitig in dieselbe Datei
//   speichern; jeder Auftrag liest, ändert und schreibt nacheinander (sonst ginge ein Abschnitt
//   verloren).
// - Vor jedem Überschreiben eine Sicherung unter userData/Sicherungen (die letzten 10 je Datei).
// - „Fehlt“ heißt nur „nicht gefunden“. Ein anderer Lesefehler (Netzlaufwerk hakt) darf nie dazu
//   führen, dass eine vorhandene Datei als neu gilt und ohne Sicherung ersetzt wird; neue Dateien
//   werden deshalb auch nur exklusiv angelegt.

import { app } from 'electron'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { isFotoHash } from '@shared/fotos'
import {
  isProjectPath,
  isProjectSectionKey,
  projectDisplayName,
  PROJECT_LIMITS
} from '@shared/projectFile'
import type {
  ProjectFileProblem,
  ProjectOpenResult,
  ProjectSaveRequest,
  ProjectSaveResult,
  ProjectSaveTarget
} from '@shared/types'
import { findFoto, storeFoto } from '../fotos/fotoStore'
import { writeFileAtomicAsync, writeNewFileAsync } from '../fsAtomic'
import { logLine } from '../log'
import { getSettings, setSettings } from '../store'
import {
  backupName,
  backupsToDelete,
  emptyContainer,
  packProject,
  putSection,
  sectionInfos,
  sectionPayload,
  unpackProject,
  type ProjectContainer
} from './projectFileCore'

const RECENT_MAX = 10
const BACKUPS_PER_FILE = 10
const SHA = /^[0-9a-f]{64}$/

/** Vergleichsschlüssel eines Pfads (Windows: Groß-/Kleinschreibung egal). */
function pathKey(p: string): string {
  const abs = resolve(p)
  return process.platform === 'win32' || process.platform === 'darwin' ? abs.toLowerCase() : abs
}

const approved = new Set<string>()

/** Pfad für Lesen/Schreiben freigeben (kam aus einem Dialog oder wurde geöffnet). */
export function approvePath(p: string): void {
  approved.add(pathKey(p))
}

function isRecent(p: string): boolean {
  const k = pathKey(p)
  return getSettings().projects.recent.some((r) => typeof r === 'string' && pathKey(r) === k)
}

/**
 * Frei zum Schreiben? Aus einem Dialog oder geöffnet (in dieser Sitzung) – oder nach einem
 * Neustart aus „Zuletzt geöffnet“; dann aber nur, wenn dort schon eine gültige Projektdatei liegt
 * (siehe saveSection), damit über die Einstellungen kein beliebiger neuer Pfad entsteht.
 */
function approval(p: string): 'dialog' | 'zuletzt' | null {
  if (approved.has(pathKey(p))) return 'dialog'
  return isRecent(p) ? 'zuletzt' : null
}

/** Ganz vorne in „Zuletzt geöffnet“ – frischer Stand aus den Einstellungen (Listen werden ersetzt). */
function addRecent(p: string): void {
  const k = pathKey(p)
  const rest = getSettings().projects.recent.filter(
    (r) => typeof r === 'string' && pathKey(r) !== k
  )
  setSettings({ projects: { recent: [p, ...rest].slice(0, RECENT_MAX) } })
}

const locks = new Map<string, Promise<unknown>>()

function withLock<T>(p: string, fn: () => Promise<T>): Promise<T> {
  const k = pathKey(p)
  const prev = locks.get(k) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  const tail = run.catch(() => {})
  locks.set(k, tail)
  void tail.then(() => {
    if (locks.get(k) === tail) locks.delete(k)
  })
  return run
}

type LoadResult =
  { ok: true; container: ProjectContainer } | { ok: false; reason: ProjectFileProblem }

const errCode = (err: unknown): string | undefined => (err as NodeJS.ErrnoException)?.code

async function load(p: string): Promise<LoadResult> {
  let size: number
  try {
    const st = await stat(p)
    if (!st.isFile()) return { ok: false, reason: 'kein-projekt' }
    size = st.size
  } catch (err) {
    const code = errCode(err)
    if (code === 'ENOENT' || code === 'ENOTDIR') return { ok: false, reason: 'fehlt' }
    logLine('[projekte] Prüfen fehlgeschlagen:', p, String(err))
    return { ok: false, reason: 'fehler' }
  }
  if (size > PROJECT_LIMITS.fileBytes) return { ok: false, reason: 'zu-gross' }
  try {
    return unpackProject(await readFile(p))
  } catch (err) {
    logLine('[projekte] Lesen fehlgeschlagen:', p, String(err))
    return { ok: false, reason: 'fehler' }
  }
}

/**
 * Fotos des geöffneten Abschnitts in den Foto-Speicher legen – das Werkzeug zeigt sie über
 * foto://. Ein fehlendes oder unpassendes Foto (kaputte Datei) bricht das Öffnen nicht ab; die
 * Prüfung vor dem Export meldet es.
 */
async function extractFotos(c: ProjectContainer, section: string): Promise<void> {
  const s = Object.hasOwn(c.file.abschnitte, section) ? c.file.abschnitte[section] : undefined
  for (const hash of s?.fotos ?? []) {
    const f = c.fotos.get(hash)
    if (!f || !(await storeFoto(hash, f.ext, f.data))) {
      logLine('[projekte] Foto fehlt oder passt nicht zu seinem Hash:', hash)
    }
  }
}

/** Fotos, die der Abschnitt jetzt nennt, aus dem Foto-Speicher in den Container holen. */
async function addFotos(c: ProjectContainer, fotos: string[]): Promise<boolean> {
  for (const hash of fotos) {
    if (c.fotos.has(hash)) continue
    const found = await findFoto(hash)
    if (!found) {
      logLine('[projekte] Foto fehlt beim Speichern:', hash)
      return false
    }
    c.fotos.set(hash, { ext: found.ext, data: await readFile(found.path) })
  }
  return true
}

export async function openProject(p: string, section: string): Promise<ProjectOpenResult> {
  if (!isProjectPath(p)) return { ok: false, reason: 'kein-projekt', path: p }
  const r = await withLock(p, () => load(p))
  if (!r.ok) return { ok: false, reason: r.reason, path: p }
  try {
    await extractFotos(r.container, section)
  } catch (err) {
    logLine('[projekte] Fotos nicht übernommen:', p, String(err))
  }
  approvePath(p)
  addRecent(p)
  logLine('[projekte] geöffnet', p)
  return {
    ok: true,
    path: p,
    name: projectDisplayName(p),
    sections: sectionInfos(r.container.file),
    section: sectionPayload(r.container.file, section)
  }
}

/** Ziel eines „Speichern unter“ ansehen (nach dem Dialog): neu, oder was steht schon darin? */
export async function inspectTarget(p: string, section: string): Promise<ProjectSaveTarget> {
  if (!isProjectPath(p)) return { ok: false, reason: 'kein-projekt', path: p }
  approvePath(p)
  const r = await withLock(p, () => load(p))
  if (!r.ok) {
    if (r.reason === 'fehlt') {
      return {
        ok: true,
        path: p,
        name: projectDisplayName(p),
        exists: false,
        sections: [],
        section: null
      }
    }
    return { ok: false, reason: r.reason, path: p }
  }
  return {
    ok: true,
    path: p,
    name: projectDisplayName(p),
    exists: true,
    sections: sectionInfos(r.container.file),
    section: sectionPayload(r.container.file, section)
  }
}

/**
 * Name der Sicherungen einer Datei: Anzeigename plus kurzer Hash des Pfads. Sonst teilten sich
 * „Kunde-A/Messe.mottul“ und „Kunde-B/Messe.mottul“ die 10 Plätze, und das Speichern der einen
 * löschte die Sicherungen der anderen.
 */
function backupKey(p: string): string {
  const hash = createHash('sha256').update(pathKey(p)).digest('hex').slice(0, 8)
  return `${projectDisplayName(p)}-${hash}`
}

/** Bisherige Datei sichern; Fehler hier verhindern das Speichern nicht (nur Log). */
async function backup(p: string, now: Date): Promise<void> {
  try {
    const dir = join(app.getPath('userData'), 'Sicherungen')
    await mkdir(dir, { recursive: true })
    const name = backupKey(p)
    try {
      // nie überschreiben: Zweimal Speichern in derselben Sekunde behält den älteren Stand
      await copyFile(p, join(dir, backupName(name, now)), constants.COPYFILE_EXCL)
    } catch (err) {
      if (errCode(err) !== 'EEXIST') throw err
    }
    for (const old of backupsToDelete(await readdir(dir), name, BACKUPS_PER_FILE)) {
      await rm(join(dir, old), { force: true })
    }
  } catch (err) {
    logLine('[projekte] Sicherung fehlgeschlagen:', p, String(err))
  }
}

function validRequest(req: ProjectSaveRequest): string | null {
  if (!req || typeof req !== 'object') return 'Anfrage fehlt'
  if (!isProjectPath(req.path)) return 'Pfad'
  if (!isProjectSectionKey(req.section)) return 'Abschnitt'
  if (!Number.isInteger(req.version) || req.version < 1 || req.version > 1_000_000) return 'Version'
  if (req.baseSha !== null && (typeof req.baseSha !== 'string' || !SHA.test(req.baseSha)))
    return 'baseSha'
  if (typeof req.force !== 'boolean') return 'force'
  if (
    req.fotos !== undefined &&
    (!Array.isArray(req.fotos) ||
      req.fotos.length > PROJECT_LIMITS.fotosPerSection ||
      !req.fotos.every(isFotoHash))
  ) {
    return 'fotos'
  }
  return null
}

export async function saveSection(req: ProjectSaveRequest): Promise<ProjectSaveResult> {
  const bad = validRequest(req)
  if (bad) {
    logLine('[projekte] Speichern abgewiesen:', bad)
    return { ok: false, reason: 'ungueltig' }
  }
  const via = approval(req.path)
  if (!via) return { ok: false, reason: 'nicht-freigegeben' }
  // Daten so speichern, wie sie als JSON ankommen (Prüfsumme und Datei stimmen dann überein)
  let data: unknown
  try {
    const json = JSON.stringify(req.data)
    if (json === undefined || json.length > PROJECT_LIMITS.sectionDataBytes) {
      return { ok: false, reason: 'ungueltig' }
    }
    data = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'ungueltig' }
  }
  return withLock(req.path, async () => {
    // Legt jemand anderes die Datei zwischen Lesen und Anlegen an, wird sie neu gelesen und wie
    // eine vorhandene behandelt (Sicherung, Konfliktprüfung) – einmal genügt.
    const first = await writeOnce(req, via, data)
    if (first !== 'erneut') return first
    const second = await writeOnce(req, via, data)
    return second === 'erneut' ? { ok: false, reason: 'fehler' } : second
  })
}

async function writeOnce(
  req: ProjectSaveRequest,
  via: 'dialog' | 'zuletzt',
  data: unknown
): Promise<ProjectSaveResult | 'erneut'> {
  const now = new Date()
  const r = await load(req.path)
  let container: ProjectContainer
  let exists = true
  if (r.ok) container = r.container
  else if (via === 'zuletzt') return { ok: false, reason: r.reason }
  else if (r.reason === 'fehlt') {
    // Datei verschwunden, obwohl sie gebunden war -> nicht still neu anlegen
    if (req.baseSha !== null && !req.force) return { ok: false, reason: 'fehlt' }
    container = emptyContainer(now)
    exists = false
  } else return { ok: false, reason: r.reason }
  const put = putSection(
    container.file,
    req.section,
    req.version,
    data,
    req.baseSha,
    req.force,
    now,
    req.fotos && [...new Set(req.fotos)]
  )
  if (!put.ok) {
    return put.reason === 'konflikt'
      ? { ok: false, reason: 'konflikt', rev: put.rev, sha256: put.sha256 }
      : { ok: false, reason: 'neuer' }
  }
  if (put.changed || !exists) {
    if (!(await addFotos(container, put.section.fotos))) return { ok: false, reason: 'foto-fehlt' }
    const packed = packProject({ ...container, file: put.file }, now)
    if (!packed.ok) {
      logLine('[projekte] nicht gespeichert:', req.path, packed.reason)
      return { ok: false, reason: packed.reason }
    }
    try {
      if (exists) {
        await backup(req.path, now)
        await writeFileAtomicAsync(req.path, packed.buf)
      } else {
        await mkdir(dirname(req.path), { recursive: true })
        await writeNewFileAsync(req.path, packed.buf)
      }
    } catch (err) {
      if (!exists && errCode(err) === 'EEXIST') return 'erneut'
      logLine('[projekte] Schreiben fehlgeschlagen:', req.path, String(err))
      return { ok: false, reason: 'fehler' }
    }
    logLine('[projekte] gespeichert', req.path, req.section, `Stand ${put.section.rev}`)
  }
  approvePath(req.path)
  addRecent(req.path)
  return {
    ok: true,
    path: req.path,
    name: projectDisplayName(req.path),
    rev: put.section.rev,
    sha256: put.section.sha256
  }
}
