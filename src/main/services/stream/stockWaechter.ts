// Wie oft und wie lange der main-Prozess stockt, solange ffmpeg läuft – fürs Protokoll. Stockt er,
// kommt das paint des unsichtbaren Fensters zu spät an; die Erfassung stempelt das Bild erst dann
// (offscreenErfassung.ts), und es liegt im Strom so viel zu spät. Der Ton nicht: Er bekommt seine
// Zeit im Spiegel. „Bild spät an ffmpeg“ (bildRaster.ts) sieht das nicht, denn von der Ankunft bis
// zu ffmpeg geht es danach schnell. Ob der main beim Nutzer so stockt wie auf dem ausgelasteten
// macOS-Runner, entscheidet über Paket ST6 (docs/PLAN-BILDZEIT.md).
//
// Gemessen wird an einem Takt von 20 ms: Kommt er später als geplant, war der main so lange
// beschäftigt – gleich ob mit eigenem JavaScript, mit Arbeit von Electron oder weil das
// Betriebssystem ihm die CPU nahm. Die Uhr ist monoton (performance.now), damit ein Stellen der
// Wanduhr nicht als Stocken zählt.

import { RASTER_ANLAUF_MS, SPAET_MS } from './bildRaster'

/** Takt der Probe (ms) */
const TAKT_MS = 20
/** Höchstens so oft eine Meldung (ms); was dazwischen stockt, kommt gesammelt mit der nächsten */
const MELDEN_MS = 5000
/** Mehr als so viel zu spät (ms) gilt als Stocken – dieselbe Grenze wie für späte Bilder */
export const STOCKEN_MS = SPAET_MS

export interface Stockungen {
  /** wie oft der Takt mehr als STOCKEN_MS zu spät kam */
  n: number
  /** die längste Verspätung (ms) */
  maxMs: number
}

export class StockWaechter {
  private timer: ReturnType<typeof setInterval> | null = null
  private start0 = 0
  private letzter = 0
  private gemeldet = -Infinity
  private stock: Stockungen = { n: 0, maxMs: 0 }

  constructor(
    /** bekommt die gesammelten Stockungen: die erste sofort, danach höchstens alle 5 s, Rest beim Stopp */
    private readonly melden: (s: Stockungen) => void,
    private readonly uhr: () => number = () => performance.now()
  ) {}

  /** Mit ffmpeg starten (zählt von vorn); läuft der Takt schon, bleibt er */
  start(): void {
    if (this.timer) return
    this.start0 = this.letzter = this.uhr()
    this.gemeldet = -Infinity
    this.stock = { n: 0, maxMs: 0 }
    this.timer = setInterval(() => this.takt(), TAKT_MS)
  }

  /** Mit ffmpeg stoppen: Gesammeltes geht noch hinaus */
  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    this.ausgeben(this.uhr())
  }

  private takt(): void {
    const jetzt = this.uhr()
    const spaet = jetzt - this.letzter - TAKT_MS
    this.letzter = jetzt
    // Im Anlauf zählt nichts (wie beim Raster): ffmpeg startet, der Empfänger puffert ohnehin.
    if (spaet > STOCKEN_MS && jetzt - this.start0 >= RASTER_ANLAUF_MS) {
      this.stock.n++
      this.stock.maxMs = Math.max(this.stock.maxMs, Math.round(spaet))
    }
    if (jetzt - this.gemeldet >= MELDEN_MS) this.ausgeben(jetzt)
  }

  private ausgeben(jetzt: number): void {
    if (this.stock.n === 0) return
    this.melden(this.stock)
    this.stock = { n: 0, maxMs: 0 }
    this.gemeldet = jetzt
  }
}
