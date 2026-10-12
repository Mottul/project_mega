// Gemeinsamer NDI-Sender für Stage-Timer und Video-Player (experimentell). Ein unsichtbares
// Offscreen-BrowserWindow rendert eine App-Route in der gewünschten Auflösung; seine paint-Frames
// (BGRA) gehen als NDI-Videoquelle ins Netz, auf Wunsch dazu Ton (planare Float32-Blöcke).
// Architektur wie beim Tool "Vingester" (Electron-Offscreen -> NDI).
//
// Hier steckt einmal, was beide Sender gleich brauchen und was schon schiefging:
// - destroy() des Senders erst, wenn kein Send mehr läuft (sonst Use-after-free im nativen Code
//   -> Absturz beim Stoppen), und vor dem nächsten Erstellen abwarten (Stop->Start kollidiert)
// - 'closed' nur vom AKTUELLEN Fenster auswerten (kommt asynchron, auch nach einem Neustart)
// - Stopp mitten im Start: den gerade erstellten Sender wieder abbauen, kein Fenster öffnen
// - ein Video-Send in Flight -> neue Frames verwerfen; Ton bei Stau verwerfen (keine Latenz)
//
// Das NDI-Binding ist BEWUSST optional (./ndi): ohne Modul läuft die App unverändert, die
// Werkzeuge zeigen "nicht verfügbar".

