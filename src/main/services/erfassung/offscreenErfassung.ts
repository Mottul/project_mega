// Gemeinsame Offscreen-Erfassung je Werkzeug (Stage-Timer, Video-Player): EIN unsichtbares
// Fenster rendert die Ausgabe-Route; seine Bilder – beim Player auch der Ton aus dem Spiegel –
// gehen an alle Ausgänge, die gerade senden: NDI und Stream fürs Heimnetz. So laufen beide aus
// einem Fenster (der Player dekodiert sein Video nur einmal), und die Fallen der Fenster stehen
// an einer Stelle:
// - 'closed' nur vom AKTUELLEN Fenster auswerten (kommt asynchron, auch nach einem Neuaufbau)
// - Bilder nur umwandeln (toBitmap, 8 MB bei 1080p), wenn ein Ausgang sie gerade braucht – und
//   nur einmal für alle
// - im Takt neu zeichnen nur, wenn ein Ausgang das verlangt (NDI: gleichmäßiger Frame-Takt)
//
// Größe, Bildrate und Route ergeben sich aus den Ausgängen (planeErfassung): Ein Ausgang mit
// fester Größe (NDI) bestimmt das Fenster, der Stream skaliert selbst. Ändert sich das, wird das
// Fenster angepasst bzw. die Route neu geladen.

import { BrowserWindow } from 'electron'
import { logLine } from '../log'
import { loadRoute, secureWebPreferences } from '../windows/appWindows'
import { Bildweg, type BildwegStand, type BildwegZaehler, type Uebergabe } from './bildweg'

/** Ein Bild aus dem Offscreen-Fenster (BGRA, Zeilen ohne Lücke) */
export interface ErfassungsBild {
  width: number
  height: number
  data: Buffer
  /** Wanduhr (ms), zu der der paint im main ankam – der Stream misst daran, wo es landet */
  zeit: number
}

/** Was ein Ausgang vom Fenster braucht */
export interface ErfassungsWunsch {
  width: number
  height: number
  fps: number
  /** NDI sendet das Bild, wie es kommt – seine Größe bestimmt das Fenster. Sonst skaliert der
   *  Ausgang selbst (Stream). */
  festeGroesse: boolean
  /** gleichmäßig neu zeichnen lassen, auch wenn sich nichts ändert (NDI-Frame-Takt) */
  takt: boolean
  /** Ton aus dem Spiegel abgreifen (nur der Player hat welchen) */
  ton?: boolean
  /** Player: Wandbild 1:1 (fill) oder in die Auflösung eingebettet (contain) */
  fit?: 'fill' | 'contain'
}

/** Tonblock aus dem Spiegelfenster (planare Float32-Kanäle; frame = Sample-Nummer des ersten,
 *  gerendert = Wanduhr in ms, zu der das letzte Sample gerendert wurde) */
export interface ErfassungsTon {
  sampleRate: number
  channels: Float32Array[]
  frame?: number
  gerendert?: number
  /** Videobilder seit dem letzten Block: [Wanduhr, Verspätung gegen die Medien-Uhr] (ms) */
  uebergaben?: Uebergabe[]
}

export interface ErfassungsAusgang {
  wunsch(): ErfassungsWunsch
  /** Braucht der Ausgang gerade Bilder? (Stream: nur, solange jemand zuschaut) */
  willBilder(): boolean
  bild(b: ErfassungsBild): void
  ton?(t: ErfassungsTon): void
  /** Aufbau des Ton-Abgriffs im Spiegel gescheitert */
  tonFehler?(text: string): void
  /** Das Fenster ist weg (von außen geschlossen, App-Ende) – der Ausgang hört auf */
  beendet(): void
}

/** Wie das Fenster aussehen muss, damit alle Ausgänge bekommen, was sie brauchen */
export interface ErfassungsPlan {
  width: number
  height: number
  fps: number
  takt: boolean
  ton: boolean
  fit: 'fill' | 'contain'
}

/**
 * Plan aus den Wünschen (rein, getestet): Größe vom ersten Ausgang mit fester Größe, sonst vom
 * ersten; Bildrate die höchste; Takt und Ton, wenn einer sie braucht. Die Darstellung (fit)
 * kommt vom Ausgang, der die Größe bestimmt – ohne Angabe eingebettet, damit ein anderes
 * Seitenverhältnis nicht verzerrt.
 */
