// ATEM-Steuerung: Typen und Prüfung. Befehle kommen vom Fenster und später vom Handy und gelten in
// beiden Fällen als fremde Eingabe: Durch kommt nur, was die Allowlist kennt, Feld für Feld gegen
// das geprüft, was der Mischer gemeldet hat (Muster player/remoteCommand.ts). Rein -> testbar.

export const ATEM_STILE = ['mix', 'dip', 'wipe', 'dve', 'sting'] as const
export type AtemStil = (typeof ATEM_STILE)[number]

/** Stile mit einer einfachen Dauer in Bildern; beim Stinger bestimmt der Clip die Länge */
export const ATEM_RATEN_STILE = ['mix', 'dip', 'wipe', 'dve'] as const
export type AtemRatenStil = (typeof ATEM_RATEN_STILE)[number]

/** Die Grenzen des Geräts: Eine Übergangsdauer liegt zwischen 1 und 250 Bildern */
export const ATEM_RATE_MIN = 1
export const ATEM_RATE_MAX = 250
/** Der Hebel läuft von 0 bis 10000, am Ende ist der Übergang fertig */
export const ATEM_HEBEL_MAX = 10000

export const ATEM_SIM_MODELLE = ['mini', 'mini-extreme', 'constellation'] as const
export type AtemSimModell = (typeof ATEM_SIM_MODELLE)[number]

export const ATEM_SIM_NAMEN: Record<AtemSimModell, string> = {
  mini: 'ATEM Mini',
  'mini-extreme': 'ATEM Mini Extreme',
  constellation: 'ATEM Constellation (4 M/E)'
}

/** Wohin verbinden: Adresse eines Mischers (optional mit Port) oder der Probebetrieb */
export type AtemZiel = { host: string } | { simulator: AtemSimModell }

/**
 * - `verbindet`: erster Aufbau, die Bibliothek versucht es laufend weiter
 * - `verloren`: war verbunden, die Bibliothek baut die Verbindung selbst wieder auf
 */
export type AtemPhase = 'getrennt' | 'verbindet' | 'verbunden' | 'verloren'

export interface AtemStatus {
  phase: AtemPhase
  /** Adresse wie gewählt; leer im Probebetrieb */
  host: string
  /** Modell des Probebetriebs; null am echten Mischer */
  simulator: AtemSimModell | null
  /** Modellname, wie der Mischer ihn meldet */
  modell: string | null
  /** Protokollversion, z. B. „2.32“ */
  protokoll: string | null
  /** false = neuer als die Bibliothek: Das Werkzeug warnt, denn das Protokoll ist nachgebaut */
  protokollBekannt: boolean
  fehler: string | null
}

export const ATEM_GETRENNT: AtemStatus = {
  phase: 'getrennt',
  host: '',
  simulator: null,
  modell: null,
  protokoll: null,
  protokollBekannt: true,
  fehler: null
}

export interface AtemQuelle {
  id: number
  kurz: string
  lang: string
  /** Echter Eingang (nicht Schwarz, Farbbalken, Media-Player …) */
  extern: boolean
  /** Bitmaske: Auf welchen M/Es ist die Quelle wählbar? */
  meMaske: number
  /** Bitmaske: Wofür taugt sie sonst, siehe QUELLE_FUER_KEY und QUELLE_FUER_AUX */
  verfuegbar: number
}

/** Bit wie `SourceAvailability.KeySource` der Bibliothek */
export const QUELLE_FUER_KEY = 16
/**
 * Alle AUX-Bits (`Auxiliary`, `Auxiliary1`, `Auxiliary2`, `WebcamOut`). Welches Bit zu welchem Bus
 * gehört, hängt am Modell. Nimmt ein Bus die Quelle nicht, bleibt die Auswahl beim gemeldeten Stand.
 */
export const QUELLE_FUER_AUX = 1 | 32 | 64 | 128

