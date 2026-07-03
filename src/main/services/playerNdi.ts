// NDI-Ausgabe des Video-Players (experimentell). Ein unsichtbares Offscreen-
// BrowserWindow lädt #/player-ndi (passiver Spiegel der Wiedergabe-Engine,
// treibt NICHT -- keine doppelten ended-/Positionsmeldungen) in der gewählten
// Auflösung; die paint-Frames (BGRA) gehen als NDI-Videoquelle ins Netz.
//
// Audio: das Spiegelfenster zapft die Wiedergabe per WebAudio an
// (MediaElementSource -> AudioWorklet, dadurch KEIN lokaler Ton aus dem
// Spiegel) und schickt planare Float32-PCM-Blöcke über IPC hierher; sie gehen
// als NDI-Audioframes (FLTp) an denselben Sender. Empfänger synchronisieren
// Bild/Ton über die vom SDK gestempelten Zeiten (clockVideo/clockAudio).

import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { Channels } from '@shared/ipc-contracts'
import {
  DEFAULT_PLAYER_NDI,
  type NdiAudioChunk,
  type PlayerNdiConfig,
  type PlayerNdiStatus
} from '@shared/types'
import { broadcast } from './broadcast'
import { logLine } from './log'
import { ensureNdiInitialized, getNdiLoadError, loadGrandiose, type Grandiose } from './ndi'

/* eslint-disable @typescript-eslint/no-explicit-any */

let win: BrowserWindow | null = null
let sender: any = null
let senderTeardown: Promise<void> | null = null
let invalidateTimer: ReturnType<typeof setInterval> | null = null
let sendingVideo = false // ein Video-Send in Flight -> neue Frames verwerfen
let audioBacklog = 0 // Audio seriell senden; bei Stau Blöcke verwerfen
let framesSent = 0
let audioChunks = 0
let audioReceived = 0 // vom Spiegelfenster angekommene PCM-Blöcke (Diagnose)
let audioLevel = 0 // Spitzenpegel (0..1, abklingend) -- unterscheidet Stille von Signal
let silenceWarned = false
let lastError: string | null = null
let config: PlayerNdiConfig = { ...DEFAULT_PLAYER_NDI }

export function getPlayerNdiStatus(): PlayerNdiStatus {
  return {
    available: loadGrandiose() != null,
    running: win != null,
    config,
    framesSent,
    audioChunks,
    audioLevel,
    error: lastError ?? getNdiLoadError()
  }
}

function emitStatus(): void {
  broadcast(Channels.playerNdiChanged, getPlayerNdiStatus())
}

function pushFrame(g: Grandiose, image: Electron.NativeImage): void {
  if (!sender || sendingVideo) return
  const size = image.getSize()
  if (size.width < 2 || size.height < 2) return
  const data = image.toBitmap() // BGRA, eigene Kopie (Send ist asynchron)
  sendingVideo = true
  const frame = {
    type: 'video',
    xres: size.width,
    yres: size.height,
    frameRateN: config.fps * 1000,
    frameRateD: 1000,
    pictureAspectRatio: size.width / size.height,
    frameFormatType: g.FORMAT_TYPE_PROGRESSIVE ?? 1,
    // kein timecode-Feld -> SDK stempelt selbst (siehe timerNdi)
    lineStrideBytes: size.width * 4,
    fourCC: g.FOURCC_BGRA ?? 0,
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
      logLine('[player-ndi]', lastError)
      emitStatus()
    })
    .finally(() => {
      sendingVideo = false
    })
}

