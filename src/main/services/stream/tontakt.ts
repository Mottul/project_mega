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
// - Die Uhr der Soundkarte läuft nie genau wie die des Rechners. Liegen selbst die pünktlichsten
//   Blöcke eines Fensters zu weit daneben, wird neu angesetzt (Stille eingefügt bzw. verworfen).

export interface TontaktOptionen {
  /** Abtastrate (die des Spiegels: 48 kHz) */
  rate: number
  /** So lange warten wir auf verspätete Blöcke, bevor die Lücke Stille wird (ms) */
  geduldMs: number
  /** Abweichung der pünktlichsten Blöcke von der Uhr, ab der neu angesetzt wird (ms) */
  toleranzMs: number
  /** Über so viele ms wird der pünktlichste Block gesucht – länger als jeder Schub */
  fensterMs: number
  /** So lange nach dem Ansetzen gilt jeder zu frühe Block als besserer Anker (ms) */
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

/** Was von einem Block an ffmpeg geht */
export interface TonPlatz {
  /** Stille vor dem Block (Lücke im Ton) */
  stille: number
  /** ab diesem Sample des Blocks schreiben – davor liegt schon im Strom */
  von: number
  /** so viele Samples des Blocks schreiben (0 = Block liegt ganz in der Vergangenheit) */
  anzahl: number
}

/** Ändert sich der Weg des Bildes um mehr als das, wird neu angesetzt (der Median wackelt) */
const VERZUG_SPRUNG_MS = 3

export class Tontakt {
  /** Samples, die an ffmpeg gingen (= Position im Strom) */
  private geschrieben = 0
  /** Sample-Nummer des Spiegels ↔ Position im Strom */
  private anker: { frame: number; pos: number; seit: number; verzug: number } | null = null
  /** Sample-Nummer hinter dem letzten Block */
  private frameEnde = -1
  private letzteAnkunft = -Infinity
  private letzterTick = -Infinity
  /** Verspätung der letzten Blöcke (Samples) mit Ankunftszeit */
  private verspaetung: { t: number; v: number }[] = []

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
   * `verzugMs`: so viel später einordnen – um so viel kommt das Bild später in den Strom
   * (Spiegel, paint, Raster von ffmpeg; der Sender misst es), der Ton hat diesen Weg nicht.
   * Ändert er sich um mehr als 3 ms, wird neu angesetzt (einmal Stille bzw. ein kurzes Stück
   * weniger).
   */
  block(
    nowMs: number,
    frame: number,
    laenge: number,
    gerendertMs?: number,
    verzugMs = 0
  ): TonPlatz {
    this.letzteAnkunft = nowMs
    const zeit =
      gerendertMs !== undefined &&
      Number.isFinite(gerendertMs) &&
      gerendertMs <= nowMs + 1000 &&
      gerendertMs > nowMs - 10_000
        ? gerendertMs + verzugMs
        : nowMs + verzugMs
    const sollEnde = this.soll(zeit)
    // Kein Anker, oder die Sample-Nummer lief rückwärts (Spiegel neu geladen, neuer
    // Ton-Kontext): Der Block endet jetzt.
    if (
      !this.anker ||
      frame < this.frameEnde ||
      Math.abs(verzugMs - this.anker.verzug) > VERZUG_SPRUNG_MS
    ) {
      this.ansetzen(zeit, frame, sollEnde - laenge, verzugMs)
    }
    let pos = this.position0(frame)
    const v = sollEnde - (pos + laenge)
    const tol = (this.o.toleranzMs * this.o.rate) / 1000
    if (v < 0 && zeit - this.anker!.seit < this.o.einschwingenMs) {
      // Kam der erste Block verspätet, saß der Anker zu spät – ein pünktlicherer verbessert ihn.
      this.ansetzen(zeit, frame, sollEnde - laenge, verzugMs)
      pos = this.position0(frame)
    } else {
      this.verspaetung.push({ t: zeit, v })
      while (this.verspaetung[0].t < zeit - this.o.fensterMs) this.verspaetung.shift()
      const voll = zeit - this.anker!.seit >= this.o.fensterMs
      const minV = Math.min(...this.verspaetung.map((x) => x.v))
      // Selbst der pünktlichste Block des Fensters liegt daneben: Drift oder Lücke der
      // Spiegel-Uhr – neu ansetzen. Ein Schub nach einem Hänger ändert das Minimum nicht.
      if (voll && Math.abs(minV) > tol) {
        this.ansetzen(zeit, frame, sollEnde - laenge, verzugMs)
        pos = this.position0(frame)
      }
    }
    this.frameEnde = frame + laenge
    const stille = Math.max(0, pos - this.geschrieben)
    const von = Math.min(laenge, Math.max(0, this.geschrieben - pos))
    const anzahl = laenge - von
    this.geschrieben = Math.max(this.geschrieben, pos + laenge)
    return { stille, von, anzahl }
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
