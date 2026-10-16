// Kern der Projektdatei – rein (ohne Dateisystem) und getestet: Container aus ZIP lesen und packen,
// einen Abschnitt einsetzen. Regeln (docs/PLAN-MINI-MANUAL.md):
// - Speichern ersetzt nur den eigenen Abschnitt; fremde Abschnitte, ihre Fotos und unbekannte
//   Einträge bleiben unverändert.
// - Konflikt: Hat sich der eigene Abschnitt seit dem Öffnen geändert (anderer sha256 als baseSha,
//   z. B. Kollege auf dem NAS), wird nicht still überschrieben – außer es steht schon genau das
//   drin, was gespeichert werden soll.
// - rev zählt nur hoch, wenn sich der Inhalt ändert – Speichern ohne Änderung meldet also kein
//   falsches „Planung geändert“ in anderen Werkzeugen.
// - Ein Abschnitt aus einer neueren Mottulbox (höhere Schema-Version) wird nie überschrieben.

import { createHash } from 'node:crypto'
import {
  canonicalJson,
  isProjectSectionKey,
  parseProjectJson,
  PROJECT_JSON_NAME,
  PROJECT_LIMITS,
  PROJECT_SECTION_LABELS,
  PROJECT_TYPE,
  PROJECT_VERSION,
  type ProjectFileJson,
  type ProjectSection
} from '@shared/projectFile'
import { APP_SLUG } from '@shared/brand'
import type { ProjectFileProblem, ProjectSectionInfo, ProjectSectionPayload } from '@shared/types'
import { readZip, writeZip, ZipError, type ZipEntryIn } from './zip'

const FOTO = /^fotos\/([0-9a-f]{64})\.(jpg|png)$/

export interface ProjectContainer {
  file: ProjectFileJson
  /** Fotos nach Hash (Dateiname fotos/<hash>.<endung>) */
  fotos: Map<string, { ext: 'jpg' | 'png'; data: Buffer }>
  /** Einträge, die diese Version nicht kennt – bleiben beim Speichern erhalten */
  extra: Map<string, Buffer>
}

export function sectionSha(data: unknown): string {
  return createHash('sha256').update(canonicalJson(data), 'utf8').digest('hex')
}

export function emptyContainer(now: Date): ProjectContainer {
  return {
    file: {
      app: APP_SLUG,
      type: PROJECT_TYPE,
      version: PROJECT_VERSION,
      geaendert: now.toISOString(),
      abschnitte: {}
    },
    fotos: new Map(),
    extra: new Map()
  }
}

export type UnpackResult =
  { ok: true; container: ProjectContainer } | { ok: false; reason: ProjectFileProblem }

export function unpackProject(buf: Buffer): UnpackResult {
  let entries: Map<string, Buffer>
  try {
    entries = readZip(buf, PROJECT_LIMITS)
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof ZipError && /Kein ZIP/.test(err.message) ? 'kein-projekt' : 'kaputt'
    }
  }
  const json = entries.get(PROJECT_JSON_NAME)
  if (!json) return { ok: false, reason: 'kein-projekt' }
  if (json.length > PROJECT_LIMITS.jsonBytes) return { ok: false, reason: 'zu-gross' }
  const parsed = parseProjectJson(json.toString('utf8'))
  if (!parsed.ok) {
    return {
      ok: false,
      reason:
        parsed.reason === 'neuer' ? 'neuer' : parsed.reason === 'kaputt' ? 'kaputt' : 'kein-projekt'
    }
  }
  const fotos: ProjectContainer['fotos'] = new Map()
  const extra = new Map<string, Buffer>()
  for (const [name, data] of entries) {
    if (name === PROJECT_JSON_NAME) continue
    const m = FOTO.exec(name)
    if (m) fotos.set(m[1], { ext: m[2] as 'jpg' | 'png', data })
    else extra.set(name, data)
  }
  return { ok: true, container: { file: parsed.file, fotos, extra } }
}

export type PackResult = { ok: true; buf: Buffer } | { ok: false; reason: 'zu-gross' | 'ungueltig' }

/**
 * Container als ZIP. Fotos, die kein Abschnitt mehr nennt, fallen weg. Geschrieben wird nur, was
 * sich mit denselben Grenzen und Prüfungen wieder öffnen lässt – sonst wäre die Datei nach dem
 * Speichern verloren (z. B. eine riesige Wand nach einem Tippfehler in den Maßen).
 */
