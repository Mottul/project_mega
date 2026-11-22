// Wo landet ein Bild im Strom gegenüber seinem paint? (rein, getestet) ffmpeg stempelt jedes Bild
// beim Lesen mit der Wanduhr, der fps-Filter legt es auf das nächste Vielfache von 1/fps seit 1970
// – gemessen: round(Ende des Schreibens / Raster) · Raster, 193 von 199 Bildern genau (Skill
// ffmpeg-labor). Das verschiebt jedes Bild um bis zu ein halbes Raster, je Start fest, weil
// paints und Raster im selben Takt laufen; dazu kommt die Zeit vom paint bis zum Schreiben. Der
// Ton soll mit: Der Sender legt ihn um das Mittel später.
//
// Mittel statt Median: Liegt die Phase der paints nahe an der Rundungsgrenze, landen die Bilder
// abwechselnd ein Raster früher oder später – das Mittel liegt dann dazwischen und springt nicht
// bei jedem Bild zwischen beiden Seiten. Über zehn Sekunden, damit es ruhig bleibt: Jeder
// Wechsel rückt den Ton. Der Anlauf zählt nicht – gerade gestartet, liest ffmpeg die
// ersten Bilder spät (gemessen: bis 45 ms), das Mittel trug das sonst sekundenlang mit.
//
// Ein Bild, das lange nach seinem paint erst ganz bei ffmpeg ist, liegt im Strom so viel zu spät:
// Unter macOS und Linux geht ein Bild (3,7 MB bei 720p) in 64-KB-Stücken durch die Pipe, jedes
// Stück eine Runde im Event-Loop des main-Prozesses – ist er beschäftigt, dauert das. Solche
// Bilder zählt das Raster mit (fürs Protokoll), auch die, die es fürs Mittel verwirft.

/** So viele Bilder zählen (zehn Sekunden bei 30 Bildern/s) */
const MAX_WERTE = 300
/** Erst ab so vielen Bildern gilt das Mittel */
const MIN_WERTE = 30
/** Länger als so vom paint bis in den Strom: kein Messwert (Hänger, voller Puffer) */
const MAX_MS = 500
/** So lange nach dem Start von ffmpeg zählt noch nichts */
export const RASTER_ANLAUF_MS = 2000
/** Ab so viel vom paint bis zum Ende des Schreibens (ms) gilt ein Bild als spät an ffmpeg */
export const SPAET_MS = 50

export class BildRaster {
  private werte: number[] = []
  private spaet = { n: 0, maxMs: 0 }

  constructor(
    /** Bildrate des Stroms (fps-Filter) */
    private readonly fps: number,
    /** Wanduhr beim Start von ffmpeg (ms) */
    private readonly start: number
  ) {}

  /** Ein frisches Bild (paint zur Wanduhr `paintMs`) ist zu `geschriebenMs` bei ffmpeg angekommen */
  geschrieben(paintMs: number, geschriebenMs: number): void {
    if (paintMs < this.start + RASTER_ANLAUF_MS) return
    const dauer = geschriebenMs - paintMs
    if (dauer >= SPAET_MS) {
      this.spaet.n++
      this.spaet.maxMs = Math.max(this.spaet.maxMs, Math.round(dauer))
    }
    const raster = 1000 / this.fps
    const imStrom = Math.round(geschriebenMs / raster) * raster
    const verzug = imStrom - paintMs
    if (!Number.isFinite(verzug) || verzug < -raster || verzug > MAX_MS) return
    this.werte.push(verzug)
    if (this.werte.length > MAX_WERTE) this.werte.splice(0, this.werte.length - MAX_WERTE)
  }

  /** Um so viel liegt ein Bild im Strom später als sein paint (ms, Mittel); null = zu wenig */
  get ms(): number | null {
    if (this.werte.length < MIN_WERTE) return null
    return Math.round(this.werte.reduce((a, b) => a + b, 0) / this.werte.length)
  }

  /** Späte Bilder seit dem letzten Abruf (Zahl, längste Zeit vom paint bis ffmpeg), dann von vorn */
  spaeteAbholen(): { n: number; maxMs: number } {
    const s = this.spaet
    this.spaet = { n: 0, maxMs: 0 }
    return s
  }
}
