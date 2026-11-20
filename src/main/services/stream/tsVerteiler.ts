// Verteilt EINEN MPEG-TS-Strom (stdout von ffmpeg) an beliebig viele HTTP-Empfänger. Ohne
// Electron, getestet. Wer nicht hinterherkommt (WLAN bricht ein, Box hängt), fliegt raus, statt
// den Speicher zu füllen oder die anderen aufzuhalten – ein Live-Bild holt man nicht nach.

/** Was der Verteiler von einer HTTP-Antwort braucht (ServerResponse erfüllt das). */
export interface TsEmpfaenger {
  write(chunk: Buffer): boolean
  readonly writableLength: number
  destroy(): void
  once(event: 'close', cb: () => void): unknown
}

/** Rückstau, ab dem ein Empfänger getrennt wird: bei 4 Mbit/s rund 8 Sekunden Bild. */
export const MAX_RUECKSTAU = 4 * 1024 * 1024

export class TsVerteiler {
  private readonly empfaenger = new Set<TsEmpfaenger>()
  /** Bytes seit dem Start (für die gemessene Datenrate) */
  bytes = 0

  constructor(
    /** Anzahl geändert (0 -> ffmpeg kann ausgehen, 1 -> ffmpeg muss laufen) */
    private readonly onCount: (n: number) => void = () => {}
  ) {}

  get count(): number {
    return this.empfaenger.size
  }

  add(e: TsEmpfaenger): void {
    this.empfaenger.add(e)
    // Auch ein Empfänger, den wir selbst trennen, meldet 'close' – gezählt wird nur einmal.
    e.once('close', () => this.remove(e))
    this.onCount(this.empfaenger.size)
  }

  push(chunk: Buffer): void {
    this.bytes += chunk.length
    for (const e of this.empfaenger) {
      if (e.writableLength > MAX_RUECKSTAU) {
        this.remove(e)
        e.destroy()
        continue
      }
      e.write(chunk)
    }
  }

  /** Alle trennen (Stopp, ffmpeg-Fehler) */
  closeAll(): void {
    const alle = [...this.empfaenger]
    this.empfaenger.clear()
    for (const e of alle) e.destroy()
    if (alle.length) this.onCount(0)
  }

  private remove(e: TsEmpfaenger): void {
    if (this.empfaenger.delete(e)) this.onCount(this.empfaenger.size)
  }
}
