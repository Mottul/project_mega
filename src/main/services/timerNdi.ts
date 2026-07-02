// NDI-Ausgabe des Stage-Timers (experimentell). Ein unsichtbares Offscreen-
// BrowserWindow rendert die Timer-Anzeige (#/timer-output) in der gewünschten
// Auflösung; die paint-Frames (BGRA) gehen als NDI-Videoquelle ins Netz.
// Architektur wie beim Tool "Vingester" (Electron-Offscreen -> NDI).
//
// Das NDI-Binding ist BEWUSST optional und wird erst zur Laufzeit geladen:
// ohne Modul läuft die App unverändert, die UI zeigt "nicht verfügbar".
//
// Einrichtung: `npm run ndi:setup` (siehe scripts/setup-ndi.mjs + README).
// Das Binding liegt danach unter vendor/grandiose (NICHT in node_modules --
// npm-Lifecycle-Scripts sind bei neueren npm-Versionen blockiert und
// electron-builder packt undeklarierte node_modules nicht mit). Geladen wird
// der Reihe nach: resources/vendor/grandiose (paketiert, via extraResources),
// <App>/vendor/grandiose (Entwicklung), zuletzt ein regulär installiertes
// 'grandiose'. Die NDI-Runtime-DLL kopiert der grandiose-Build selbst neben
// das Binary (build/Release) -- der Sender braucht keine NDI-Installation.

import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { Channels } from '@shared/ipc-contracts'
import { DEFAULT_TIMER_NDI, type TimerNdiConfig, type TimerNdiStatus } from '@shared/types'
import { broadcast } from './broadcast'
import { logLine } from './log'
import { ensureNdiInitialized, getNdiLoadError, loadGrandiose, type Grandiose } from './ndi'

/* eslint-disable @typescript-eslint/no-explicit-any */

let win: BrowserWindow | null = null
let sender: any = null
// destroy() des Senders ist asynchron -> vor dem nächsten Erstellen abwarten,
// sonst kollidiert Stop->Start (NDIlib_send_create kann fehlschlagen).
let senderTeardown: Promise<void> | null = null
let invalidateTimer: ReturnType<typeof setInterval> | null = null
let sending = false // ein Send in Flight -> neue Frames verwerfen (kein Stau)
let framesSent = 0
let lastError: string | null = null
let config: TimerNdiConfig = { ...DEFAULT_TIMER_NDI }

export function getTimerNdiStatus(): TimerNdiStatus {
  return {
    available: loadGrandiose() != null,
    running: win != null,
    config,
    framesSent,
    error: lastError ?? getNdiLoadError()
  }
}

function emitStatus(): void {
  broadcast(Channels.timerNdiChanged, getTimerNdiStatus())
}

/** paint-Frame (BGRA) als NDI-Videoframe senden; bei laufendem Send verwerfen. */
function pushFrame(g: Grandiose, image: Electron.NativeImage): void {
  if (!sender || sending) return
  const size = image.getSize()
  if (size.width < 2 || size.height < 2) return
  const data = image.toBitmap() // BGRA, eigene Kopie (Send ist asynchron)
  sending = true
  const frame = {
    type: 'video',
    xres: size.width,
    yres: size.height,
    frameRateN: config.fps * 1000,
    frameRateD: 1000,
    pictureAspectRatio: size.width / size.height,
    frameFormatType: g.FORMAT_TYPE_PROGRESSIVE ?? 1,
    // KEIN timecode-Feld: laut grandiose_send.cc optional, Default ist
    // NDIlib_send_timecode_synthesize (SDK stempelt selbst). Wenn gesetzt,
    // muss es number/bigint sein -- ein Array wird hart abgelehnt.
    lineStrideBytes: size.width * 4,
    fourCC: g.FOURCC_BGRA ?? g.FOURCC_BGRX ?? 0,
    data
  }
  void Promise.resolve(sender.video(frame))
    .then(() => {
      framesSent++
      if (lastError) {
        lastError = null
        emitStatus()
      }
    })
    .catch((err: unknown) => {
      lastError = `NDI-Send fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
      logLine('[timer-ndi]', lastError)
      emitStatus()
    })
    .finally(() => {
      sending = false
    })
}

export async function startTimerNdi(cfg: TimerNdiConfig): Promise<TimerNdiStatus> {
  const g = loadGrandiose()
  if (!g) return getTimerNdiStatus()
  stopTimerNdi(false)

  config = {
    name: cfg.name.trim() || DEFAULT_TIMER_NDI.name,
    width: Math.max(320, Math.min(3840, Math.round(cfg.width))),
    height: Math.max(180, Math.min(2160, Math.round(cfg.height))),
    fps: Math.max(1, Math.min(60, Math.round(cfg.fps)))
  }
  framesSent = 0
  lastError = null

  // Ausstehendes destroy() eines vorherigen Senders erst abschließen lassen.
  if (senderTeardown) {
    await senderTeardown.catch(() => {})
    senderTeardown = null
  }
  await ensureNdiInitialized(g)

  try {
    sender = await g.send({ name: config.name, clockVideo: true, clockAudio: false })
  } catch (firstErr) {
    // Transiente Fehler (z.B. Teardown/Netzwerk gerade im Umbruch) einmal abfedern.
    await new Promise((r) => setTimeout(r, 400))
    try {
      sender = await g.send({ name: config.name, clockVideo: true, clockAudio: false })
    } catch {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr)
      lastError =
        `NDI-Sender nicht erstellt: ${msg} -- Hinweise: Windows-Firewall-Abfrage für die App ` +
        `ZULASSEN (privates Netzwerk), aktive Netzwerkverbindung nötig, ggf. App neu starten.`
      logLine('[timer-ndi]', lastError)
      emitStatus()
      return getTimerNdiStatus()
    }
  }

  win = new BrowserWindow({
    show: false,
    width: config.width,
    height: config.height,
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      backgroundThrottling: false
    }
  })
  win.webContents.setFrameRate(config.fps)
  win.webContents.on('paint', (_e, _dirty, image) => pushFrame(g, image))
  win.on('closed', () => {
    // externes Schließen (z.B. App-Ende) -> sauber stoppen
    if (win) {
      win = null
      stopTimerNdi()
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}#/timer-output`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/timer-output' })

  // Die Anzeige ist meist statisch (1 Repaint/s) -> regelmäßig invalidieren,
  // damit ein kontinuierlicher NDI-Frame-Takt entsteht.
  invalidateTimer = setInterval(
    () => {
      if (win && !win.isDestroyed()) win.webContents.invalidate()
    },
    Math.round(1000 / config.fps)
  )

  logLine('[timer-ndi] gestartet:', config.name, `${config.width}x${config.height}@${config.fps}`)
  emitStatus()
  return getTimerNdiStatus()
}

export function stopTimerNdi(emit = true): TimerNdiStatus {
  if (invalidateTimer) {
    clearInterval(invalidateTimer)
    invalidateTimer = null
  }
  if (win) {
    const w = win
    win = null // vor destroy nullen -> 'closed'-Handler stoppt nicht doppelt
    if (!w.isDestroyed()) w.destroy()
  }
  if (sender) {
    const s = sender
    sender = null
    try {
      // Promise merken -> der nächste Start wartet das Teardown ab.
      senderTeardown = Promise.resolve(s.destroy?.()).then(
        () => undefined,
        () => undefined
      )
    } catch {
      // Binding ohne destroy() -> GC übernimmt
    }
  }
  sending = false
  if (emit) {
    logLine('[timer-ndi] gestoppt')
    emitStatus()
  }
  return getTimerNdiStatus()
}
