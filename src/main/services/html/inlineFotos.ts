// Fotos ins HTML einsetzen (data:-URLs) – für Dateien, die ohne Mottulbox geöffnet werden (Handy-
// Fassung des Mini-Manuals). Nur Fotos aus der eigenen Ablage, gefunden über ihren geprüften Hash;
// fehlt eines, wird die Stelle ein leeres Bild statt foto:// – das bedeutet außerhalb der App nichts.

import { readFile } from 'node:fs/promises'
import { fotoHashesIn, replaceFotoUrls } from '@shared/fotos'
import { findFoto } from '../fotos/fotoStore'

/** Größte Datei, die wir schreiben (Fotos eingesetzt) – ein Handy lädt das noch */
export const HTML_MAX_BYTES = 80 * 1024 * 1024

const MIME = { jpg: 'image/jpeg', png: 'image/png' } as const

type Finde = (hash: string) => Promise<{ path: string; ext: keyof typeof MIME } | null>

export async function inlineFotos(
  html: string,
  finde: Finde = findFoto,
  lies: (path: string) => Promise<Buffer> = (p) => readFile(p)
): Promise<string> {
  const data = new Map<string, string>()
  for (const hash of fotoHashesIn(html)) {
    const f = await finde(hash)
    if (f) data.set(hash, `data:${MIME[f.ext]};base64,${(await lies(f.path)).toString('base64')}`)
  }
  return replaceFotoUrls(html, (hash) => data.get(hash) ?? 'data:,')
}
