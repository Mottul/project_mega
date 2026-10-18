// Online-Ablage der Handy-Fassung: ein Ordner, den ein Cloud-Dienst veröffentlicht (pCloud Public
// Folder über pCloud Drive). Die Mottulbox schreibt nur hinein – hochladen tut der Dienst, ein
// Zugang zu ihm steht nie in der App. Je Anleitung ein Unterordner mit nicht erratbarem Namen; den
// Namen merkt sich die Anleitung, damit die Adresse (und der QR-Code der Kurzkarte) gleich bleibt.

import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { OnlinePublish } from '@shared/types'
import { writeFileAtomicAsync } from '../fsAtomic'
import { logLine } from '../log'
import { isDirReachable } from '../reachableDir'
import { getSettings } from '../store'
import { HTML_MAX_BYTES, inlineFotos } from './inlineFotos'

/** Name eines Ordners der Ablage – nur, was main selbst erzeugt (kein Weg nach oben) */
export const ORDNER_RE = /^[a-z0-9][a-z0-9-]{2,59}$/

const UMLAUTE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** Lesbarer Teil des Ordnernamens aus dem Projekt („Messe Dornbirn 2026“ → messe-dornbirn-2026) */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (x) => UMLAUTE[x])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Akzente: „Café“ → cafe, nicht caf-e
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    .replace(/-+$/, '')
}

/** Zufall für den Ordnernamen: 8 Zeichen aus a–z und 2–9 (40 Bit) */
export function zufall(bytes: Uint8Array = randomBytes(8)): string {
  const z = 'abcdefghijkmnopqrstuvwxyz23456789'
  return Array.from(bytes.slice(0, 8), (b) => z[b % z.length]).join('')
}

export function neuerOrdner(name: string, rnd = zufall()): string {
  const s = slug(name)
  return s ? `${s}-${rnd}` : `anleitung-${rnd}`
}

/** Adresse der Datei im Netz – nur https, die Basis ist die Adresse des Ordners */
export function onlineAdresse(basis: string, ordner: string): string | null {
  let u: URL
  try {
    u = new URL(basis.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || u.search || u.hash || !ORDNER_RE.test(ordner)) return null
  const pfad = u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`
  return `${u.origin}${pfad}${ordner}/index.html`
}

export async function veroeffentlichen(
  html: string,
  ordner: string | null,
  name: string
): Promise<OnlinePublish> {
  const { dir, url } = getSettings().online
  if (!dir.trim() || !url.trim()) return { ok: false, reason: 'nicht-eingerichtet' }
  const ziel = ordner && ORDNER_RE.test(ordner) ? ordner : neuerOrdner(name)
  const adresse = onlineAdresse(url, ziel)
  if (!adresse) return { ok: false, reason: 'adresse' }
  // Netz- bzw. Cloud-Laufwerk: mit Zeitlimit prüfen, nie synchron (CLAUDE.md)
  if (!isAbsolute(dir) || !(await isDirReachable(dir)))
    return { ok: false, reason: 'nicht-erreichbar' }
  try {
    const voll = await inlineFotos(html)
    if (Buffer.byteLength(voll, 'utf8') > HTML_MAX_BYTES) return { ok: false, reason: 'zu-gross' }
    const ordnerPfad = join(dir, ziel)
    await mkdir(ordnerPfad, { recursive: true })
    const datei = join(ordnerPfad, 'index.html')
    await writeFileAtomicAsync(datei, Buffer.from(voll, 'utf8'))
    logLine('[online] geschrieben', datei, adresse)
    return { ok: true, ordner: ziel, url: adresse, path: datei }
  } catch (err) {
    logLine('[online] Schreiben fehlgeschlagen', String(err))
    return { ok: false, reason: 'fehler' }
  }
}
