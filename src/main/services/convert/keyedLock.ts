// Sperre je Schlüssel: Aufträge mit gleichem Schlüssel laufen nacheinander, alle anderen
// parallel. Genutzt vom Player-Import: dieselbe Quelle darf nie gleichzeitig eingebacken
// werden (Doppel-Erkennung und „Neu einbacken“ lesen den Bibliotheksstand).

export class KeyedLock {
  private held = new Map<string, Promise<void>>()

  /** Wartet, bis der Schlüssel frei ist; liefert die Freigabe. */
  async acquire(key: string): Promise<() => void> {
    for (let busy = this.held.get(key); busy; busy = this.held.get(key)) await busy
    let release!: () => void
    this.held.set(
      key,
      new Promise<void>((r) => {
        release = r
      })
    )
    return () => {
      this.held.delete(key)
      release()
    }
  }

  isHeld(key: string): boolean {
    return this.held.has(key)
  }
}
