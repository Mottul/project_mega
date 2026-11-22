// Zeitachse des Tons im Stream (rein, getestet). ffmpeg bekommt den Ton ohne Zeitstempel, Sample
// für Sample, und legt ihn per asetpts auf die Uhr: Sample n liegt bei Start + n / Rate – auf
// derselben Uhr wie die Bilder (Wanduhr-Stempel). Deshalb muss jedes Sample an der richtigen
// Stelle landen, und das entscheidet dieser Takt:
//
// - Die Blöcke des Spiegels tragen ihre Sample-Nummer (currentFrame im AudioWorklet). Sie kommen
//   in Schüben: Hängt der main-Prozess, stauen sie sich und kommen auf einmal. Nach ihrer Nummer
//   eingeordnet, bleiben sie trotzdem lückenlos an ihrem Platz – ffmpeg mit Wanduhr-Stempeln am
//   Ton konnte das nicht unterscheiden (Labor: bis 44 ms Versatz nach Hängern).
// - Fehlen Blöcke (Ton aus, Spiegel lädt neu), wird die Lücke nach einer Geduld zu Stille – ffmpeg
//   wartet sonst auf den Ton und hält auch das Bild an.
// - Die Uhr der Soundkarte läuft nie genau wie die des Rechners. Liegen die Blöcke eines Fensters
//   zu weit daneben, wird nachgeführt (Stille eingefügt bzw. verworfen).
// - Mit Renderzeit aus dem Spiegel zählt dabei der Median der Blöcke, nie ein einzelner: Holt der
//   Ton-Thread nach einem Stocken auf, steht ctx.currentTime schon weiter, und der Spiegel meldet
//   die Blöcke des Schubs zu früh (macOS-Runner: ein Blitz −126 ms, main f810d49). Nach dem
//   pünktlichsten Block ausgerichtet, wurde genau so ein Block zum Anker. Ohne Renderzeit (nur
//   Ankunft) kommen Blöcke dagegen nur zu spät – dort bleibt der pünktlichste maßgeblich.
// - Ändert sich der Weg des Bildes, rückt der Anker um genau die Änderung; die Zeitbasis bleibt.

export interface TontaktOptionen {
  /** Abtastrate (die des Spiegels: 48 kHz) */
  rate: number
  /** So lange warten wir auf verspätete Blöcke, bevor die Lücke Stille wird (ms) */
  geduldMs: number
  /** Abweichung der Blöcke von der Uhr, ab der nachgeführt wird (ms; mit Renderzeit der Median,
   *  sonst der pünktlichste Block) */
  toleranzMs: number
  /** Über so viele ms wird verglichen – länger als jeder Schub */
  fensterMs: number
  /** So lange nach dem Ansetzen wird genau nachgeführt (ms): mit Renderzeit schon ab 3 ms im
   *  Median, sonst gilt jeder zu frühe Block als besserer Anker */
  einschwingenMs: number
  /** Ton so viel später einordnen (ms): Ein Bild kommt erst nach dem Zeichnen beim Sender an */
  verzugMs: number
}

export const TONTAKT_VORGABE: TontaktOptionen = {
  rate: 48000,
  geduldMs: 200,
  toleranzMs: 40,
  fensterMs: 1500,
  einschwingenMs: 2000,
  verzugMs: 0
}

/** Der Anker hat sich bewegt (fürs Protokoll des Senders) */
export interface TonEreignis {
  /**
   * angesetzt: erster Block oder Spiegel neu geladen; weg: Weg des Bildes geändert;
   * nachgefuehrt: die Blöcke lagen daneben (Einschwingen, Uhr der Soundkarte)
   */
  art: 'angesetzt' | 'weg' | 'nachgefuehrt'
  /** um so viel liegt der Ton jetzt später (ms, negativ: früher) */
  umMs: number
}

/** Was von einem Block an ffmpeg geht */
export interface TonPlatz {
  /** Stille vor dem Block (Lücke im Ton) */
  stille: number
  /** ab diesem Sample des Blocks schreiben – davor liegt schon im Strom */
  von: number
  /** so viele Samples des Blocks schreiben (0 = Block liegt ganz in der Vergangenheit) */
  anzahl: number
  ereignis?: TonEreignis
  /** Renderzeit dieses Blocks lag so weit vor dem Median (ms) – nicht übernommen */
  ausreisserMs?: number
}

