// Eigene Bausteine des Mini-Manuals: eine JSON-Datei je Baustein (userData/Bausteine, ab
// Phase 5 auch ein geteilter Ordner – eine Datei je Baustein vermeidet Sync-Konflikte). Hier die
// Hülle und ihre Prüfung (rein, für main); den Inhalt (`daten`) prüft das Werkzeug mit seinem
// sanitize, bevor es ihn benutzt.

import type { EigenerBaustein } from './types'

export const BAUSTEIN_GRENZEN = {
  /** eine Datei */
  bytes: 1024 * 1024,
  /** so viele Dateien liest die Liste höchstens */
  anzahl: 2000
} as const

const ID = /^[a-z0-9-]{8,64}$/

export const isBausteinId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

/** Datei zum Weitergeben (Export/Import): mehrere Bausteine in einer JSON-Datei */
export const BAUSTEIN_DATEI = {
  app: 'mottulbox',
  typ: 'bausteine',
  version: 1,
  /** ganze Datei – so viele Bausteine wie eine Liste fassen soll, nicht mehr */
  bytes: 20 * 1024 * 1024,
  anzahl: 500
} as const

/** Bausteine für die Datei zum Weitergeben */
export function packBausteine(list: EigenerBaustein[]): string {
  return JSON.stringify(
    {
      app: BAUSTEIN_DATEI.app,
      typ: BAUSTEIN_DATEI.typ,
      version: BAUSTEIN_DATEI.version,
      bausteine: list
    },
    null,
    1
  )
}

/**
 * Datei zum Weitergeben lesen: fremde Eingabe – Kopf prüfen, jede Hülle prüfen, Kaputtes
 * überspringen (ihr Inhalt wird beim Einfügen noch einmal geprüft). null = keine Bausteine-Datei.
 */
export function unpackBausteine(raw: unknown): EigenerBaustein[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  if (d.app !== BAUSTEIN_DATEI.app || d.typ !== BAUSTEIN_DATEI.typ) return null
  if (typeof d.version !== 'number' || d.version > BAUSTEIN_DATEI.version) return null
  if (!Array.isArray(d.bausteine)) return null
  const out: EigenerBaustein[] = []
  for (const b of d.bausteine.slice(0, BAUSTEIN_DATEI.anzahl)) {
    const s = sanitizeEigenerBaustein(b)
    if (s && !out.some((x) => x.id === s.id)) out.push(s)
  }
  return out
}

const gleicherName = (a: EigenerBaustein, b: EigenerBaustein): boolean =>
  a.art === b.art &&
  a.kapitel === b.kapitel &&
  a.titel.trim().toLocaleLowerCase('de') === b.titel.trim().toLocaleLowerCase('de')

/** Bausteine mit demselben Namen (gleiche Art, gleiches Kapitel, Groß/klein egal) */
export function namensgleiche(
  list: EigenerBaustein[],
  b: Pick<EigenerBaustein, 'art' | 'kapitel' | 'titel' | 'id'>
): EigenerBaustein[] {
  return list.filter((x) => x.id !== b.id && gleicherName(x, b as EigenerBaustein))
}

/** „Titel (2)“, „Titel (3)“ … – der erste Name, den es in dieser Art/diesem Kapitel noch nicht gibt */
export function freierTitel(
  list: EigenerBaustein[],
  b: Pick<EigenerBaustein, 'art' | 'kapitel' | 'titel'>
): string {
  const basis = b.titel.trim().replace(/ \(\d+\)$/, '') || 'Baustein'
  for (let n = 2; ; n++) {
    const titel = `${basis} (${n})`
    if (!list.some((x) => gleicherName(x, { ...x, ...b, titel } as EigenerBaustein))) return titel
  }
}

export interface ImportErgebnis {
  /** so in die Ablage schreiben (Version, Autor und Datum bleiben wie in der Datei) */
  schreiben: EigenerBaustein[]
  neu: number
  aktualisiert: number
  /** schon da (gleiche oder neuere Version) */
  uebersprungen: number
  /** gleicher Name wie ein anderer Baustein – mit „(2)“ angelegt */
  umbenannt: number
}

/**
 * Import zusammenführen: gleiche Kennung = derselbe Baustein – eine neuere Version ersetzt die
 * vorhandene, gleiche oder ältere wird übersprungen. Andere Kennung mit gleichem Namen: beide
 * behalten, der neue bekommt „(2)“ – nie still überschreiben.
 */
export function importZusammenfuehren(
  vorhanden: EigenerBaustein[],
  eingang: EigenerBaustein[]
): ImportErgebnis {
  const r: ImportErgebnis = {
    schreiben: [],
    neu: 0,
    aktualisiert: 0,
    uebersprungen: 0,
    umbenannt: 0
  }
  const stand = [...vorhanden]
  for (const b of eingang) {
    const gleich = stand.find((x) => x.id === b.id)
    if (gleich) {
      if (b.version > gleich.version) {
        r.schreiben.push(b)
        r.aktualisiert++
        stand.splice(stand.indexOf(gleich), 1, b)
      } else r.uebersprungen++
      continue
    }
    const neu = namensgleiche(stand, b).length ? { ...b, titel: freierTitel(stand, b) } : b
    if (neu !== b) r.umbenannt++
    r.schreiben.push(neu)
    r.neu++
    stand.push(neu)
  }
  return r
}

/** Hülle prüfen; `null` = unbrauchbar. `daten` bleibt, wie es ist (Größe prüft der Aufrufer). */
export function sanitizeEigenerBaustein(v: unknown): EigenerBaustein | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const b = v as Record<string, unknown>
  if (!isBausteinId(b.id)) return null
  if (b.art !== 'bloecke' && b.art !== 'fall') return null
  if (!('daten' in b)) return null
  const kapitel = str(b.kapitel, 40)
  return {
    id: b.id,
    art: b.art,
    titel: str(b.titel, 200),
    kapitel: /^[a-zA-Z]*$/.test(kapitel) ? kapitel : '',
    daten: b.daten,
    geaendertAm: str(b.geaendertAm, 40),
    geaendertVon: str(b.geaendertVon, 100),
    version:
      typeof b.version === 'number' && Number.isInteger(b.version) && b.version > 0
        ? Math.min(b.version, 1_000_000)
        : 1
  }
}
