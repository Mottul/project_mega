// IPC des Video-Generators. Das Projekt kommt aus dem Renderer und wird hier feldweise geprüft
// (shared/videoGenProject): erlaubte Werte, Grenzen, nur absolute Pfade ohne Protokolle.
// Die Zieldatei darf keine der Quellen sein und nicht schon von einem laufenden Auftrag
// beschrieben werden.

import { BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CONVERT_FORMATS } from '@shared/convertPlan'
import { Channels } from '@shared/ipc-contracts'
import type { ConvertFormat, VgenPreviewOutcome } from '@shared/types'
import { sanitizeVgenProject, validOutputPath, VGEN_FORMATS } from '@shared/videoGenProject'
import { broadcast } from '../services/broadcast'
import { clearCache } from '../services/convert/videoGenCache'
import { videoGenJobs } from '../services/convert/videoGenJobs'
import { cancelPreview, renderPreview, setPreviewSink } from '../services/convert/videoGenPreview'
import { videoGenSourceUrl } from '../services/convert/videoGenSources'
import { videoGenThumb } from '../services/convert/videoGenThumbs'
import { showSaveDialog } from '../services/fileDialogs'
import { getSettings, setSettings } from '../services/store'

// Pfadtrenner, Steuer- und unter Windows verbotene Zeichen
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g

/** Vorgeschlagener Dateiname ohne Pfadanteile und Sonderzeichen. */
function safeName(v: unknown): string {
  const s = typeof v === 'string' ? v : ''
  return s.replace(UNSAFE_NAME_CHARS, '').trim().slice(0, 120) || 'Video-Generator'
}

export function registerVideoGenHandlers(): void {
  videoGenJobs.setSink((job) => broadcast(Channels.vgenUpdate, job))

  ipcMain.handle(Channels.vgenThumb, (_e, path: unknown, timeSec: unknown, width: unknown) =>
    typeof path === 'string'
      ? videoGenThumb(path, typeof timeSec === 'number' ? timeSec : null, width === 960 ? 960 : 320)
      : null
  )

  ipcMain.handle(Channels.vgenPickOutput, async (e, format: unknown, suggestedName: unknown) => {
    const fmt: ConvertFormat = VGEN_FORMATS.includes(format as ConvertFormat)
      ? (format as ConvertFormat)
      : 'h264'
    const info = CONVERT_FORMATS[fmt]
    const file = safeName(suggestedName) + info.ext
    const dir = getSettings().videoGen.outputDir
    const opts = {
      title: 'Video speichern',
      defaultPath: dir && existsSync(dir) ? join(dir, file) : file,
      filters: [{ name: info.label, extensions: [info.ext.slice(1)] }]
    }
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await showSaveDialog(win, opts)
    if (res.canceled || !res.filePath) return null
    const path = res.filePath.toLowerCase().endsWith(info.ext)
      ? res.filePath
      : res.filePath + info.ext
    setSettings({ videoGen: { outputDir: dirname(path) } })
    return path
  })

  ipcMain.handle(Channels.vgenEnqueue, (_e, req: unknown) => {
    const r = (typeof req === 'object' && req !== null ? req : {}) as Record<string, unknown>
    const project = sanitizeVgenProject(r.project)
    if (!project) throw new Error('Ungültiges Projekt')
    if (!project.elements.length) throw new Error('Noch keine Bilder oder Videos')
    const out = r.outputPath
    if (!validOutputPath(out, project.output.format)) {
      throw new Error(
        `Ungültige Zieldatei (erwartet ${CONVERT_FORMATS[project.output.format].ext})`
      )
    }
    if (!existsSync(dirname(out))) throw new Error('Zielordner nicht gefunden')
    const lower = out.toLowerCase()
    const sources = [...project.elements.map((e) => e.path), ...(project.music?.tracks ?? [])]
    if (sources.some((s) => s.toLowerCase() === lower)) {
      throw new Error('Die Zieldatei ist eine der Quellen – bitte einen anderen Namen wählen')
    }
    const busy = videoGenJobs
      .list()
      .some(
        (j) =>
          (j.status === 'queued' || j.status === 'probing' || j.status === 'running') &&
          j.outputPath.toLowerCase() === lower
      )
    if (busy) throw new Error('In diese Datei schreibt schon ein laufender Auftrag')
    return videoGenJobs.enqueue({ project, outputPath: out })
  })

  ipcMain.handle(Channels.vgenList, () => videoGenJobs.list())
  ipcMain.handle(Channels.vgenCancel, (_e, id: unknown) => {
    if (typeof id === 'string') videoGenJobs.cancel(id)
  })
  ipcMain.handle(Channels.vgenClearFinished, () => videoGenJobs.clearFinished())
  ipcMain.handle(Channels.vgenClearCache, () => clearCache())

  setPreviewSink((p) => broadcast(Channels.vgenPreviewProgress, p))
  ipcMain.handle(Channels.vgenPreview, (_e, req: unknown): Promise<VgenPreviewOutcome> => {
    const r = (typeof req === 'object' && req !== null ? req : {}) as Record<string, unknown>
    const project = sanitizeVgenProject(r.project)
    const ok = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,64}$/.test(v)
    if (!project || !ok(r.requestId) || !ok(r.elementId)) {
      return Promise.resolve({ ok: false, canceled: false, error: 'Ungültige Anfrage' })
    }
    return renderPreview({ requestId: r.requestId, project, elementId: r.elementId })
  })
  ipcMain.handle(Channels.vgenPreviewCancel, () => cancelPreview())
  ipcMain.handle(Channels.vgenSource, (_e, path: unknown) => videoGenSourceUrl(path))
}
