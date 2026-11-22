// Welcher Anteil des Spiegels am Weg des Bildes gilt (rein, getestet). Die Erfassung misst ihn als
// Median über die letzten Bilder (erfassung/bildweg.ts): Übergabe im Spiegel gegen die Medien-Uhr
// plus Weg zum paint. Der erste Wert gilt; danach ein neuer nur, wenn er gesprungen ist.
//
// - Echte Wechsel sind Sprünge: Nach einem Hänger zeigt der Spiegel ein Bild früher oder später
//   (Linux-Runner: +33 ms, der Median kippt binnen zwei, drei Sekunden).
// - Langsam wandert der Wert nur, wenn die Medien-Uhr (currentTime, gegen die der Spiegel misst)
//   anders geht als die Ton-Uhr – macOS-Runner: −439 gegen −1542 ppm, 27 ms in 25 s. Ton und Bild
//   im Spiegel blieben dabei zusammen; der Sender, der mitwanderte, legte den Ton 14 ms zu früh.

/** So viel Änderung (ms) ist ein Sprung – gegenüber dem geltenden Wert und dem Stand von vorhin */
export const SPIEGEL_SPRUNG_MS = 10
/** … innerhalb dieser Zeit (ms) */
export const SPIEGEL_SPRUNG_ZEIT_MS = 3000

export interface SpiegelSchritt {
  /** Anteil des Spiegels, der gilt (ms) */
  ms: number
  /** Er wandert langsam davon weg – einmal je Lauf gemeldet: [geltend, gemessen] */
  wandert?: [number, number]
}

export class SpiegelAnteil {
  private gilt: number | null = null
  private verlauf: { t: number; ms: number }[] = []
  private gemeldet = false

  /** Anteil, der gerade gilt; null, solange nichts gemessen ist */
  get ms(): number | null {
    return this.gilt
  }

  /**
   * Neuer Median aus der Erfassung zur Wanduhr `jetzt` (ms). Solange er gegenüber dem Stand vor
   * SPIEGEL_SPRUNG_ZEIT_MS gesprungen ist, folgt der Anteil ihm genau – so endet ein Sprung auf dem
   * neuen Wert, nicht bis zu 10 ms davor. Sonst bleibt er stehen.
   */
  neu(median: number, jetzt: number): SpiegelSchritt {
    const verlauf = this.verlauf
    verlauf.push({ t: jetzt, ms: median })
    while (verlauf[0].t < jetzt - SPIEGEL_SPRUNG_ZEIT_MS) verlauf.shift()
    if (this.gilt === null || Math.abs(median - verlauf[0].ms) > SPIEGEL_SPRUNG_MS) {
      this.gilt = median
      return { ms: median }
    }
    if (Math.abs(median - this.gilt) <= SPIEGEL_SPRUNG_MS || this.gemeldet) return { ms: this.gilt }
    this.gemeldet = true
    return { ms: this.gilt, wandert: [this.gilt, median] }
  }
}
