import { protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { Channels, JINGLE_PROTOCOL, MANUAL_PROTOCOL, MEDIA_PROTOCOL } from '@shared/ipc-contracts'
import type { SettingsPatch } from '@shared/types'
import { broadcast, broadcastExcept } from '../services/broadcast'
import { converterJobs } from '../services/convert/converterJobs'
import { jingleContentType, resolveJingleFile } from '../services/jingle/jingleLibrary'
import { logFilePath, logLine } from '../services/log'
import { resolveManualFile } from '../services/manuals/manualsService'
import { resolveMediaFile } from '../services/player/mediaLibrary'
import { resolveVgenFile } from '../services/convert/videoGenCache'
import { resolveVgenSource } from '../services/convert/videoGenSources'
import { fileResponse } from '../services/serveFile'
import { getSettings, onSettingsChange, setSettings } from '../services/store'
import { registerAtemHandlers } from './atem.handlers'
import { registerBausteineHandlers } from './bausteine.handlers'
import { registerBeendenHandlers } from './beenden.handlers'
import { registerDialogHandlers } from './dialog.handlers'
import { registerFfmpegHandlers } from './ffmpeg.handlers'
import { registerFotosHandlers } from './fotos.handlers'
import { registerHtmlHandlers } from './html.handlers'
import { registerJingleHandlers } from './jingle.handlers'
import { registerManualsHandlers } from './manuals.handlers'
import { registerNetscanHandlers } from './netscan.handlers'
import { registerNovastarHandlers } from './novastar.handlers'
import { registerOscHandlers } from './osc.handlers'
import { registerPatternHandlers } from './pattern.handlers'
import { registerPlayerHandlers } from './player.handlers'
import { registerProjectsHandlers } from './projects.handlers'
import { registerTimerHandlers } from './timer.handlers'
import { registerUtilHandlers } from './util.handlers'
import { registerVideoGenHandlers } from './videoGen.handlers'
import { registerWindowHandlers } from './window.handlers'
import { registerYoutubeHandlers } from './youtube.handlers'
import { handle } from './kanal'

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
    case '.m4v':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.mkv':
      return 'video/x-matroska'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      // Musik der Video-Generator-Vorschau (media://vgen/src/…)
      return jingleContentType(path)
  }
}

/** Bedient `media://` (konvertierte Player-Medien) MIT Range-Support, damit das
 *  HTML5-`<video>` streamen und springen kann (sonst kein Seek bei großen Dateien). */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      // media://vgen/… = Vorschaubilder und gerechnete Vorschauen des Video-Generators (eigener,
      // abgesicherter Ordner); media://vgen/src/<zeichen>/… = vom Generator freigegebene Quelle
      const abs =
        url.host !== 'vgen'
          ? resolveMediaFile(url.pathname)
          : url.pathname.startsWith('/src/')
            ? resolveVgenSource(url.pathname)
            : resolveVgenFile(url.pathname)
      if (!abs) return new Response('Not found', { status: 404 })

      // mit CORS-Freigabe: media:// ist aus Sicht der Fenster (file://) eine fremde Herkunft.
      // Ohne sie liefert ein <video> in WebAudio (MediaElementSource, Ton der NDI-Ausgabe)
      // lautlos NUR STILLE. `await`, damit ein Lesefehler unten im catch landet.
      return await fileResponse(request, abs, mediaContentType(abs), true)
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

      return await fileResponse(request, abs, jingleContentType(abs))
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

/** Registriert alle Kanäle -- genau einmal. */
export function registerIpcHandlers(): void {
  if (handlersRegistered) return
  handlersRegistered = true

  handle(Channels.getSettings, () => getSettings())
  handle(Channels.setSettings, (e, patch: SettingsPatch) => setSettings(patch, e.sender.id))
  // Änderungen an alle übrigen Fenster melden: wer Listen (Favoriten, Playlists, Presets)
  // im eigenen Zustand hält, übernimmt sie – statt sie später mit altem Stand zu überschreiben.
  onSettingsChange((s, origin) => broadcastExcept(origin, Channels.onSettingsChanged, s))
  handle(Channels.getLogPath, () => logFilePath())
  // Live-Job-Updates an ALLE Fenster (ein Video-Konverter im Zweitfenster bekommt dieselben)
  converterJobs.setSink((job) => broadcast(Channels.converter.onUpdate, job))

  registerDialogHandlers()
  registerFfmpegHandlers()
  registerManualsHandlers()
  registerPatternHandlers()
  registerPlayerHandlers()
  registerProjectsHandlers()
  registerFotosHandlers()
  registerHtmlHandlers()
  registerBausteineHandlers()
  registerTimerHandlers()
  registerUtilHandlers()
  registerJingleHandlers()
  registerYoutubeHandlers()
  registerWindowHandlers()
  registerBeendenHandlers()
  registerOscHandlers()
  registerNovastarHandlers()
  registerAtemHandlers()
  registerNetscanHandlers()
  registerVideoGenHandlers()
}