/** PCM-Block (planare Float32-Kanäle) als NDI-Audioframe senden. */
function pushAudio(g: Grandiose, chunk: NdiAudioChunk): void {
  if (!sender || !config.audio) return
  const channels = chunk.channels
  if (!channels.length || !channels[0]?.length) return
  // Spitzenpegel messen: die entscheidende Diagnose, ob der Tap SIGNAL liefert
  // oder nur Stille (z.B. CORS-tainted media -> WebAudio liefert Nullen).
  let peak = 0
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i])
      if (a > peak) peak = a
    }
  }
  audioLevel = Math.max(peak, audioLevel * 0.85)
  if (!silenceWarned && audioReceived > 90 && audioLevel < 0.0001) {
    silenceWarned = true
    logLine(
      '[player-ndi] WARNUNG: Audio-Tap liefert nur Stille (Pegel 0) --',
      'Medium ohne Tonspur? Sonst CORS-Kette prüfen (media://-Header + crossOrigin).'
    )
  }
  // Stau begrenzen: lieber einen Block verlieren als Latenz aufzubauen.
  if (audioBacklog > 8) return
  const noSamples = channels[0].length
  const stride = noSamples * 4
  const data = Buffer.concat(
    channels.map((ch) => Buffer.from(ch.buffer, ch.byteOffset, ch.byteLength))
  )
  audioBacklog++
  void Promise.resolve(
    sender.audio({
      sampleRate: Math.round(chunk.sampleRate),
      noChannels: channels.length,
      noSamples,
      channelStrideBytes: stride,
      fourCC: g.FOURCC_FLTp ?? 0,
      data
    })
  )
    .then(() => {
      audioChunks++
      // Diagnose-Anker: NDI-Sender hat den ersten Audioframe angenommen.
      if (audioChunks === 1) logLine('[player-ndi] erster Audioframe an NDI gesendet')
    })
    .catch((err: unknown) => {
      // Audio-Fehler nur loggen (einmal pro Start sichtbar im Panel reicht das Video-Feld)
      if (!lastError) {
        lastError = `NDI-Audio fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
        logLine('[player-ndi]', lastError)
        emitStatus()
      }
    })
    .finally(() => {
      audioBacklog--
    })
}

let audioIpcWired = false
function wireAudioIpc(): void {
  if (audioIpcWired) return
  audioIpcWired = true
  ipcMain.on(Channels.playerNdiAudio, (event, chunk: NdiAudioChunk) => {
    // nur Blöcke aus UNSEREM Spiegelfenster akzeptieren
    if (!win || event.sender.id !== win.webContents.id) return
    audioReceived++
    if (audioReceived === 1) {
      // Diagnose-Anker: Tap im Spiegelfenster liefert -> Renderer-Seite ok.
      logLine(
        '[player-ndi] erster PCM-Block empfangen:',
        chunk.sampleRate,
        'Hz,',
        chunk.channels.length,
        'Kanäle,',
        chunk.channels[0]?.length ?? 0,
        'Frames'
      )
    }
    const g = loadGrandiose()
    if (g) pushAudio(g, chunk)
  })
  // Fehler beim Aufbau des Audio-Taps (Worklet/WebAudio) sichtbar machen --
  // sonst gäbe es nur "0 Audio-Blöcke" ohne Erklärung.
  ipcMain.on(Channels.playerNdiTapError, (event, message: string) => {
    if (!win || event.sender.id !== win.webContents.id) return
    lastError = `Audio-Tap: ${String(message).slice(0, 400)}`
    logLine('[player-ndi]', lastError)
    emitStatus()
  })
}

export async function startPlayerNdi(cfg: PlayerNdiConfig): Promise<PlayerNdiStatus> {
  const g = loadGrandiose()
  if (!g) return getPlayerNdiStatus()
  stopPlayerNdi(false)
  wireAudioIpc()

  config = {
    name: cfg.name.trim() || DEFAULT_PLAYER_NDI.name,
    width: Math.max(320, Math.min(3840, Math.round(cfg.width))),
    height: Math.max(180, Math.min(2160, Math.round(cfg.height))),
    fps: Math.max(1, Math.min(60, Math.round(cfg.fps))),
    fit: cfg.fit === 'contain' ? 'contain' : 'fill',
    audio: !!cfg.audio
  }
  framesSent = 0
  audioChunks = 0
  audioReceived = 0
  audioLevel = 0
  silenceWarned = false
  lastError = null

  if (senderTeardown) {
    await senderTeardown.catch(() => {})
    senderTeardown = null
  }
  await ensureNdiInitialized(g)

  try {
    sender = await g.send({ name: config.name, clockVideo: true, clockAudio: config.audio })
  } catch (firstErr) {
    await new Promise((r) => setTimeout(r, 400))
    try {
      sender = await g.send({ name: config.name, clockVideo: true, clockAudio: config.audio })
    } catch {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr)
      lastError =
        `NDI-Sender nicht erstellt: ${msg} -- Hinweise: Windows-Firewall-Abfrage für die App ` +
        `ZULASSEN (privates Netzwerk), aktive Netzwerkverbindung nötig, ggf. App neu starten.`
      logLine('[player-ndi]', lastError)
      emitStatus()
      return getPlayerNdiStatus()
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
      backgroundThrottling: false,
      // Der Spiegel spielt programmatisch (Engine steuert play/pause)
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  win.webContents.setFrameRate(config.fps)
  win.webContents.on('paint', (_e, _dirty, image) => pushFrame(g, image))
  win.on('closed', () => {
    if (win) {
      win = null
      stopPlayerNdi()
    }
  })

  const hash = `/player-ndi?fit=${config.fit}&audio=${config.audio ? 1 : 0}`
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}#${hash}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })

  // Standbilder/Pausen: regelmäßig invalidieren -> kontinuierlicher NDI-Takt.
  invalidateTimer = setInterval(
    () => {
      if (win && !win.isDestroyed()) win.webContents.invalidate()
    },
    Math.round(1000 / config.fps)
  )

  logLine(
    '[player-ndi] gestartet:',
    config.name,
    `${config.width}x${config.height}@${config.fps}`,
    config.fit,
    config.audio ? 'mit Audio' : 'ohne Audio'
  )
  emitStatus()
  return getPlayerNdiStatus()
}

export function stopPlayerNdi(emit = true): PlayerNdiStatus {
  if (invalidateTimer) {
    clearInterval(invalidateTimer)
    invalidateTimer = null
  }
  if (win) {
    const w = win
    win = null
    if (!w.isDestroyed()) w.destroy()
  }
  if (sender) {
    const s = sender
    sender = null
    // WICHTIG: erst laufende Sends abklingen lassen, DANN zerstören. Ein
    // NDIlib_send_destroy während asynchroner video()/audio()-Aufrufe ist ein
    // Use-after-free im nativen Code -> harter Absturz der App beim Stoppen.
    senderTeardown = (async () => {
      const t0 = Date.now()
      while ((sendingVideo || audioBacklog > 0) && Date.now() - t0 < 1500) {
        await new Promise((r) => setTimeout(r, 25))
      }
      try {
        await s.destroy?.()
      } catch {
        // Binding ohne destroy() -> GC übernimmt
      }
    })()
  }
  if (emit) {
    logLine('[player-ndi] gestoppt')
    emitStatus()
  }
  return getPlayerNdiStatus()
}
