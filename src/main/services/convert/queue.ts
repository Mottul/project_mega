// Gemeinsame Warteschlange für Konvertierungen. Zwei Spuren: Der Player-Import hat eine
// eigene (wartet nie auf einen langen Konverter-Stapel – die Show-Vorbereitung geht
// vor), der Video-Konverter so viele, wie der Nutzer parallel erlaubt.
// Aufträge mit gleichem Sperr-Schlüssel laufen nie gleichzeitig: Der wartende bleibt in der
// Schlange (abbrechbar, belegt keinen Platz), andere Aufträge ziehen an ihm vorbei.

export type Lane = 'player' | 'converter'

interface Entry {
  id: string
  lane: Lane
  start: () => Promise<void>
  key?: string
}

export class ConvertQueue {
  private waiting: Entry[] = []
  private running = new Map<string, Lane>()
  private busyKeys = new Set<string>()
  private limits: Record<Lane, number> = { player: 1, converter: 1 }

  setLimit(lane: Lane, n: number): void {
    this.limits[lane] = Math.max(1, Math.min(8, Math.round(n) || 1))
    this.pump()
  }

  /**
   * Auftrag einreihen; start() läuft, sobald in seiner Spur ein Platz frei ist und kein
   * Auftrag mit demselben `key` läuft.
   */
  add(id: string, lane: Lane, start: () => Promise<void>, key?: string): void {
    this.waiting.push({ id, lane, start, key })
    this.pump()
  }

  /** Noch nicht gestarteten Auftrag entfernen. false = läuft bereits oder unbekannt. */
  remove(id: string): boolean {
    const i = this.waiting.findIndex((e) => e.id === id)
    if (i < 0) return false
    this.waiting.splice(i, 1)
    return true
  }

  runningCount(lane: Lane): number {
    let n = 0
    for (const l of this.running.values()) if (l === lane) n++
    return n
  }

  private pump(): void {
    for (let i = 0; i < this.waiting.length;) {
      const e = this.waiting[i]
      if (
        this.runningCount(e.lane) >= this.limits[e.lane] ||
        (e.key !== undefined && this.busyKeys.has(e.key))
      ) {
        i++
        continue
      }
      this.waiting.splice(i, 1)
      this.running.set(e.id, e.lane)
      if (e.key !== undefined) this.busyKeys.add(e.key)
      // Fehler behandelt der Auftraggeber selbst; die Schlange darf nie hängen bleiben
      void Promise.resolve()
        .then(e.start)
        .catch(() => {})
        .finally(() => {
          this.running.delete(e.id)
          if (e.key !== undefined) this.busyKeys.delete(e.key)
          this.pump()
        })
    }
  }
}

export const convertQueue = new ConvertQueue()
