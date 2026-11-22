// Weg des Bildes vom Spiegelfenster bis in den main-Prozess (rein, getestet). Der Ton kommt im
// Stream ohne diesen Weg an (Renderzeit aus dem Spiegel, sie folgt der Medien-Uhr), das Bild erst
// mit dem paint im main. Zwei Teile:
// - Übergabe nach der Medien-Uhr: Der Spiegel zeigt ein Bild im Takt seines Fensters, nicht genau
//   dann, wenn es nach der Uhr fällig ist – je Start eine andere Phase, bis zu einem Bild (unter
//   Windows gemessen: −15 … +13 ms). Das meldet der Spiegel je Bild selbst (spaet).
// - paint nach der Übergabe: gemessen am macOS-Runner rund 19 ms, unter Windows 9, unter Linux 4.
// Der Stream legt den Ton um die Summe später – dazu um das Raster von ffmpeg
// (stream/bildRaster.ts) –, damit Lippen und Ton zusammenpassen.
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
/** Erst ab so vielen Proben gilt der Median (rund eine Sekunde Video) */
const MIN_PROBEN = 30

/** Eine Übergabe aus dem Spiegel: Wanduhr (ms) und wie spät gegenüber der Medien-Uhr (ms) */
export type Uebergabe = readonly [zeit: number, spaet: number]

export interface BildwegStand {
  /** Um so viel liegt der Ton später (ms, Median): Übergabe nach der Uhr plus Weg zum paint */
  ms: number
  /** davon der Weg von der Übergabe bis zum paint im main (Median) */
  weg: number
  /** davon die Übergabe nach der Medien-Uhr (Median) */
  spaet: number
  /** 10. und 90. Perzentil der Summe: wie weit die Proben streuen (fürs Protokoll) */
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

interface Probe {
  weg: number
  spaet: number
}

const median = (werte: number[]): number => {
  const s = [...werte].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export class Bildweg {
  private paints: number[] = []
  /** Übergaben, deren paint noch nicht da ist */
  private offen: Uebergabe[] = []
  private proben: Probe[] = []
  private gezaehlt: BildwegZaehler = { paints: 0, uebergaben: 0, verworfen: 0 }

  /** Ein paint kam im main an (Wanduhr in ms) */
  paint(t: number): void {
    this.gezaehlt.paints++
    this.paints.push(t)
    if (this.paints.length > MAX_PAINTS) this.paints.splice(0, this.paints.length - MAX_PAINTS)
    this.aufloesen()
  }

  /** Der Spiegel hat diese Videobilder übergeben (Wanduhr und Verspätung gegen die Medien-Uhr) */
  uebergaben(liste: readonly Uebergabe[]): void {
    this.gezaehlt.uebergaben += liste.length
    this.offen.push(...liste)
    if (this.offen.length > MAX_OFFEN) {
      this.gezaehlt.verworfen += this.offen.length - MAX_OFFEN
      this.offen.splice(0, this.offen.length - MAX_OFFEN)
    }
    this.aufloesen()
  }

  /** Median, seine Teile und die Streuung; null, solange zu wenig gemessen ist */
  get stand(): BildwegStand | null {
    if (this.proben.length < MIN_PROBEN) return null
    const summe = this.proben.map((p) => p.weg + p.spaet).sort((a, b) => a - b)
    const anteil = (a: number): number =>
      summe[Math.min(summe.length - 1, Math.floor(summe.length * a))]
    return {
      ms: anteil(0.5),
      weg: median(this.proben.map((p) => p.weg)),
      spaet: median(this.proben.map((p) => p.spaet)),
      unten: anteil(0.1),
      oben: anteil(0.9),
      proben: summe.length
    }
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
    const rest: Uebergabe[] = []
    for (const u of this.offen) {
      const [p, spaet] = u
      // 1 ms Spiel: Die Wanduhr im main hat ganze ms, die Übergabe Bruchteile. Ohne paint
      // danach wartet die Übergabe – ihr paint kommt noch. Ganze ms genügen (Raster: 33 ms).
      const paint = this.paints.find((t) => t >= p - 1)
      if (paint === undefined) rest.push(u)
      else if (paint - p <= MAX_WEG_MS) {
        this.proben.push({ weg: Math.round(Math.max(0, paint - p)), spaet: Math.round(spaet) })
      } else this.gezaehlt.verworfen++
    }
    this.offen = rest
    if (this.proben.length > MAX_PROBEN) this.proben.splice(0, this.proben.length - MAX_PROBEN)
  }
}
