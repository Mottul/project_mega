// Projektdatei (.mottul): EINE Datei mit einem Abschnitt je Werkzeug (LED-Wall, später Anleitung,
// Packliste …), dazu die Fotos. Jedes Werkzeug liest und schreibt nur seinen eigenen Abschnitt –
// so bleibt die schnelle Einzelplanung ohne Ballast, und ein „Gesamtprojekt“ ist einfach dieselbe
// Datei mit mehr Abschnitten (docs/PLAN-MINI-MANUAL.md, „Projektdatei und Projektordner“).
//
// Hier liegen Format, Grenzen und die reinen Prüfungen. main liest und schreibt die Datei, der
// Renderer braucht dieselbe kanonische Form für seine Prüfsumme („ungespeichert“).

import { isSafeAbsolutePath } from './videoGenProject'

export const PROJECT_EXT = 'mottul'
export const PROJECT_TYPE = 'projektdatei'
/** Version des Containers (Kopf + Abschnitte). Höhere Versionen öffnet diese App nicht. */
export const PROJECT_VERSION = 1
/** Name der Inhaltsdatei im ZIP */
export const PROJECT_JSON_NAME = 'projekt.json'

/** Grenzen beim Lesen fremder Dateien (Kollegen, Mail) – großzügig für Fotos, eng für den Rest. */
export const PROJECT_LIMITS = {
  /** projekt.json entpackt */
  jsonBytes: 8 * 1024 * 1024,
  /** ein Eintrag entpackt (Foto) */
  entryBytes: 32 * 1024 * 1024,
  /** alle Einträge zusammen entpackt */
  totalBytes: 512 * 1024 * 1024,
  /** Datei auf der Platte */
  fileBytes: 600 * 1024 * 1024,
  entries: 2000,
  sections: 32,
  fotosPerSection: 500,
  /** Daten eines Abschnitts als JSON (vom Renderer beim Speichern) */
  sectionDataBytes: 4 * 1024 * 1024
} as const

/** Abschnitte, die diese App schreiben kann. Andere bleiben beim Speichern unangetastet. */
export const PROJECT_SECTION_KEYS = ['ledWall', 'anleitung'] as const
export type ProjectSectionKey = (typeof PROJECT_SECTION_KEYS)[number]

/** Anzeigenamen – auch für Abschnitte, die erst spätere Versionen schreiben. */
export const PROJECT_SECTION_LABELS: Record<string, string> = {
  ledWall: 'LED-Wall-Planung',
  anleitung: 'Anleitung',
  packliste: 'Packliste'
}

export interface ProjectSection {
  /** Schema-Version des Abschnitts (vom Werkzeug bestimmt) */
  version: number
  /** zählt nur hoch, wenn sich der Inhalt (sha256) ändert */
  rev: number
  /** sha256 über das kanonische JSON von `data` */
  sha256: string
  /** ISO-Zeitpunkt der letzten inhaltlichen Änderung */
  geaendert: string
  /** benutzte Fotos (Hashes); neben `data`, damit main sie auch für unbekannte Abschnitte kennt */
  fotos: string[]
  data: unknown
}

export interface ProjectFileJson {
  app: string
  type: typeof PROJECT_TYPE
  version: number
  geaendert: string
  abschnitte: Record<string, ProjectSection>
}

export function isProjectSectionKey(v: unknown): v is ProjectSectionKey {
  return typeof v === 'string' && (PROJECT_SECTION_KEYS as readonly string[]).includes(v)
}

const SECTION_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/
const HASH = /^[0-9a-f]{64}$/

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

