import { ipcMain, protocol, type BrowserWindow } from 'electron'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { Channels, JINGLE_PROTOCOL, MANUAL_PROTOCOL, MEDIA_PROTOCOL } from '@shared/ipc-contracts'
import type { AppSettings } from '@shared/types'
import { broadcast } from '../services/broadcast'
import { jobManager } from '../services/ffmpeg/jobManager'
import { jingleContentType, resolveJingleFile } from '../services/jingleLibrary'
import { logFilePath, logLine } from '../services/log'
import { resolveManualFile } from '../services/manuals/manualsService'
import { resolveMediaFile } from '../services/player/mediaLibrary'
import { getSettings, setSettings } from '../services/store'
import { registerDialogHandlers } from './dialog.handlers'
import { registerFfmpegHandlers } from './ffmpeg.handlers'
import { registerJingleHandlers } from './jingle.handlers'
import { registerManualsHandlers } from './manuals.handlers'
import { registerNovastarHandlers } from './novastar.handlers'
import { registerOscHandlers } from './osc.handlers'
import { registerPatternHandlers } from './pattern.handlers'
import { registerPlayerHandlers } from './player.handlers'
import { registerTimerHandlers } from './timer.handlers'
import { registerUtilHandlers } from './util.handlers'
import { registerYoutubeHandlers } from './youtube.handlers'

/** Bedient das custom `manual://`-Protocol (PDF-Bytes der Bibliothek). */
export function registerManualProtocol(): void {
  protocol.handle(MANUAL_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      const abs = resolveManualFile(url.pathname)
      if (!abs) {
        logLine('[manual://] NICHT GEFUNDEN url=', request.url, 'pathname=', url.pathname)
        return new Response('Not found', { status: 404 })
      }
      const data = await readFile(abs)
      logLine('[manual://] OK', abs, `${data.byteLength} bytes`)
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(data.byteLength),
          'Accept-Ranges': 'none'
        }
      })
    } catch (err) {
      logLine(
        '[manual://] FEHLER url=',
        request.url,
        '->',
        err instanceof Error ? err.message : String(err)
      )
      return new Response('Error', { status: 500 })
    }
  })
}

function mediaContentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    default:
      return 'application/octet-stream'
  }
}

/** Bedient `media://` (konvertierte Player-Medien) MIT Range-Support, damit das
 *  HTML5-`<video>` streamen und springen kann (sonst kein Seek bei großen Dateien). */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      const abs = resolveMediaFile(url.pathname)
      if (!abs) return new Response('Not found', { status: 404 })

      const total = (await stat(abs)).size
      const ct = mediaContentType(abs)
      const range = request.headers.get('Range')

      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        let start: number
        let end: number
        if (m && m[1] === '' && m[2] !== '') {
          // Suffix-Range "bytes=-N" -> die letzten N Bytes
          const n = parseInt(m[2], 10)
          start = Math.max(0, total - n)
          end = total - 1
        } else {
          start = m && m[1] ? parseInt(m[1], 10) : 0
          end = m && m[2] ? parseInt(m[2], 10) : total - 1
        }
        if (!Number.isFinite(start) || start < 0) start = 0
        if (!Number.isFinite(end) || end >= total) end = total - 1
        if (start > end || start >= total) {
          return new Response('Range Not Satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${total}` }
          })
        }
        const stream = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream
        return new Response(stream, {
          status: 206,
          headers: {
            'Content-Type': ct,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            // CORS: media:// ist aus Sicht der Fenster (file://) cross-origin.
            // Ohne diesen Header liefert ein cross-origin <video> in WebAudio
            // (MediaElementSource, NDI-Audio-Tap) lautlos NUR STILLE.
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': ct,
          'Content-Length': String(total),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch (err) {
      logLine(
        '[media://] FEHLER url=',
        request.url,
        '->',
        err instanceof Error ? err.message : String(err)
      )
      return new Response('Error', { status: 500 })
    }
  })
}

/** Bedient `jingle://` (Audiodateien des Jingle-Players) mit Range-Support. */
export function registerJingleProtocol(): void {
  protocol.handle(JINGLE_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      const abs = resolveJingleFile(url.pathname)
      if (!abs) return new Response('Not found', { status: 404 })

      const total = (await stat(abs)).size
      const ct = jingleContentType(abs)
      const range = request.headers.get('Range')
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        let start = m && m[1] ? parseInt(m[1], 10) : 0
        let end = m && m[2] ? parseInt(m[2], 10) : total - 1
        if (!Number.isFinite(start) || start < 0) start = 0
        if (!Number.isFinite(end) || end >= total) end = total - 1
        if (start > end || start >= total) {
          return new Response('Range Not Satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${total}` }
          })
        }
        const stream = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream
        return new Response(stream, {
          status: 206,
          headers: {
            'Content-Type': ct,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes'
          }
        })
      }
      const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': ct, 'Content-Length': String(total), 'Accept-Ranges': 'bytes' }
      })
    } catch (err) {
      logLine(
        '[jingle://] FEHLER url=',
        request.url,
        '->',
        err instanceof Error ? err.message : String(err)
      )
      return new Response('Error', { status: 500 })
    }
  })
}

let handlersRegistered = false

/** Registriert alle ipcMain.handle-Kanaele -- genau einmal. */
export function registerIpcHandlers(): void {
  if (handlersRegistered) return
  handlersRegistered = true

  ipcMain.handle(Channels.settingsGet, () => getSettings())
  ipcMain.handle(Channels.settingsSet, (_e, patch: Partial<AppSettings>) => setSettings(patch))
  ipcMain.handle(Channels.appLogPath, () => logFilePath())

  registerDialogHandlers()
  registerFfmpegHandlers()
  registerManualsHandlers()
  registerPatternHandlers()
  registerPlayerHandlers()
  registerTimerHandlers()
  registerUtilHandlers()
  registerJingleHandlers()
  registerYoutubeHandlers()
  registerOscHandlers()
  registerNovastarHandlers()
}

/** Verbindet die Live-Job-Updates mit ALLEN Fenstern (Multi-Window: ein HAP-
 *  Konverter in einem Zweitfenster bekommt dieselben Updates). */
export function attachWindow(_win: BrowserWindow): void {
  jobManager.setSink((job) => broadcast(Channels.hapUpdate, job))
}
