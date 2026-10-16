// Projektdateien lesen und Abschnitte speichern (Dateisystem-Seite; die Regeln stehen rein und
// getestet in projectFileCore.ts).
//
// - Geschrieben wird nur in Pfade, die aus einem Dialog, einer geöffneten Datei oder „Zuletzt
//   geöffnet“ stammen und auf .mottul enden – nie in einen beliebigen Pfad vom Renderer.
// - Je Datei eine Warteschlange: LED-Wall und Anleitung können gleichzeitig in dieselbe Datei
//   speichern; jeder Auftrag liest, ändert und schreibt nacheinander (sonst ginge ein Abschnitt
//   verloren).
// - Vor jedem Überschreiben eine Sicherung unter userData/Sicherungen (die letzten 10 je Name).

import { app } from 'electron'
import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
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
import { writeFileAtomicAsync } from '../fsAtomic'
import { logLine } from '../log'
import { getSettings, setSettings } from '../store'
import {
  emptyContainer,
  packProject,
  putSection,
  sectionInfos,
  sectionPayload,
  unpackProject,
  type ProjectContainer
} from './projectFileCore'

const RECENT_MAX = 10
const BACKUPS_PER_NAME = 10
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

async function load(p: string): Promise<LoadResult> {
  let size: number
  try {
    const st = await stat(p)
    if (!st.isFile()) return { ok: false, reason: 'kein-projekt' }
    size = st.size
  } catch {
    return { ok: false, reason: 'fehlt' }
  }
  if (size > PROJECT_LIMITS.fileBytes) return { ok: false, reason: 'zu-gross' }
  try {
    return unpackProject(await readFile(p))
  } catch (err) {
    logLine('[projekte] Lesen fehlgeschlagen:', p, String(err))
    return { ok: false, reason: 'fehler' }
  }
}

export async function openProject(p: string, section: string): Promise<ProjectOpenResult> {
  if (!isProjectPath(p)) return { ok: false, reason: 'kein-projekt', path: p }
  const r = await withLock(p, () => load(p))
  if (!r.ok) return { ok: false, reason: r.reason, path: p }
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

function stamp(d: Date): string {
  const z = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`
}

/** Bisherige Datei sichern; Fehler hier verhindern das Speichern nicht (nur Log). */
async function backup(p: string, now: Date): Promise<void> {
  try {
    const dir = join(app.getPath('userData'), 'Sicherungen')
    await mkdir(dir, { recursive: true })
    const name = projectDisplayName(p)
    await copyFile(p, join(dir, `${name}-${stamp(now)}.mottul`))
    const mine = (await readdir(dir))
      .filter((f) => f.startsWith(`${name}-`) && /-\d{8}-\d{6}\.mottul$/.test(f))
      .sort()
      .reverse()
    for (const old of mine.slice(BACKUPS_PER_NAME)) await rm(join(dir, old), { force: true })
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
      now
    )
    if (!put.ok) {
      return put.reason === 'konflikt'
        ? { ok: false, reason: 'konflikt', rev: put.rev, sha256: put.sha256 }
        : { ok: false, reason: 'neuer' }
    }
    if (put.changed || !exists) {
      try {
        if (exists) await backup(req.path, now)
        else await mkdir(dirname(req.path), { recursive: true })
        await writeFileAtomicAsync(req.path, packProject({ ...container, file: put.file }, now))
      } catch (err) {
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
  })
}