import { BrowserWindow } from 'electron'
import { loadRoute, secureWebPreferences } from './appWindows'
import { logLine } from './log'
import { ensureNdiInitialized, getNdiLoadError, loadGrandiose, type Grandiose } from './ndi'
import { audioFrame, peakOf, videoFrame, type NdiSize } from './ndiFrames'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface NdiSenderRoute {
  /** App-Route des Offscreen-Fensters, z. B. '/timer-output' */
  route: string
  /** Ton mitschicken: das SDK stempelt dann auch die Audioframes (clockAudio) */
  audio?: boolean
  /** Die Seite spielt Medien ohne Nutzergeste ab (Player-Spiegel, von der Engine gesteuert) */
  autoplay?: boolean
  /** Zusatz für die Logzeile beim Start */
  logInfo?: string[]
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export class OffscreenNdiSender {
  private win: BrowserWindow | null = null
  private sender: any = null
  private teardown: Promise<void> | null = null
  private invalidateTimer: ReturnType<typeof setInterval> | null = null
  private sendingVideo = false
  private audioBacklog = 0
  /** zählt jeden Start und Stopp: ein Start, der nach einem await nicht mehr aktuell ist, bricht ab */
  private generation = 0
  private fps = 30
  /** Sendefehler – verschwindet mit dem nächsten gesendeten Bild */
  private sendError: string | null = null
  /** bleibt bis zum nächsten Start stehen (Sender nicht erstellt, Audio-Tap gescheitert) */
  private problem: string | null = null
  framesSent = 0
  audioChunks = 0
  /** Spitzenpegel des Tons (0..1, abklingend) – unterscheidet Stille von Signal */
  audioLevel = 0

  constructor(
    /** Präfix der Logzeilen, z. B. '[timer-ndi]' */
    private readonly tag: string,
    /** Zustand geändert -> Status an die Fenster */
    private readonly emit: () => void
  ) {}

  get available(): boolean {
    return loadGrandiose() != null
  }

  get running(): boolean {
    return this.win != null
  }

  get error(): string | null {
    return this.problem ?? this.sendError ?? getNdiLoadError()
  }

  /** Kommt die Nachricht aus dem eigenen Offscreen-Fenster? (IPC vom Spiegel) */
  isOwnWindow(webContentsId: number): boolean {
    const w = this.win
    return w != null && !w.isDestroyed() && w.webContents.id === webContentsId
  }

  /** Fehler sichtbar machen, der bis zum nächsten Start stehen bleibt */
  report(text: string): void {
    this.problem = text
    logLine(this.tag, text)
    this.emit()
  }

  async start(size: NdiSize, opts: NdiSenderRoute): Promise<void> {
    const g = loadGrandiose()
    if (!g) return
    this.stop(false)
    const gen = this.generation
    this.fps = size.fps
    this.framesSent = 0
    this.audioChunks = 0
    this.audioLevel = 0
    this.sendError = null
    this.problem = null

    // Ausstehendes destroy() eines vorherigen Senders erst abschließen lassen.
    const pending = this.teardown
    if (pending) {
      await pending.catch(() => {})
      if (this.teardown === pending) this.teardown = null
    }
    await ensureNdiInitialized(g)
    if (gen !== this.generation) return

    const sendOpts = { name: size.name, clockVideo: true, clockAudio: !!opts.audio }
    let sender: any = null
    let failure: unknown = null
    try {
      sender = await g.send(sendOpts)
    } catch (first) {
      // Transiente Fehler (z.B. Teardown/Netzwerk gerade im Umbruch) einmal abfedern.
      await sleep(400)
      if (gen !== this.generation) return
      try {
        sender = await g.send(sendOpts)
      } catch {
        failure = first
      }
    }
    if (gen !== this.generation) {
      // inzwischen gestoppt oder neu gestartet -> diesen Sender gleich wieder abbauen
      if (sender) this.retire(sender)
      return
    }
    if (!sender) {
      this.report(
        `NDI-Sender nicht erstellt: ${failure ? message(failure) : 'unbekannter Fehler'} -- ` +
          `Hinweise: Windows-Firewall-Abfrage für die App ZULASSEN (privates Netzwerk), ` +
          `aktive Netzwerkverbindung nötig, ggf. App neu starten.`
      )
      return
    }
    this.sender = sender

    const win = new BrowserWindow({
      show: false,
      width: size.width,
      height: size.height,
      frame: false,
      webPreferences: secureWebPreferences({
        offscreen: true,
        backgroundThrottling: false,
        ...(opts.autoplay ? { autoplayPolicy: 'no-user-gesture-required' as const } : {})
      })
    })
    this.win = win
    win.webContents.setFrameRate(size.fps)
    win.webContents.on('paint', (_e, _dirty, image) => this.pushFrame(g, image))
    // externes Schließen (z.B. App-Ende) -> sauber stoppen. Nur das AKTUELLE Fenster: 'closed'
    // kann nach einem Neustart des Senders kommen, wenn schon das neue in `win` steht.
    win.on('closed', () => {
      if (this.win !== win) return
      this.win = null
      this.stop()
    })
    loadRoute(win, opts.route)

    // Die Anzeige ist oft statisch (Timer: 1 Repaint/s, Player: Standbild/Pause) -> regelmäßig
    // invalidieren, damit ein gleichmäßiger NDI-Frame-Takt entsteht.
    this.invalidateTimer = setInterval(
      () => {
        if (!win.isDestroyed()) win.webContents.invalidate()
      },
      Math.round(1000 / size.fps)
    )

    logLine(
      this.tag,
      'gestartet:',
      size.name,
      `${size.width}x${size.height}@${size.fps}`,
      ...(opts.logInfo ?? [])
    )
    this.emit()
  }

  stop(emit = true): void {
    this.generation++
    if (this.invalidateTimer) {
      clearInterval(this.invalidateTimer)
      this.invalidateTimer = null
    }
    if (this.win) {
      const w = this.win
      this.win = null // vor destroy nullen -> 'closed'-Handler stoppt nicht doppelt
      if (!w.isDestroyed()) w.destroy()
    }
    if (this.sender) {
      const s = this.sender
      this.sender = null
      this.retire(s)
    }
    if (emit) {
      logLine(this.tag, 'gestoppt')
      this.emit()
    }
  }

  /** Tonblock (planare Float32-Kanäle) als NDI-Audioframe senden; Ungültiges und Stau verwerfen. */
  pushAudio(chunk: unknown): void {
    const g = loadGrandiose()
    const s = this.sender
    if (!g || !s) return
    const frame = audioFrame(g, chunk)
    if (!frame) return
    this.audioLevel = Math.max(
      peakOf((chunk as { channels: Float32Array[] }).channels),
      this.audioLevel * 0.85
    )
    // Stau begrenzen: lieber einen Block verlieren als Latenz aufzubauen.
    if (this.audioBacklog > 8) return
    this.audioBacklog++
    // new Promise statt Promise.resolve(s.audio(…)): auch ein synchroner Wurf des Bindings
    // landet im catch – sonst bliebe der Rückstau für immer gezählt.
    void new Promise((resolve) => resolve(s.audio(frame)))
      .then(() => {
        this.audioChunks++
        // Diagnose-Anker: NDI-Sender hat den ersten Audioframe angenommen.
        if (this.audioChunks === 1) logLine(this.tag, 'erster Audioframe an NDI gesendet')
      })
      .catch((err: unknown) => {
        if (this.sendError) return
        this.sendError = `NDI-Audio fehlgeschlagen: ${message(err)}`
        logLine(this.tag, this.sendError)
        this.emit()
      })
      .finally(() => {
        this.audioBacklog--
      })
  }

  /** paint-Frame (BGRA) als NDI-Videoframe senden; bei laufendem Send verwerfen. */
  private pushFrame(g: Grandiose, image: Electron.NativeImage): void {
    const s = this.sender
    if (!s || this.sendingVideo) return
    const { width, height } = image.getSize()
    if (width < 2 || height < 2) return
    const frame = videoFrame(g, width, height, this.fps, image.toBitmap()) // eigene Kopie
    this.sendingVideo = true
    void new Promise((resolve) => resolve(s.video(frame)))
      .then(() => {
        this.framesSent++
        if (this.sendError) {
          this.sendError = null
          this.emit()
        }
      })
      .catch((err: unknown) => {
        this.sendError = `NDI-Send fehlgeschlagen: ${message(err)}`
        logLine(this.tag, this.sendError)
        this.emit()
      })
      .finally(() => {
        this.sendingVideo = false
      })
  }

  /** Sender abbauen, sobald kein Send mehr läuft (höchstens 1,5 s warten) */
  private retire(s: any): void {
    const before = this.teardown
    // WICHTIG: erst laufende Sends abklingen lassen, DANN zerstören. Ein NDIlib_send_destroy
    // während asynchroner video()/audio()-Aufrufe ist ein Use-after-free im nativen Code ->
    // harter Absturz der App beim Stoppen.
    this.teardown = (async () => {
      await before?.catch(() => {})
      const t0 = Date.now()
      while ((this.sendingVideo || this.audioBacklog > 0) && Date.now() - t0 < 1500) {
        await sleep(25)
      }
      try {
        await s.destroy?.()
      } catch {
        // Binding ohne destroy() -> GC übernimmt
      }
    })()
  }
}
