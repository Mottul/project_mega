// Gemeinsamer NDI-Sender für Stage-Timer und Video-Player (experimentell). Bilder (BGRA) und beim
// Player der Ton (planare Float32-Blöcke) kommen aus der Offscreen-Erfassung des Werkzeugs
// (erfassung/offscreenErfassung.ts) – derselben, aus der auch der Stream fürs Heimnetz sendet.
// Architektur wie beim Tool "Vingester" (Electron-Offscreen -> NDI).
//
// Hier steckt einmal, was beide Sender gleich brauchen und was schon schiefging:
// - destroy() des Senders erst, wenn kein Send mehr läuft (sonst Use-after-free im nativen Code
//   -> Absturz beim Stoppen), und vor dem nächsten Erstellen abwarten (Stop->Start kollidiert)
// - Stopp mitten im Start: den gerade erstellten Sender wieder abbauen, nicht an die Erfassung
// - ein Video-Send in Flight -> neue Frames verwerfen; Ton bei Stau verwerfen (keine Latenz)
// Was das Fenster betrifft ('closed' nur vom aktuellen Fenster …), regelt die Erfassung.
//
// Das NDI-Binding ist BEWUSST optional (./ndi): ohne Modul läuft die App unverändert, die
// Werkzeuge zeigen "nicht verfügbar".

import type {
  ErfassungsAusgang,
  ErfassungsBild,
  ErfassungsTon,
  ErfassungsWunsch,
  OffscreenErfassung
} from '../erfassung/offscreenErfassung'
import { logLine } from '../log'
import { ensureNdiInitialized, getNdiLoadError, loadGrandiose } from './ndi'
import { audioFrame, peakOf, videoFrame, type NdiSize } from './ndiFrames'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface NdiSenderOptions {
  /** Ton mitschicken: das SDK stempelt dann auch die Audioframes (clockAudio) */
  audio?: boolean
  /** Player: Wandbild 1:1 (fill) oder in die Zielauflösung eingebettet (contain) */
  fit?: 'fill' | 'contain'
  /** Zusatz für die Logzeile beim Start */
  logInfo?: string[]
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export class NdiSender implements ErfassungsAusgang {
  private sender: any = null
  private teardown: Promise<void> | null = null
  private sendingVideo = false
  private audioBacklog = 0
  /** zählt jeden Start und Stopp: ein Start, der nach einem await nicht mehr aktuell ist, bricht ab */
  private generation = 0
  private size: NdiSize = { name: '', width: 1920, height: 1080, fps: 30 }
  private opts: NdiSenderOptions = {}
  /** Sendefehler – verschwindet mit dem nächsten gesendeten Bild */
  private sendError: string | null = null
  /** bleibt bis zum nächsten Start stehen (Sender nicht erstellt, Audio-Tap gescheitert) */
  private problem: string | null = null
  private silenceWarned = false
  framesSent = 0
  audioChunks = 0
  /** Spitzenpegel des Tons (0..1, abklingend) – unterscheidet Stille von Signal */
  audioLevel = 0

  constructor(
    /** Präfix der Logzeilen, z. B. '[timer-ndi]' */
    private readonly tag: string,
    /** Zustand geändert -> Status an die Fenster */
    private readonly emit: () => void,
    /** Offscreen-Erfassung des Werkzeugs (geteilt mit dem Stream) */
    private readonly erfassung: OffscreenErfassung
  ) {}

  get available(): boolean {
    return loadGrandiose() != null
  }

  get running(): boolean {
    return this.sender != null
  }

  get error(): string | null {
    return this.problem ?? this.sendError ?? getNdiLoadError()
  }

  /** Fehler sichtbar machen, der bis zum nächsten Start stehen bleibt */
  report(text: string): void {
    this.problem = text
    logLine(this.tag, text)
    this.emit()
  }

  async start(size: NdiSize, opts: NdiSenderOptions = {}): Promise<void> {
    const g = loadGrandiose()
    if (!g) return
    this.stop(false)
    const gen = this.generation
    this.framesSent = 0
    this.audioChunks = 0
    this.audioLevel = 0
    this.silenceWarned = false
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
    this.size = size
    this.opts = opts
    // Bilder kommen ab jetzt aus der Erfassung; ihr Fenster richtet sich nach dieser Größe.
    this.erfassung.verbinde(this)

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
    this.erfassung.trenne(this)
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

  // --- Ausgang der Erfassung ---

  wunsch(): ErfassungsWunsch {
    return {
      width: this.size.width,
      height: this.size.height,
      fps: this.size.fps,
      festeGroesse: true,
      // Die Anzeige ist oft statisch (Timer: 1 Repaint/s, Player: Standbild/Pause) -> im Takt
      // neu zeichnen lassen, damit ein gleichmäßiger NDI-Frame-Takt entsteht.
      takt: true,
      ton: this.opts.audio === true,
      fit: this.opts.fit
    }
  }

  /** Während ein Bild im Flug ist, keins umwandeln lassen – es würde ohnehin verworfen. */
  willBilder(): boolean {
    return this.sender != null && !this.sendingVideo
  }

  bild(b: ErfassungsBild): void {
    this.pushFrame(b)
  }

  ton(t: ErfassungsTon): void {
    this.pushAudio(t)
  }

  tonFehler(text: string): void {
    this.report(`Audio-Tap: ${text}`)
  }

  /** Erfassungsfenster von außen geschlossen (z. B. App-Ende) -> sauber stoppen */
  beendet(): void {
    this.stop()
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
    // Stille trotz Blöcken: CORS-tainted media -> WebAudio liefert Nullen, oder keine Tonspur
    if (!this.silenceWarned && this.audioChunks > 90 && this.audioLevel < 0.0001) {
      this.silenceWarned = true
      logLine(
        this.tag,
        'WARNUNG: Audio-Tap liefert nur Stille (Pegel 0) --',
        'Medium ohne Tonspur? Sonst CORS-Kette prüfen (media://-Header + crossOrigin).'
      )
    }
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

  /** Bild (BGRA) als NDI-Videoframe senden; bei laufendem Send verwerfen. */
  private pushFrame(b: ErfassungsBild): void {
    const g = loadGrandiose()
    const s = this.sender
    if (!g || !s || this.sendingVideo) return
    const frame = videoFrame(g, b.width, b.height, this.size.fps, b.data)
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
