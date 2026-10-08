import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type FfBinary = 'ffmpeg' | 'ffprobe'

/** Verzeichnisname pro Plattform (deckt sich mit scripts/download-ffmpeg.mjs + electron-builder ${os}). */
function osDir(): 'win' | 'mac' | 'linux' {
  if (process.platform === 'win32') return 'win'
  if (process.platform === 'darwin') return 'mac'
  return 'linux'
}

function exeName(name: FfBinary): string {
  return process.platform === 'win32' ? `${name}.exe` : name
}

/**
 * In der App aktualisierter Build (userData/ffmpeg/<build>, services/ffmpeg/ffmpegUpdate.ts).
 * Wird nur beim Start gesetzt – mitten in der Sitzung wechselt ffmpeg nie (Fähigkeiten und
 * Encoder-Probeläufe sind zwischengespeichert, und in der Show soll nichts überraschen).
 */
let managedDir: string | null = null

export function setManagedFfmpegDir(dir: string | null): void {
  managedDir = dir
}

export function managedFfmpegDir(): string | null {
  return managedDir
}

/**
 * Das mitgelieferte ffmpeg/ffprobe.
 * - packaged: process.resourcesPath/ffmpeg/<bin>  (electron-builder extraResources)
 * - dev:      <projekt>/resources/ffmpeg/<os>/<bin>
 * - Fallback (dev ohne gebundeltes ffmpeg): Name auf dem System-PATH.
 */
export function bundledFfmpegBinPath(name: FfBinary): string {
  const bin = exeName(name)
  if (app.isPackaged) {
    return join(process.resourcesPath, 'ffmpeg', bin)
  }
  const local = join(app.getAppPath(), 'resources', 'ffmpeg', osDir(), bin)
  return existsSync(local) ? local : bin
}

/** Pfad zur ffmpeg/ffprobe-Binary: der in der App aktualisierte Build, sonst der mitgelieferte. */
export function ffmpegBinPath(name: FfBinary): string {
  if (managedDir) {
    const managed = join(managedDir, exeName(name))
    if (existsSync(managed)) return managed
  }
  return bundledFfmpegBinPath(name)
}

export { exeName as ffmpegExeName }