export function packProject(c: ProjectContainer, now = new Date()): PackResult {
  const L = PROJECT_LIMITS
  // kompakt: eingerückt wüchsen große Raster um ein Vielfaches über die Lesegrenze
  const json = JSON.stringify(c.file)
  const jsonBuf = Buffer.from(json, 'utf8')
  if (jsonBuf.length > L.jsonBytes) return { ok: false, reason: 'zu-gross' }
  if (!parseProjectJson(json).ok) return { ok: false, reason: 'ungueltig' }
  const used = new Set(Object.values(c.file.abschnitte).flatMap((s) => s.fotos))
  const entries: ZipEntryIn[] = [{ name: PROJECT_JSON_NAME, data: jsonBuf, compress: true }]
  for (const [hash, f] of c.fotos) {
    if (used.has(hash))
      entries.push({ name: `fotos/${hash}.${f.ext}`, data: f.data, compress: false })
  }
  for (const [name, data] of c.extra) entries.push({ name, data, compress: true })
  const total = entries.reduce((n, e) => n + e.data.length, 0)
  if (
    entries.length > L.entries ||
    entries.some((e) => e !== entries[0] && e.data.length > L.entryBytes) ||
    total > L.totalBytes
  ) {
    return { ok: false, reason: 'zu-gross' }
  }
  const buf = writeZip(entries, now)
  return buf.length > L.fileBytes ? { ok: false, reason: 'zu-gross' } : { ok: true, buf }
}

/** Dateiname einer Sicherung: „<Name>-JJJJMMTT-hhmmss.mottul“ */
export function backupName(name: string, d: Date): string {
  const z = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`
  return `${name}-${stamp}.mottul`
}

/**
 * Sicherungen genau dieses Namens, die über die letzten `keep` hinausgehen. Exakter Vergleich:
 * „Messe“ darf nicht die Sicherungen von „Messe-2026“ mitzählen (und löschen).
 */
export function backupsToDelete(files: string[], name: string, keep: number): string[] {
  return files
    .filter(
      (f) => f.startsWith(`${name}-`) && /^\d{8}-\d{6}\.mottul$/.test(f.slice(name.length + 1))
    )
    .sort()
    .reverse()
    .slice(keep)
}

export function sectionInfos(file: ProjectFileJson): ProjectSectionInfo[] {
  return Object.entries(file.abschnitte).map(([key, s]) => ({
    key,
    // hasOwn: Schlüssel wie „constructor“ aus einer fremden Datei lieferten sonst eine Funktion,
    // und die Antwort ließe sich nicht über IPC schicken
    label: Object.hasOwn(PROJECT_SECTION_LABELS, key) ? PROJECT_SECTION_LABELS[key] : key,
    version: s.version,
    rev: s.rev,
    known: isProjectSectionKey(key)
  }))
}

export function sectionPayload(file: ProjectFileJson, key: string): ProjectSectionPayload | null {
  const s = file.abschnitte[key]
  return s ? { version: s.version, rev: s.rev, sha256: s.sha256, data: s.data } : null
}

export type PutResult =
  | { ok: true; file: ProjectFileJson; section: ProjectSection; changed: boolean }
  | { ok: false; reason: 'konflikt' | 'neuer'; rev: number; sha256: string }

/** Abschnitt einsetzen (liefert eine neue Datei-Beschreibung, die alte bleibt unverändert). */
export function putSection(
  file: ProjectFileJson,
  key: string,
  version: number,
  data: unknown,
  baseSha: string | null,
  force: boolean,
  now: Date
): PutResult {
  const current = file.abschnitte[key]
  if (current && current.version > version) {
    return { ok: false, reason: 'neuer', rev: current.rev, sha256: current.sha256 }
  }
  const sha = sectionSha(data)
  // Steht genau diese Fassung schon in der Datei, gibt es nichts zu überschreiben – auch bei
  // veralteter baseSha (Antwort aufs letzte Speichern nicht angekommen, zweites Fenster)
  if (current && current.sha256 === sha && current.version === version) {
    return { ok: true, file, section: current, changed: false }
  }
  if (!force && (current?.sha256 ?? null) !== baseSha) {
    return { ok: false, reason: 'konflikt', rev: current?.rev ?? 0, sha256: current?.sha256 ?? '' }
  }
  const section: ProjectSection = {
    version,
    rev: (current?.rev ?? 0) + 1,
    sha256: sha,
    geaendert: now.toISOString(),
    fotos: current?.fotos ?? [],
    data
  }
  return {
    ok: true,
    file: {
      ...file,
      geaendert: now.toISOString(),
      abschnitte: { ...file.abschnitte, [key]: section }
    },
    section,
    changed: true
  }
}
