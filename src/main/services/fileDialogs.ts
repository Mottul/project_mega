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
import { dirname, isAbsolute } from 'node:path'
import type { DialogDirKind } from '@shared/types'
import { dialogStartPath } from './dialogStartPath'
import { ensureProjectsDir } from './projects/projectsDir'
import { isDirReachable } from './reachableDir'
import { getSettings, setSettings } from './store'

/** Absoluter, erreichbarer Ordner? (asynchron – ein getrenntes Netzlaufwerk hält sonst den main an) */
async function reachable(dir: unknown): Promise<boolean> {
  return typeof dir === 'string' && isAbsolute(dir) && (await isDirReachable(dir))
}

/**
 * Gemerkter Ordner. Projektdateien ohne erreichbaren gemerkten Ordner starten im Projektordner –
 * ist auch der nicht erreichbar (Netzlaufwerk weg), im Standardordner, wie es die Einstellungen
 * ankündigen (sonst öffnete Electron „Downloads“).
 */
async function rememberedDir(kind: DialogDirKind): Promise<unknown> {
  const dir = getSettings().dialogDirs[kind]
  if (kind === 'projekte' && !(await reachable(dir))) return ensureProjectsDir().catch(() => dir)
  return dir
}

async function withStartPath<T extends { defaultPath?: string }>(
  kind: DialogDirKind,
  opts: T
): Promise<T> {
  const dir = await rememberedDir(kind)
  const ok = await reachable(dir)
  const defaultPath = dialogStartPath(dir, opts.defaultPath, () => ok)
  return defaultPath ? { ...opts, defaultPath } : opts
}

function remember(kind: DialogDirKind, dir: string): void {
  if (getSettings().dialogDirs[kind] === dir) return
  const patch: Partial<Record<DialogDirKind, string>> = {}
  patch[kind] = dir
  setSettings({ dialogDirs: patch })
}

/** Öffnen-Dialog (mit `parent` modal zum Fenster). Gemerkt wird bei einer Ordner-Wahl der
 *  Ordner selbst, sonst der Ordner der ersten Datei. `kind` nur für eigene Arten (Projektdateien),
 *  sonst ergibt sie sich aus den Eigenschaften. */
export async function showOpenDialog(
  parent: BrowserWindow | null,
  opts: OpenDialogOptions,
  kindOverride?: DialogDirKind
): Promise<OpenDialogReturnValue> {
  const kind: DialogDirKind =
    kindOverride ?? (opts.properties?.includes('openDirectory') ? 'ordner' : 'dateien')
  const o = await withStartPath(kind, opts)
  const res = parent ? await dialog.showOpenDialog(parent, o) : await dialog.showOpenDialog(o)
  const first = res.canceled ? undefined : res.filePaths[0]
  if (first) remember(kind, kind === 'ordner' ? first : dirname(first))
  return res
}

/** Speichern-Dialog; ein bloßer Dateiname als `defaultPath` landet im gemerkten Ordner. */
export async function showSaveDialog(
  parent: BrowserWindow | null,
  opts: SaveDialogOptions,
  kind: DialogDirKind = 'speichern'
): Promise<SaveDialogReturnValue> {
  const o = await withStartPath(kind, opts)
  const res = parent ? await dialog.showSaveDialog(parent, o) : await dialog.showSaveDialog(o)
  if (!res.canceled && res.filePath) remember(kind, dirname(res.filePath))
  return res
}