/** Ändert sich der Weg des Bildes um mehr als das, rückt der Ton (der Median wackelt) */
const VERZUG_SPRUNG_MS = 3
/** Ab so vielen Blöcken im Fenster gilt der Median (eine Viertelsekunde) */
const MIN_BLOECKE = 8
/** Beim Einschwingen wird schon ab so viel Abweichung im Median nachgeführt (ms) */
const EINSCHWINGEN_GENAU_MS = 3
/** Renderzeit so weit vor dem Median (ms): Ausreißer, fürs Protokoll */
const AUSREISSER_MS = 25

const median = (werte: number[]): number => {
  const s = [...werte].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export class Tontakt {
  /** Samples, die an ffmpeg gingen (= Position im Strom) */
  private geschrieben = 0
  /** Sample-Nummer des Spiegels ↔ Position im Strom */
  private anker: { frame: number; pos: number; seit: number; verzug: number } | null = null
  /** Sample-Nummer hinter dem letzten Block */
  private frameEnde = -1
  private letzteAnkunft = -Infinity
  private letzterTick = -Infinity
  /** Verspätung der letzten Blöcke gegen den Anker (Samples) mit ihrer Zeit */
  private verspaetung: { t: number; v: number }[] = []
  /** Die Blöcke bringen Renderzeiten mit: Median statt des pünktlichsten Blocks */
  private mitRenderzeit = false

  constructor(
    /** Wanduhr (ms) bei Position 0 – dieselbe Zeit bekommt ffmpeg für asetpts */
    private readonly startMs: number,
    private readonly o: TontaktOptionen = TONTAKT_VORGABE
  ) {}

  get position(): number {
    return this.geschrieben
  }

  /** Wo der Strom nach der Uhr gerade steht (Samples seit dem Start) */
  soll(nowMs: number): number {
    return Math.max(0, Math.floor(((nowMs - this.startMs - this.o.verzugMs) * this.o.rate) / 1000))
  }

  /** ffmpeg hat sich verbunden: Stille für die Zeit seit dem Start (es las erst das Bild). */
  beginn(nowMs: number): number {
    return this.auffuellen(this.soll(nowMs))
  }

  /**
   * Ein Block des Spiegels kam an: wohin er gehört und was davon an ffmpeg geht. `gerendertMs`:
   * Wanduhr, zu der der Spiegel das Ende des Blocks gerendert hat (aus `ctx.currentTime`
   * zurückgerechnet). Sie kennt keinen Verzug durch IPC oder einen beschäftigten main-Prozess –
   * nach der Ankunft eingeordnet, saß der Anker nach einem zähen Start bis 25 ms zu spät und blieb
   * dort. Fehlt sie oder ist sie nicht glaubhaft, gilt die Ankunft.
   * Einzelne Blöcke mit zu früher Renderzeit (Schub des Ton-Threads) zählen nicht: Es gilt der
   * Median des Fensters.
   * `verzugMs`: so viel später einordnen – um so viel kommt das Bild später in den Strom
   * (Spiegel, paint, Raster von ffmpeg; der Sender misst es), der Ton hat diesen Weg nicht.
   * Ändert er sich um mehr als 3 ms, rückt der Ton um genau die Änderung (einmal Stille bzw. ein
   * kurzes Stück weniger) – ein neues Ansetzen nähme die Zeit dieses einen Blocks, samt Fehler.
   */
  block(
    nowMs: number,
    frame: number,
    laenge: number,
    gerendertMs?: number,
    verzugMs = 0
  ): TonPlatz {
    this.letzteAnkunft = nowMs
    const ausRender =
      gerendertMs !== undefined &&
      Number.isFinite(gerendertMs) &&
      gerendertMs <= nowMs + 1000 &&
      gerendertMs > nowMs - 10_000
    if (ausRender) this.mitRenderzeit = true
    const zeit = (ausRender ? gerendertMs : nowMs) + verzugMs
    const sollEnde = this.soll(zeit)
    let ereignis: TonEreignis | undefined
    let ausreisserMs: number | undefined
    if (!this.anker || frame < this.frameEnde) {
      // Kein Anker, oder die Sample-Nummer lief rückwärts (Spiegel neu geladen, neuer
      // Ton-Kontext): Der Block endet jetzt.
      this.ansetzen(zeit, frame, sollEnde - laenge, verzugMs)
      ereignis = { art: 'angesetzt', umMs: 0 }
    } else {
      const anker = this.anker
      if (Math.abs(verzugMs - anker.verzug) > VERZUG_SPRUNG_MS) {
        // Die Verspätungen im Fenster bleiben gültig: Uhr und Platz rücken um dasselbe.
        const um = Math.round(((verzugMs - anker.verzug) * this.o.rate) / 1000)
        anker.pos += um
        anker.verzug = verzugMs
        ereignis = { art: 'weg', umMs: this.ms(um) }
      }
      const v = sollEnde - (this.position0(frame) + laenge)
      const vorher = this.position0(frame)
      if (this.mitRenderzeit) ausreisserMs = this.nachMedian(zeit, v)
      else this.nachPuenktlichstem(zeit, frame, sollEnde - laenge, verzugMs, v)
      const um = this.position0(frame) - vorher
      if (um !== 0) ereignis = { art: 'nachgefuehrt', umMs: this.ms(um) }
    }
    const pos = this.position0(frame)
    this.frameEnde = frame + laenge
    const stille = Math.max(0, pos - this.geschrieben)
    const von = Math.min(laenge, Math.max(0, this.geschrieben - pos))
    const anzahl = laenge - von
    this.geschrieben = Math.max(this.geschrieben, pos + laenge)
    const platz: TonPlatz = { stille, von, anzahl }
    if (ereignis) platz.ereignis = ereignis
    if (ausreisserMs !== undefined) platz.ausreisserMs = ausreisserMs
    return platz
  }

  /**
   * Mit Renderzeit: Liegen die Blöcke des Fensters im Median daneben – beim Einschwingen schon
   * um wenige ms, danach über die Toleranz (Gang der Soundkarte) –, rückt der Anker um den
   * Median. Liefert, wie weit dieser Block vor dem Median lag, wenn er ein Ausreißer ist.
   */
  private nachMedian(zeit: number, v: number): number | undefined {
    const fenster = this.verspaetung
    fenster.push({ t: zeit, v })
    while (fenster[0].t < zeit - this.o.fensterMs) fenster.shift()
    if (fenster.length < MIN_BLOECKE) return undefined
    const m = median(fenster.map((x) => x.v))
    const vorMedian = this.ms(m - v)
    const genauMs =
      zeit - this.anker!.seit < this.o.einschwingenMs ? EINSCHWINGEN_GENAU_MS : this.o.toleranzMs
    if (Math.abs(this.ms(m)) > genauMs) {
      this.anker!.pos += m
      for (const x of fenster) x.v -= m
    }
    return vorMedian >= AUSREISSER_MS ? Math.round(vorMedian) : undefined
  }

  /**
   * Nur Ankunftszeiten: Blöcke kommen höchstens zu spät (Hänger, IPC) – der pünktlichste zählt.
   * Kam der erste verspätet, verbessert ein pünktlicherer den Anker; liegt selbst der
   * pünktlichste des Fensters über der Toleranz daneben, wird neu angesetzt.
   */
  private nachPuenktlichstem(
    zeit: number,
    frame: number,
    pos: number,
    verzugMs: number,
    v: number
  ): void {
    if (v < 0 && zeit - this.anker!.seit < this.o.einschwingenMs) {
      this.ansetzen(zeit, frame, pos, verzugMs)
      return
    }
    this.verspaetung.push({ t: zeit, v })
    while (this.verspaetung[0].t < zeit - this.o.fensterMs) this.verspaetung.shift()
    const voll = zeit - this.anker!.seit >= this.o.fensterMs
    const minV = Math.min(...this.verspaetung.map((x) => x.v))
    // Ein Schub nach einem Hänger ändert das Minimum nicht.
    if (voll && Math.abs(minV) > (this.o.toleranzMs * this.o.rate) / 1000) {
      this.ansetzen(zeit, frame, pos, verzugMs)
    }
  }

  private ms(samples: number): number {
    return (samples * 1000) / this.o.rate
  }

  /**
   * Takt ohne Block: Kam länger als die Geduld nichts, Stille bis kurz vor die Uhr. Kam der Takt
   * selbst verspätet, hing der main-Prozess – dann erst die gestauten Blöcke annehmen, sonst
   * ersetzte Stille den Ton, der gleich kommt.
   */
  tick(nowMs: number, intervallMs: number): number {
    const verspaetet = nowMs - this.letzterTick > 3 * intervallMs
    this.letzterTick = nowMs
    if (verspaetet || nowMs - this.letzteAnkunft < this.o.geduldMs) return 0
    return this.auffuellen(this.soll(nowMs - this.o.geduldMs))
  }

  private position0(frame: number): number {
    return this.anker!.pos + (frame - this.anker!.frame)
  }

  private ansetzen(nowMs: number, frame: number, pos: number, verzug: number): void {
    this.anker = { frame, pos, seit: nowMs, verzug }
    // Der Block, an dem angesetzt wird, ist per Definition pünktlich.
    this.verspaetung = [{ t: nowMs, v: 0 }]
  }

  private auffuellen(ziel: number): number {
    const n = Math.max(0, ziel - this.geschrieben)
    this.geschrieben += n
    return n
  }
}
