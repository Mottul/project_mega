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
 * Loest den Pfad zur gebundelten ffmpeg/ffprobe-Binary auf.
 * - packaged: process.resourcesPath/ffmpeg/<bin>  (electron-builder extraResources)
 * - dev:      <projekt>/resources/ffmpeg/<os>/<bin>
 * - Fallback (dev ohne gebundeltes ffmpeg): Name auf dem System-PATH.
 */
export function ffmpegBinPath(name: FfBinary): string {
  const bin = exeName(name)
  if (app.isPackaged) {
    return join(process.resourcesPath, 'ffmpeg', bin)
  }
  const local = join(app.getAppPath(), 'resources', 'ffmpeg', osDir(), bin)
  return existsSync(local) ? local : bin
}
