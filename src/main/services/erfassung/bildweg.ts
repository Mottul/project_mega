// Weg des Bildes vom Spiegelfenster bis in den main-Prozess (rein, getestet). Der Ton kommt im
// Stream ohne diesen Weg an (Renderzeit aus dem Spiegel), das Bild erst mit dem paint im main –
// gemessen am macOS-Runner rund 19 ms, unter Windows 9, unter Linux 4. Der Stream legt den Ton um
// genau so viel später, damit Lippen und Ton zusammenpassen.
//
// Gemessen wird ohne Bildinhalt: Der Spiegel meldet, wann er ein Videobild übergibt
// (requestVideoFrameCallback, presentationTime), der main merkt sich, wann paints ankommen. Je
// Übergabe zählt der erste paint danach. Die Meldung kommt mit dem nächsten Tonblock, oft bevor
// das Bild als paint da ist – dann wartet sie auf ihn. Ein paint, der fehlt oder sich verspätet
// (Hänger), verschiebt den Median nicht.

/** So viele paints, wartende Übergaben und Proben werden behalten */
const MAX_PAINTS = 240
const MAX_OFFEN = 64
const MAX_PROBEN = 90
/** Ein paint, der später als das nach der Übergabe kommt, gehört nicht zu ihr */
const MAX_WEG_MS = 150
/** Erst ab so vielen Proben gilt der Median */
const MIN_PROBEN = 10

export interface BildwegStand {
  /** Median der Wege in ms */
  ms: number
  /** 10. und 90. Perzentil: wie weit die Proben streuen (fürs Protokoll) */
  unten: number
  oben: number
  proben: number
}

/** Fürs Protokoll, wenn kein Wert zustande kommt: Was kam an, was passte nicht? */
export interface BildwegZaehler {
  paints: number
  uebergaben: number
  /** Übergaben ohne passenden paint (zu spät, oder keiner kam) */
  verworfen: number
}

export class Bildweg {
  private paints: number[] = []
  /** Übergaben, deren paint noch nicht da ist */
  private offen: number[] = []
  private proben: number[] = []
  private gezaehlt: BildwegZaehler = { paints: 0, uebergaben: 0, verworfen: 0 }

  /** Ein paint kam im main an (Wanduhr in ms) */
  paint(t: number): void {
    this.gezaehlt.paints++
    this.paints.push(t)
    if (this.paints.length > MAX_PAINTS) this.paints.splice(0, this.paints.length - MAX_PAINTS)
    this.aufloesen()
  }

  /** Der Spiegel hat zu diesen Zeiten (Wanduhr in ms) Videobilder übergeben */
  uebergaben(zeiten: readonly number[]): void {
    this.gezaehlt.uebergaben += zeiten.length
    this.offen.push(...zeiten)
    if (this.offen.length > MAX_OFFEN) {
      this.gezaehlt.verworfen += this.offen.length - MAX_OFFEN
      this.offen.splice(0, this.offen.length - MAX_OFFEN)
    }
    this.aufloesen()
  }

  /** Median und Streuung; null, solange zu wenig gemessen ist */
  get stand(): BildwegStand | null {
    if (this.proben.length < MIN_PROBEN) return null
    const s = [...this.proben].sort((a, b) => a - b)
    const anteil = (a: number): number => s[Math.min(s.length - 1, Math.floor(s.length * a))]
    return { ms: anteil(0.5), unten: anteil(0.1), oben: anteil(0.9), proben: s.length }
  }

  /** Median der Wege in ms; null, solange zu wenig gemessen ist */
  get ms(): number | null {
    return this.stand?.ms ?? null
  }

  get zaehler(): BildwegZaehler {
    return { ...this.gezaehlt }
  }

  /** Fenster neu (andere Seite, anderer Takt): alte Messungen gelten nicht mehr */
  zuruecksetzen(): void {
    this.paints = []
    this.offen = []
    this.proben = []
    this.gezaehlt = { paints: 0, uebergaben: 0, verworfen: 0 }
  }

  /** Wartende Übergaben ihrem paint zuordnen; kam er zu spät, fällt die Übergabe weg. */
  private aufloesen(): void {
    if (this.paints.length === 0) return
    const rest: number[] = []
    for (const p of this.offen) {
      // 1 ms Spiel: Die Wanduhr im main hat ganze ms, die Übergabe Bruchteile. Ohne paint
      // danach wartet die Übergabe – ihr paint kommt noch.
      const paint = this.paints.find((t) => t >= p - 1)
      if (paint === undefined) rest.push(p)
      else if (paint - p <= MAX_WEG_MS) this.proben.push(Math.max(0, paint - p))
      else this.gezaehlt.verworfen++
    }
    this.offen = rest
    if (this.proben.length > MAX_PROBEN) this.proben.splice(0, this.proben.length - MAX_PROBEN)
  }
}