/** Bits des nächsten Übergangs, wie `TransitionSelection` der Bibliothek */
export const ATEM_HINTERGRUND = 1
export const keyerBit = (keyer: number): number => 2 << keyer

export const ATEM_KEY_ARTEN = ['luma', 'chroma', 'pattern', 'dve'] as const
export type AtemKeyArt = (typeof ATEM_KEY_ARTEN)[number]

/** Upstream-Keyer einer M/E */
export interface AtemUsk {
  onAir: boolean
  art: AtemKeyArt
  fill: number
  cut: number
}

/** Downstream-Keyer: hinter den M/Es, deshalb für den ganzen Mischer */
export interface AtemDsk {
  onAir: boolean
  laeuft: boolean
  restBilder: number
  /** Geht mit dem nächsten Übergang mit */
  tie: boolean
  rate: number
  fill: number
  cut: number
}

export interface AtemMakro {
  /** Platz am Mischer, ab 0 */
  index: number
  name: string
  beschreibung: string
}

export interface AtemMakroPlayer {
  laeuft: boolean
  /** Steht an einer Pause und wartet auf „Weiter“ */
  wartet: boolean
  index: number
}

export const ATEM_MEDIEN_ARTEN = ['still', 'clip'] as const
export type AtemMedienArt = (typeof ATEM_MEDIEN_ARTEN)[number]

export interface AtemMedium {
  index: number
  name: string
}

export interface AtemPlayer {
  art: AtemMedienArt
  index: number
  spielt: boolean
  schleife: boolean
  amAnfang: boolean
}

export interface AtemMedien {
  /** Nur belegte Plätze */
  stills: AtemMedium[]
  clips: AtemMedium[]
  player: AtemPlayer[]
}

export interface AtemAux {
  name: string
  quelle: number
}

export interface AtemFtb {
  schwarz: boolean
  laeuft: boolean
  restBilder: number
  rate: number
}

export interface AtemMe {
  programm: number
  vorschau: number
  /** Stil des nächsten Übergangs */
  stil: AtemStil
  /** Dauer in Bildern je Stil, soweit gemeldet */
  raten: Partial<Record<AtemRatenStil, number>>
  /** 0…ATEM_HEBEL_MAX, in Richtung des laufenden Übergangs */
  hebel: number
  uebergang: boolean
  restBilder: number
  /** Ruhelage des Hebels auf dem Bildschirm: oben oder unten (siehe atemHebel.ts) */
  hebelOben: boolean
  ftb: AtemFtb
  keyer: AtemUsk[]
  /** Was der nächste Übergang mitnimmt: Bitmaske aus ATEM_HINTERGRUND und keyerBit */
  naechster: number
}

/** Was die Fenster sehen: verdichtet, der volle Mischer-Zustand ist groß und ändert sich laufend */
export interface AtemView {
  quellen: AtemQuelle[]
  mes: AtemMe[]
  /** Was der Mischer kann; anderes erscheint nicht */
  stile: AtemStil[]
  /** Vollbilder je Sekunde, nur für die Anzeige der Dauer in Sekunden */
  bildrate: number | null
  dsk: AtemDsk[]
  /** Belegte Makros */
  makros: AtemMakro[]
  /** Plätze für Makros am Mischer: 0 = kann keine */
  makroPlaetze: number
  makroPlayer: AtemMakroPlayer
  medien: AtemMedien
  aux: AtemAux[]
}