export function planeErfassung(w: ErfassungsWunsch[]): ErfassungsPlan | null {
  if (!w.length) return null
  const g = w.find((x) => x.festeGroesse) ?? w[0]
  return {
    width: g.width,
    height: g.height,
    fps: Math.max(...w.map((x) => x.fps)),
    takt: w.some((x) => x.takt),
    ton: w.some((x) => x.ton === true),
    fit: g.fit ?? 'contain'
  }
}

export interface ErfassungsRoute {
  /** App-Route des Fensters zum Plan, z. B. '/timer-output' */
  route(plan: ErfassungsPlan): string
  /** Die Seite spielt Medien ohne Nutzergeste ab (Player-Spiegel) */
  autoplay?: boolean
}

export class OffscreenErfassung {
  private win: BrowserWindow | null = null
  private readonly ausgaenge = new Set<ErfassungsAusgang>()
  private plan: ErfassungsPlan | null = null
  private route = ''
  private taktTimer: ReturnType<typeof setInterval> | null = null
  /** Größe des letzten Bildes – auch ohne Abnehmer gemerkt (getSize kostet nichts) */
  private groesse: { width: number; height: number } | null = null
  /** Weg eines Bildes vom Spiegel bis zum paint im main (der Ton kennt ihn nicht) */
  private readonly bildweg = new Bildweg()

  constructor(
    /** Präfix der Logzeilen, z. B. '[timer-erfassung]' */
    private readonly tag: string,
    private readonly opts: ErfassungsRoute
  ) {}

  get running(): boolean {
    return this.win != null
  }

  /** Größe, in der das Fenster gerade malt (bei Bildschirm-Skalierung nicht genau die geplante) */
  get bildGroesse(): { width: number; height: number } | null {
    return this.groesse
  }

  /** Ein frisches Bild anstoßen – z. B. wenn ein Ausgang gerade erst Bilder braucht. */
  neuZeichnen(): void {
    const w = this.win
    if (w && !w.isDestroyed()) w.webContents.invalidate()
  }

  /** Kommt die Nachricht aus dem eigenen Fenster? (IPC vom Spiegel, z. B. Ton) */
  isOwnWindow(webContentsId: number): boolean {
    const w = this.win
    return w != null && !w.isDestroyed() && w.webContents.id === webContentsId
  }

  /** Ausgang anhängen: Das Fenster entsteht mit dem ersten und passt sich jedem weiteren an. */
  verbinde(a: ErfassungsAusgang): void {
    this.ausgaenge.add(a)
    this.anpassen()
  }

  /** Ausgang abhängen: Mit dem letzten verschwindet das Fenster. */
  trenne(a: ErfassungsAusgang): void {
    if (!this.ausgaenge.delete(a)) return
    this.anpassen()
  }

  /** Ein Ausgang hat einen anderen Wunsch (neu gestartet mit anderer Größe) */
  aktualisiere(): void {
    if (this.ausgaenge.size) this.anpassen()
  }

  /**
   * Wie lange ein Videobild vom Spiegel bis zum paint im main braucht (Median und Streuung in
   * ms); null, solange nicht genug gemessen ist (kein Video, oder der Spiegel meldet nichts).
   */
  get bildwegStand(): BildwegStand | null {
    return this.bildweg.stand
  }

  /** Fürs Protokoll, wenn der Weg des Bildes nicht messbar ist */
  get bildwegZaehler(): BildwegZaehler {
    return this.bildweg.zaehler
  }

  /** Ton aus dem Spiegelfenster an die Ausgänge, die Ton wollen */
  ton(t: ErfassungsTon): void {
    if (t.uebergaben?.length) this.bildweg.uebergaben(t.uebergaben)
    for (const a of this.ausgaenge) if (a.wunsch().ton) a.ton?.(t)
  }

  tonFehler(text: string): void {
    for (const a of this.ausgaenge) if (a.wunsch().ton) a.tonFehler?.(text)
  }