/**
 * JSON mit fester Schlüsselreihenfolge (alphabetisch, rekursiv): Derselbe Inhalt ergibt immer
 * denselben Text – Grundlage der Prüfsummen in main (sha256) und Renderer (digest).
 * Wie JSON.stringify: undefined und Funktionen fallen weg, in Listen werden sie zu null.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const s = JSON.stringify(value)
    return s === undefined ? 'null' : s
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const parts: string[] = []
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key]
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue
    parts.push(JSON.stringify(key) + ':' + canonicalJson(v))
  }
  return '{' + parts.join(',') + '}'
}

/**
 * Schnelle Prüfsumme (cyrb53, 53 bit) über das kanonische JSON – nur für „ungespeichert“ im
 * Renderer, kein Schutz gegen Absicht. Den Konflikt beim Speichern prüft main mit sha256.
 */
export function digest(value: unknown): string {
  const str = canonicalJson(value)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

export type ProjectParseResult =
  | { ok: true; file: ProjectFileJson }
  | { ok: false; reason: 'kein-json' | 'fremd' | 'neuer' | 'kaputt' }

function section(v: unknown): ProjectSection | null {
  if (!isObj(v)) return null
  if (!isInt(v.version, 1, 1_000_000) || !isInt(v.rev, 0, Number.MAX_SAFE_INTEGER)) return null
  if (typeof v.sha256 !== 'string' || !HASH.test(v.sha256)) return null
  if (typeof v.geaendert !== 'string' || v.geaendert.length > 40) return null
  if (!Array.isArray(v.fotos) || v.fotos.length > PROJECT_LIMITS.fotosPerSection) return null
  if (!v.fotos.every((f) => typeof f === 'string' && HASH.test(f))) return null
  if (!('data' in v)) return null
  return {
    version: v.version,
    rev: v.rev,
    sha256: v.sha256,
    geaendert: v.geaendert,
    fotos: [...(v.fotos as string[])],
    data: v.data
  }
}

/**
 * Inhalt (projekt.json) prüfen. Ein kaputter Abschnitt macht die ganze Datei ungültig: Ihn beim
 * Speichern wegzulassen hieße, den Teil eines anderen Werkzeugs zu löschen.
 */
export function parseProjectJson(text: string): ProjectParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'kein-json' }
  }
  if (!isObj(raw) || raw.type !== PROJECT_TYPE) return { ok: false, reason: 'fremd' }
  if (!isInt(raw.version, 1, 1_000_000)) return { ok: false, reason: 'kaputt' }
  if (raw.version > PROJECT_VERSION) return { ok: false, reason: 'neuer' }
  if (!isObj(raw.abschnitte)) return { ok: false, reason: 'kaputt' }
  const keys = Object.keys(raw.abschnitte)
  if (keys.length > PROJECT_LIMITS.sections) return { ok: false, reason: 'kaputt' }
  const abschnitte: Record<string, ProjectSection> = {}
  for (const key of keys) {
    if (!SECTION_KEY.test(key)) return { ok: false, reason: 'kaputt' }
    const s = section(raw.abschnitte[key])
    if (!s) return { ok: false, reason: 'kaputt' }
    abschnitte[key] = s
  }
  return {
    ok: true,
    file: {
      app: typeof raw.app === 'string' ? raw.app.slice(0, 64) : '',
      type: PROJECT_TYPE,
      version: raw.version,
      geaendert: typeof raw.geaendert === 'string' ? raw.geaendert.slice(0, 40) : '',
      abschnitte
    }
  }
}

/** Absoluter Pfad mit Endung .mottul (ohne Steuerzeichen, kein Protokoll). */
export function isProjectPath(p: unknown): p is string {
  return isSafeAbsolutePath(p) && p.toLowerCase().endsWith('.' + PROJECT_EXT)
}

/** Dateiname aus einem Projektnamen: verbotene Zeichen raus, Endung dran. */
export function projectFileName(name: string): string {
  const base = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)
  return `${base || 'Projekt'}.${PROJECT_EXT}`
}

/** Anzeigename einer Projektdatei: Dateiname ohne Ordner und Endung. */
export function projectDisplayName(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? path
  return file.toLowerCase().endsWith('.' + PROJECT_EXT)
    ? file.slice(0, -(PROJECT_EXT.length + 1))
    : file
}