export type AtemCommand =
  | { type: 'programm' | 'vorschau'; me: number; quelle: number }
  | { type: 'cut' | 'auto' | 'ftb'; me: number }
  | { type: 'ftbRate'; me: number; bilder: number }
  | { type: 'stil'; me: number; stil: AtemStil }
  | { type: 'rate'; me: number; stil: AtemRatenStil; bilder: number }
  | { type: 'hebel'; me: number; wert: number }
  | { type: 'uskOnAir'; me: number; keyer: number; an: boolean }
  | { type: 'uskQuelle'; me: number; keyer: number; art: AtemKeyQuelle; quelle: number }
  | { type: 'naechster'; me: number; maske: number }
  | { type: 'dskOnAir' | 'dskTie'; keyer: number; an: boolean }
  | { type: 'dskAuto'; keyer: number }
  | { type: 'dskRate'; keyer: number; bilder: number }
  | { type: 'dskQuelle'; keyer: number; art: AtemKeyQuelle; quelle: number }
  | { type: 'makroStart'; index: number }
  | { type: 'makroStopp' | 'makroWeiter' }
  | { type: 'mediaQuelle'; player: number; art: AtemMedienArt; index: number }
  | { type: 'clipSpielen' | 'clipSchleife'; player: number; an: boolean }
  | { type: 'clipAnfang'; player: number }
  | { type: 'aux'; bus: number; quelle: number }

const KEY_QUELLEN = ['fill', 'cut'] as const
export type AtemKeyQuelle = (typeof KEY_QUELLEN)[number]

const istGanz = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

function einerVon<T extends string>(liste: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (liste as readonly string[]).includes(v) ? (v as T) : null
}

/** Ist die Quelle auf dieser M/E wählbar? */
export function quelleAufMe(q: AtemQuelle, me: number): boolean {
  return (q.meMaske & (1 << me)) !== 0
}

/** Quelle per Kennung, wenn sie für den Zweck taugt */
function quelleMit(view: AtemView, id: unknown, bits: number): number | null {
  const q = view.quellen.find((x) => x.id === id && (x.verfuegbar & bits) !== 0)
  return q ? q.id : null
}

/** Stelle in einer Liste des Mischers: nur, was er gemeldet hat */
const stelle = (v: unknown, laenge: number): number | null =>
  istGanz(v) && v >= 0 && v < laenge ? v : null

/** Befehle, die für den ganzen Mischer gelten */
function befehlOhneMe(c: Record<string, unknown>, view: AtemView): AtemCommand | null {
  const type = c.type
  const dsk = stelle(c.keyer, view.dsk.length)
  const player = stelle(c.player, view.medien.player.length)
  switch (type) {
    case 'dskOnAir':
    case 'dskTie':
      return dsk !== null && typeof c.an === 'boolean' ? { type, keyer: dsk, an: c.an } : null
    case 'dskAuto':
      return dsk !== null ? { type, keyer: dsk } : null
    case 'dskRate':
      return dsk !== null && bilderOk(c.bilder) ? { type, keyer: dsk, bilder: c.bilder } : null
    case 'dskQuelle': {
      const art = einerVon(KEY_QUELLEN, c.art)
      const quelle = quelleMit(view, c.quelle, QUELLE_FUER_KEY)
      return dsk !== null && art && quelle !== null ? { type, keyer: dsk, art, quelle } : null
    }
    case 'makroStart': {
      const makro = view.makros.find((m) => m.index === c.index)
      return makro ? { type, index: makro.index } : null
    }
    case 'makroStopp':
    case 'makroWeiter':
      return { type }
    case 'mediaQuelle': {
      const art = einerVon(ATEM_MEDIEN_ARTEN, c.art)
      if (player === null || !art) return null
      const pool = art === 'still' ? view.medien.stills : view.medien.clips
      const medium = pool.find((m) => m.index === c.index)
      return medium ? { type, player, art, index: medium.index } : null
    }
    case 'clipSpielen':
    case 'clipSchleife':
      return player !== null && typeof c.an === 'boolean' ? { type, player, an: c.an } : null
    case 'clipAnfang':
      return player !== null ? { type, player } : null
    case 'aux': {
      const bus = stelle(c.bus, view.aux.length)
      const quelle = quelleMit(view, c.quelle, QUELLE_FUER_AUX)
      return bus !== null && quelle !== null ? { type, bus, quelle } : null
    }
    default:
      return null
  }
}

/**
 * Prüft einen Befehl gegen den Stand des Mischers: vorhandene M/E, Keyer und Quelle, Stil, den das
 * Gerät kann, Dauer und Hebel in den Grenzen. null = abgelehnt, nichts geht zum Gerät.
 */