  private anpassen(): void {
    const plan = planeErfassung([...this.ausgaenge].map((a) => a.wunsch()))
    if (!plan) {
      this.schliessen()
      return
    }
    const route = this.opts.route(plan)
    const vorher = this.plan
    this.plan = plan
    let win = this.win
    if (!win || win.isDestroyed()) {
      win = this.oeffnen(plan)
      this.bildweg.zuruecksetzen()
      this.route = route
      loadRoute(win, route)
      logLine(this.tag, 'Fenster:', `${plan.width}x${plan.height}@${plan.fps}`, route)
    } else {
      const groesse = !vorher || vorher.width !== plan.width || vorher.height !== plan.height
      if (groesse) win.setContentSize(plan.width, plan.height)
      if (vorher?.fps !== plan.fps) win.webContents.setFrameRate(plan.fps)
      // Andere Route (Ton an, andere Darstellung): Die Seite lädt neu – der Spiegel holt sich
      // den Wiedergabestand vom main, der Ton-Abgriff beginnt mit neuer Sample-Zählung.
      const neueRoute = route !== this.route
      if (neueRoute) {
        this.bildweg.zuruecksetzen()
        this.route = route
        loadRoute(win, route)
      }
      if (groesse || neueRoute) {
        logLine(this.tag, 'Fenster angepasst:', `${plan.width}x${plan.height}@${plan.fps}`, route)
      }
    }
    this.setzeTakt(win, plan)
  }

  private oeffnen(plan: ErfassungsPlan): BrowserWindow {
    const win = new BrowserWindow({
      show: false,
      width: plan.width,
      height: plan.height,
      frame: false,
      webPreferences: secureWebPreferences({
        offscreen: true,
        backgroundThrottling: false,
        ...(this.opts.autoplay ? { autoplayPolicy: 'no-user-gesture-required' as const } : {})
      })
    })
    this.win = win
    win.webContents.setFrameRate(plan.fps)
    // Nur Bilder des AKTUELLEN Fensters (wie bei 'closed'): Ein spätes Bild eines alten Fensters
    // in anderer Größe ließe den Stream sonst ffmpeg neu starten.
    win.webContents.on('paint', (_e, _dirty, image) => {
      if (this.win === win) this.onPaint(image)
    })
    // Von außen geschlossen (App-Ende) -> alle Ausgänge hören auf. Nur das AKTUELLE Fenster:
    // 'closed' kann nach einem Neuaufbau kommen, wenn schon das neue in `win` steht.
    win.on('closed', () => {
      if (this.win !== win) return
      this.win = null
      this.stopTakt()
      this.plan = null
      this.groesse = null
      const alle = [...this.ausgaenge]
      this.ausgaenge.clear()
      for (const a of alle) a.beendet()
    })
    return win
  }

  private onPaint(image: Electron.NativeImage): void {
    const { width, height } = image.getSize()
    if (width < 2 || height < 2) return
    this.groesse = { width, height }
    const zeit = Date.now()
    this.bildweg.paint(zeit)
    let bild: ErfassungsBild | null = null
    for (const a of this.ausgaenge) {
      if (!a.willBilder()) continue
      // eine Kopie für alle: Die Ausgänge lesen sie nur (NDI-Send, Schreiben an ffmpeg)
      bild ??= { width, height, data: image.toBitmap(), zeit }
      a.bild(bild)
    }
  }

  private setzeTakt(win: BrowserWindow, plan: ErfassungsPlan): void {
    this.stopTakt()
    if (!plan.takt) return
    this.taktTimer = setInterval(
      () => {
        if (!win.isDestroyed()) win.webContents.invalidate()
      },
      Math.round(1000 / plan.fps)
    )
  }

  private stopTakt(): void {
    if (this.taktTimer) clearInterval(this.taktTimer)
    this.taktTimer = null
  }

  private schliessen(): void {
    this.stopTakt()
    this.plan = null
    this.route = ''
    this.groesse = null
    if (this.win) {
      const w = this.win
      this.win = null // vor destroy nullen -> 'closed'-Handler meldet nichts mehr
      if (!w.isDestroyed()) w.destroy()
      logLine(this.tag, 'Fenster geschlossen')
    }
  }
}
