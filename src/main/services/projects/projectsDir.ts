// Standard-Speicherort der Projektdateien. Leer in den Einstellungen heißt „Standard“
// (Dokumente/Mottulbox-Projekte); der aufgelöste Pfad wird nicht zurückgeschrieben, damit er dem
// Dokumente-Ordner folgt. Angelegt wird der Ordner erst, wenn er gebraucht wird.

import { app } from 'electron'
import { statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { APP_NAME } from '@shared/brand'
import type { ProjectsDirInfo } from '@shared/types'
import { isSafeAbsolutePath } from '@shared/videoGenProject'
import { getSettings } from '../store'

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function defaultProjectsDir(): string {
  return join(app.getPath('documents'), `${APP_NAME}-Projekte`)
}

/** Eingestellter (geprüfter) oder Standard-Ordner – settings:set prüft Pfade nicht. */
export function projectsDirInfo(): ProjectsDirInfo {
  const dir = getSettings().projects.dir
  const custom = isSafeAbsolutePath(dir)
  const path = custom ? dir : defaultProjectsDir()
  return { path, isDefault: !custom, exists: isDir(path) }
}

/**
 * Ordner für einen Dialog: der eingestellte, wenn erreichbar; sonst der Standard (wird angelegt).
 * Ein eigener Ordner wird nie angelegt – fehlt er, ist meist das Netzlaufwerk weg.
 */
export async function ensureProjectsDir(): Promise<string> {
  const info = projectsDirInfo()
  if (info.exists) return info.path
  const fallback = defaultProjectsDir()
  await mkdir(fallback, { recursive: true })
  return fallback
}