export function atemCommand(roh: unknown, view: AtemView): AtemCommand | null {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null
  const c = roh as Record<string, unknown>
  const me = c.me
  if (me === undefined) return befehlOhneMe(c, view)
  if (!istGanz(me) || me < 0 || me >= view.mes.length) return null
  const type = c.type
  const keyer = stelle(c.keyer, view.mes[me].keyer.length)
  switch (type) {
    case 'uskOnAir':
      return keyer !== null && typeof c.an === 'boolean' ? { type, me, keyer, an: c.an } : null
    case 'uskQuelle': {
      const art = einerVon(KEY_QUELLEN, c.art)
      const quelle = quelleMit(view, c.quelle, QUELLE_FUER_KEY)
      return keyer !== null && art && quelle !== null ? { type, me, keyer, art, quelle } : null
    }
    case 'naechster': {
      // Ohne Auswahl gäbe es nichts zu überblenden, das lässt auch der Mischer nicht zu
      const hoechste = (ATEM_HINTERGRUND | (keyerBit(view.mes[me].keyer.length) - 2)) >>> 0
      return istGanz(c.maske) && c.maske > 0 && (c.maske & ~hoechste) === 0
        ? { type, me, maske: c.maske }
        : null
    }
    case 'programm':
    case 'vorschau': {
      const quelle = view.quellen.find((q) => q.id === c.quelle && quelleAufMe(q, me))
      return quelle ? { type, me, quelle: quelle.id } : null
    }
    case 'cut':
    case 'auto':
    case 'ftb':
      return { type, me }
    case 'ftbRate':
      return bilderOk(c.bilder) ? { type, me, bilder: c.bilder } : null
    case 'stil': {
      const stil = einerVon(view.stile, c.stil)
      return stil ? { type, me, stil } : null
    }
    case 'rate': {
      const stil = einerVon(ATEM_RATEN_STILE, c.stil)
      if (!stil || !view.stile.includes(stil) || !bilderOk(c.bilder)) return null
      return { type, me, stil, bilder: c.bilder }
    }
    case 'hebel':
      return istGanz(c.wert) && c.wert >= 0 && c.wert <= ATEM_HEBEL_MAX
        ? { type, me, wert: c.wert }
        : null
    default:
      return null
  }
}

function bilderOk(v: unknown): v is number {
  return istGanz(v) && v >= ATEM_RATE_MIN && v <= ATEM_RATE_MAX
}

/** Hostname oder IPv4 mit optionalem Port; das Protokoll läuft nur über IPv4 */
const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,252})(?::(\d{1,5}))?$/

export function atemZiel(roh: unknown): AtemZiel | null {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null
  const c = roh as Record<string, unknown>
  if ('simulator' in c) {
    const simulator = einerVon(ATEM_SIM_MODELLE, c.simulator)
    return simulator ? { simulator } : null
  }
  if (typeof c.host !== 'string') return null
  const host = c.host.trim()
  const m = HOST.exec(host)
  if (!m) return null
  if (m[1] !== undefined) {
    const port = Number(m[1])
    if (port < 1 || port > 65535) return null
  }
  return { host }
}

/** „192.168.1.240:9910“ -> Adresse und Port; `atemZiel` hat die Form schon geprüft */
export function hostUndPort(host: string): { adresse: string; port: number | undefined } {
  const i = host.lastIndexOf(':')
  return i < 0
    ? { adresse: host, port: undefined }
    : { adresse: host.slice(0, i), port: Number(host.slice(i + 1)) }
}

/** Dauer für die Anzeige: Am ATEM gelten Bilder, die Sekunden hängen von der Bildrate ab */
export function bilderInSekunden(bilder: number, bildrate: number | null): string | null {
  if (!bildrate) return null
  return `${(bilder / bildrate).toFixed(2).replace('.', ',')} s`
}
