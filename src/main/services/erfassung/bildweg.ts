// Weg des Bildes vom Spiegelfenster bis in den main-Prozess (rein, getestet). Der Ton kommt im
// Stream ohne diesen Weg an (Renderzeit aus dem Spiegel), das Bild erst mit dem paint im main –
// gemessen am macOS-Runner rund 19 ms, unter Windows 9, unter Linux 4. Der Stream legt den Ton um
// genau so viel später, damit Lippen und Ton zusammenpassen.
//
// Gemessen wird ohne Bildinhalt: Der Spiegel meldet, wann er ein Videobild übergibt
// (requestVideoFrameCallback, presentationTime), der main merkt sich, wann paints ankommen. Je
// Übergabe zählt der erste paint danach. Ein paint, der fehlt oder sich verspätet (Hänger),
// verschiebt den Median nicht.

/** So viele paints und Proben werden behalten */
const MAX_PAINTS = 240
const MAX_PROBEN = 90
/** Ein paint, der später als das nach der Übergabe kommt, gehört nicht zu ihr */
const MAX_WEG_MS = 150
/** Erst ab so vielen Proben gilt der Median */
const MIN_PROBEN = 10

export class Bildweg {
  private paints: number[] = []
  private proben: number[] = []

  /** Ein paint kam im main an (Wanduhr in ms) */
  paint(t: number): void {
    this.paints.push(t)
    if (this.paints.length > MAX_PAINTS) this.paints.splice(0, this.paints.length - MAX_PAINTS)
  }

  /** Der Spiegel hat zu diesen Zeiten (Wanduhr in ms) Videobilder übergeben */
  uebergaben(zeiten: readonly number[]): void {
    for (const p of zeiten) {
      const paint = this.paints.find((t) => t >= p - 1)
      if (paint === undefined || paint - p > MAX_WEG_MS) continue
      this.proben.push(Math.max(0, paint - p))
    }
    if (this.proben.length > MAX_PROBEN) this.proben.splice(0, this.proben.length - MAX_PROBEN)
  }

  /** Median der Wege in ms; null, solange zu wenig gemessen ist */
  get ms(): number | null {
    if (this.proben.length < MIN_PROBEN) return null
    const s = [...this.proben].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }

  /** Fenster neu (andere Seite, anderer Takt): alte Messungen gelten nicht mehr */
  zuruecksetzen(): void {
    this.paints = []
    this.proben = []
  }
}
