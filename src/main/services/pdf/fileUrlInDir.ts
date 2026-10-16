// Rein und ohne Electron, damit es testbar ist: Entscheidet, welche Anfragen das PDF-Fenster
// stellen darf (htmlToPdf.ts).

import { isAbsolute, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Liegt die file:-Adresse innerhalb von `dir`? Nur lokale Pfade: UNC-Freigaben
 *  (file://server/…) und Pfade außerhalb – auch über „..“ – gehören nie dazu. */
export function fileUrlInDir(url: string, dir: string): boolean {
  if (!url.startsWith('file:')) return false
  let path: string
  try {
    path = fileURLToPath(url)
  } catch {
    return false // fremder Host außerhalb von Windows, kaputte Kodierung
  }
  const rel = relative(dir, path)
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}
