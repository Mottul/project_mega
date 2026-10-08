// Datei-Dialoge mit gemerktem Ordner – alle Öffnen-/Speichern-Dialoge der App laufen hierüber.
//
// Seit Electron 43 öffnet ein Dialog ohne absoluten Startpfad im Downloads-Ordner, und das
// Betriebssystem merkt sich den zuletzt benutzten Ordner nicht mehr. Vor der Show hieße das, bei
// jedem Import erst aus „Downloads“ herauszuklicken. Deshalb merkt sich die App den Ordner selbst:
// je Art (Dateien, Ordner, Speichern) und über Neustarts hinweg in settings.json.

import {
  dialog,
  type BrowserWindow,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
  type SaveDialogOptions,
  type SaveDialogReturnValue
} from 'electron'
import { statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { DialogDirKind } from '@shared/types'
import { dialogStartPath } from './dialogStartPath'
import { getSettings, setSettings } from './store'

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function withStartPath<T extends { defaultPath?: string }>(kind: DialogDirKind, opts: T): T {
  const defaultPath = dialogStartPath(getSettings().dialogDirs[kind], opts.defaultPath, isDir)
  return defaultPath ? { ...opts, defaultPath } : opts
}

function remember(kind: DialogDirKind, dir: string): void {
  if (getSettings().dialogDirs[kind] === dir) return
  const patch: Partial<Record<DialogDirKind, string>> = {}
  patch[kind] = dir
  setSettings({ dialogDirs: patch })
}

/** Öffnen-Dialog (mit `parent` modal zum Fenster). Gemerkt wird bei einer Ordner-Wahl der
 *  Ordner selbst, sonst der Ordner der ersten Datei. */
export async function showOpenDialog(
  parent: BrowserWindow | null,
  opts: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  const kind: DialogDirKind = opts.properties?.includes('openDirectory') ? 'ordner' : 'dateien'
  const o = withStartPath(kind, opts)
  const res = parent ? await dialog.showOpenDialog(parent, o) : await dialog.showOpenDialog(o)
  const first = res.canceled ? undefined : res.filePaths[0]
  if (first) remember(kind, kind === 'ordner' ? first : dirname(first))
  return res
}

/** Speichern-Dialog; ein bloßer Dateiname als `defaultPath` landet im gemerkten Ordner. */
export async function showSaveDialog(
  parent: BrowserWindow | null,
  opts: SaveDialogOptions
): Promise<SaveDialogReturnValue> {
  const o = withStartPath('speichern', opts)
  const res = parent ? await dialog.showSaveDialog(parent, o) : await dialog.showSaveDialog(o)
  if (!res.canceled && res.filePath) remember('speichern', dirname(res.filePath))
  return res
}
