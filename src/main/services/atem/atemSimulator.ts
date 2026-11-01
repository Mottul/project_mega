// Probebetrieb: dieselbe Schnittstelle wie die echte Verbindung, ohne Gerät. Führt Befehle aus und
// meldet den neuen Zustand, Übergänge laufen Bild für Bild wie am Mischer. So lassen sich Bedienung
// und Oberfläche für jede Mischer-Größe üben und bauen. Das Protokoll prüft er nicht: Dafür gibt es
// den Schein-Mischer der E2E-Tests und die Abnahme am Gerät.

import {
  ATEM_HEBEL_MAX,
  ATEM_HINTERGRUND,
  ATEM_SIM_NAMEN,
  bilderJeSchritt,
  keyerBit,
  QUELLE_FUER_AUX,
  QUELLE_FUER_KEY,
  type AtemCommand,
  type AtemRatenStil,
  type AtemSimModell
} from '@shared/atem'
import {
  bildrateAusModus,
  STIL_NACH_NUMMER,
  type AtemRoh,
  type AtemRohDsk,
  type AtemRohMe,
  type AtemRohQuelle,
  type AtemRohUsk
} from '@shared/atemView'
import type { AtemMeldungen, AtemVerbindung } from './atemVerbindung'

/** Werte wie `InternalPortType`, `VideoMode` und `MediaSourceType` der Bibliothek */
const PORT = {
  extern: 0,
  schwarz: 1,
  balken: 2,
  farbe: 3,
  media: 4,
  mediaKey: 5,
  supersource: 6
} as const
const MODUS_1080P25 = 10
const MODUS_1080P50 = 12
const MODUS_4K50 = 18
const MEDIEN_STILL = 1
const MEDIEN_CLIP = 2
const VERSION = 131104
/** So lange dauert der Verbindungsaufbau, spürbar wie am Gerät */
const AUFBAU_MS = 150
/** So lange läuft ein Makro im Probebetrieb */
const MAKRO_MS = 1000
/** Dieses Makro hält an einer Pause an, bis „Weiter“ kommt: Platz 3, siehe MAKROS */
const MAKRO_MIT_PAUSE = 3

const MAKROS = ['Interview', 'Bild im Bild', 'Abspann', 'Mit Pause']
const STILLS = ['Logo', 'Bauchbinde', 'Pausenbild']
const CLIPS = ['Opener', 'Trenner']

interface SimDaten {
  eingaenge: number
  mes: number
  /** Upstream-Keyer je M/E */
  keyer: number
  dsk: number
  dves: number
  stingers: number
  supersource: boolean
  aux: number
  player: number
  /** Modelle der Mini-Reihe kennen nur Standbilder */
  clips: boolean
  makroPlaetze: number
  modus: number
}

const DATEN: Record<AtemSimModell, SimDaten> = {
  mini: {
    eingaenge: 4,
    mes: 1,
    keyer: 1,
    dsk: 1,
    dves: 1,
    stingers: 0,
    supersource: false,
    aux: 1,
    player: 1,
    clips: false,
    makroPlaetze: 100,
    modus: MODUS_1080P25
  },
  'mini-extreme': {
    eingaenge: 8,
    mes: 1,
    keyer: 4,
    dsk: 2,
    dves: 2,
    stingers: 0,
    supersource: true,
    aux: 2,
    player: 2,
    clips: false,
    makroPlaetze: 100,
    modus: MODUS_1080P50
  },
  constellation: {
    eingaenge: 40,
    mes: 4,
    keyer: 4,
    dsk: 4,
    dves: 4,
    stingers: 4,
    supersource: true,
    aux: 6,
    player: 4,
    clips: true,
    makroPlaetze: 100,
    modus: MODUS_4K50
  }
}

const quelle = (
  inputId: number,
  longName: string,
  shortName: string,
  internalPortType: number,
  meAvailability: number,
  sourceAvailability = QUELLE_FUER_KEY | QUELLE_FUER_AUX
): AtemRohQuelle => ({
  inputId,
  longName,
  shortName,
  internalPortType,
  meAvailability,
  sourceAvailability
})

function quellenFuer(d: SimDaten): Record<number, AtemRohQuelle> {
  const alleMes = (1 << d.mes) - 1
  const liste = [
    ...Array.from({ length: d.eingaenge }, (_, i) =>
      quelle(i + 1, `Kamera ${i + 1}`, `CAM${i + 1}`, PORT.extern, alleMes)
    ),
    quelle(0, 'Schwarz', 'BLK', PORT.schwarz, alleMes),
    quelle(1000, 'Farbbalken', 'BARS', PORT.balken, alleMes),
    quelle(2001, 'Farbe 1', 'COL1', PORT.farbe, alleMes),
    quelle(2002, 'Farbe 2', 'COL2', PORT.farbe, alleMes),
    quelle(3010, 'Media-Player 1', 'MP1', PORT.media, alleMes),
    quelle(3011, 'Media-Player 1 Key', 'MP1K', PORT.mediaKey, alleMes),
    quelle(3020, 'Media-Player 2', 'MP2', PORT.media, alleMes),
    quelle(3021, 'Media-Player 2 Key', 'MP2K', PORT.mediaKey, alleMes)
  ]
  if (d.supersource) liste.push(quelle(6000, 'SuperSource', 'SSRC', PORT.supersource, alleMes))
  return Object.fromEntries(liste.map((q) => [q.inputId, q]))
}

function uskStart(): AtemRohUsk {
  return { onAir: false, mixEffectKeyType: 0, fillSource: 3010, cutSource: 3011 }
}

function dskStart(): AtemRohDsk {
  return {
    onAir: false,
    inTransition: false,
    remainingFrames: 0,
    sources: { fillSource: 3010, cutSource: 3011 },
    properties: { tie: false, rate: 25 }
  }
}

function meStart(d: SimDaten): AtemRohMe {
  return {
    programInput: 1,
    previewInput: 2,
    transitionPosition: { inTransition: false, remainingFrames: 0, handlePosition: 0 },
    transitionProperties: { nextStyle: 0, nextSelection: [ATEM_HINTERGRUND] },
    transitionSettings: {
      mix: { rate: 25 },
      dip: { rate: 25 },
      wipe: { rate: 25 },
      ...(d.dves > 0 ? { DVE: { rate: 25 } } : {})
    },
    fadeToBlack: { isFullyBlack: false, inTransition: false, remainingFrames: 0, rate: 25 },
    upstreamKeyers: Array.from({ length: d.keyer }, uskStart)
  }
}

function medienStart(d: SimDaten): AtemRoh['media'] {
  return {
    stillPool: STILLS.map((fileName) => ({ isUsed: true, fileName })),
    clipPool: d.clips ? CLIPS.map((name) => ({ isUsed: true, name })) : [],
    players: Array.from({ length: d.player }, () => ({
      sourceType: MEDIEN_STILL,
      stillIndex: 0,
      clipIndex: 0,
      playing: false,
      loop: false,
      atBeginning: true
    }))
  }
}

/** Ein laufender Übergang oder Fade to Black in Bildern */
interface Lauf {
  gesamt: number
  rest: number
  /** Hebel-Wert, bei dem er begonnen hat: Auto kann einen halb geschobenen Hebel fertigfahren */
  von: number
}

/** Dauer des Stils, den der nächste Übergang nimmt. Der Stinger bekommt hier eine feste Länge */
function dauer(me: AtemRohMe): number {
  const stil = STIL_NACH_NUMMER[me.transitionProperties.nextStyle]
  const s = me.transitionSettings
  const je: Record<AtemRatenStil, number | undefined> = {
    mix: s.mix?.rate,
    dip: s.dip?.rate,
    wipe: s.wipe?.rate,
    dve: s.DVE?.rate
  }
  return stil === 'sting' ? 25 : (je[stil] ?? 25)
}

export function simulierteVerbindung(modell: AtemSimModell, m: AtemMeldungen): AtemVerbindung {
  const d = DATEN[modell]
  const mes = Array.from({ length: d.mes }, () => meStart(d))
  const dsks = Array.from({ length: d.dsk }, dskStart)
  const media = medienStart(d)
  const auxBusse: number[] = Array.from({ length: d.aux }, () => 1)
  const macroPlayer = { isRunning: false, isWaiting: false, macroIndex: 0 }
  const roh: AtemRoh = {
    info: {
      apiVersion: VERSION,
      productIdentifier: ATEM_SIM_NAMEN[modell],
      capabilities: { DVEs: d.dves, stingers: d.stingers },
      macroPool: { macroCount: d.makroPlaetze }
    },
    video: { mixEffects: mes, downstreamKeyers: dsks, auxilliaries: auxBusse },
    inputs: quellenFuer(d),
    settings: { videoMode: d.modus },
    macro: {
      macroPlayer,
      macroProperties: MAKROS.map((name) => ({ isUsed: true, name, description: '' }))
    },
    media
  }
  const uebergaenge = new Map<number, Lauf>()
  const fades = new Map<number, Lauf>()
  const dskLaeufe = new Map<number, Lauf>()
  let takt: ReturnType<typeof setInterval> | null = null
  let aufbau: ReturnType<typeof setTimeout> | null = null
  let makroLauf: ReturnType<typeof setTimeout> | null = null

  const melde = (): void => m.zustand(roh)

  /** Wie am Gerät: Der Übergang nimmt mit, was ausgewählt ist, auf M/E 1 auch verknüpfte DSKs */
  function uebergangFertig(i: number): void {
    const me = mes[i]
    const auswahl = me.transitionProperties.nextSelection.reduce((a, b) => a | b, 0)
    if (auswahl & ATEM_HINTERGRUND) {
      ;[me.programInput, me.previewInput] = [me.previewInput, me.programInput]
    }
    me.upstreamKeyers.forEach((k, n) => {
      if (k && auswahl & keyerBit(n)) k.onAir = !k.onAir
    })
    if (i === 0) {
      for (const k of dsks) if (k.properties?.tie) k.onAir = !k.onAir
    }
    me.transitionPosition = { inTransition: false, remainingFrames: 0, handlePosition: 0 }
  }

  function bild(): void {
    for (const [i, lauf] of uebergaenge) {
      const me = mes[i]
      lauf.rest--
      if (lauf.rest <= 0) {
        uebergaenge.delete(i)
        uebergangFertig(i)
        continue
      }
      const anteil = 1 - lauf.rest / lauf.gesamt
      me.transitionPosition = {
        inTransition: true,
        remainingFrames: lauf.rest,
        handlePosition: Math.round(lauf.von + (ATEM_HEBEL_MAX - lauf.von) * anteil)
      }
    }
    for (const [i, lauf] of fades) {
      const f = mes[i].fadeToBlack
      if (!f) continue
      lauf.rest--
      if (lauf.rest <= 0) {
        fades.delete(i)
        mes[i].fadeToBlack = {
          ...f,
          isFullyBlack: !f.isFullyBlack,
          inTransition: false,
          remainingFrames: 0
        }
      } else mes[i].fadeToBlack = { ...f, remainingFrames: lauf.rest }
    }
    for (const [i, lauf] of dskLaeufe) {
      const k = dsks[i]
      lauf.rest--
      k.remainingFrames = Math.max(0, lauf.rest)
      if (lauf.rest <= 0) {
        dskLaeufe.delete(i)
        k.onAir = !k.onAir
        k.inTransition = false
      }
    }
    if (uebergaenge.size === 0 && fades.size === 0 && dskLaeufe.size === 0) taktHalten()
    melde()
  }

  function taktStarten(): void {
    if (takt) return
    // Ein Schritt je Zählwert, wie am Gerät: Bei 50p läuft der Zähler mit 25 je Sekunde
    const fps = bildrateAusModus(d.modus) ?? 25
    takt = setInterval(bild, (1000 * bilderJeSchritt(fps)) / fps)
  }

  function taktHalten(): void {
    if (takt) clearInterval(takt)
    takt = null
  }

  function makroEnde(): void {
    if (makroLauf) clearTimeout(makroLauf)
    makroLauf = null
    macroPlayer.isRunning = false
    macroPlayer.isWaiting = false
  }

  function ausfuehrenMe(me: AtemRohMe, c: AtemCommand & { me: number }): void {
    switch (c.type) {
      case 'programm':
        me.programInput = c.quelle
        break
      case 'vorschau':
        me.previewInput = c.quelle
        break
      case 'cut':
        uebergaenge.delete(c.me)
        uebergangFertig(c.me)
        break
      case 'auto': {
        if (uebergaenge.has(c.me)) return
        const von = me.transitionPosition.handlePosition
        const gesamt = Math.max(1, Math.round(dauer(me) * (1 - von / ATEM_HEBEL_MAX)))
        uebergaenge.set(c.me, { gesamt, rest: gesamt, von })
        me.transitionPosition = {
          inTransition: true,
          remainingFrames: gesamt,
          handlePosition: von
        }
        taktStarten()
        break
      }
      case 'ftb': {
        const f = me.fadeToBlack
        if (!f || fades.has(c.me)) return
        fades.set(c.me, { gesamt: f.rate, rest: f.rate, von: 0 })
        me.fadeToBlack = { ...f, inTransition: true, remainingFrames: f.rate }
        taktStarten()
        break
      }
      case 'ftbRate':
        if (me.fadeToBlack) me.fadeToBlack = { ...me.fadeToBlack, rate: c.rate }
        break
      case 'stil':
        me.transitionProperties = {
          ...me.transitionProperties,
          nextStyle: STIL_NACH_NUMMER.indexOf(c.stil)
        }
        break
      case 'naechster': {
        const bits = [ATEM_HINTERGRUND, ...me.upstreamKeyers.map((_, n) => keyerBit(n))]
        me.transitionProperties = {
          ...me.transitionProperties,
          nextSelection: bits.filter((bit) => c.maske & bit)
        }
        break
      }
      case 'rate': {
        const s = me.transitionSettings
        if (c.stil === 'mix') s.mix = { rate: c.rate }
        else if (c.stil === 'dip') s.dip = { rate: c.rate }
        else if (c.stil === 'wipe') s.wipe = { rate: c.rate }
        else s.DVE = { rate: c.rate }
        break
      }
      case 'hebel':
        if (c.wert >= ATEM_HEBEL_MAX) uebergangFertig(c.me)
        else {
          me.transitionPosition = {
            inTransition: c.wert > 0,
            remainingFrames: 0,
            handlePosition: c.wert
          }
        }
        break
      case 'uskOnAir': {
        const k = me.upstreamKeyers[c.keyer]
        if (k) k.onAir = c.an
        break
      }
      case 'uskQuelle': {
        const k = me.upstreamKeyers[c.keyer]
        if (k && c.art === 'fill') k.fillSource = c.quelle
        else if (k) k.cutSource = c.quelle
      }
    }
  }

  function ausfuehren(c: AtemCommand): void {
    if ('me' in c) {
      ausfuehrenMe(mes[c.me], c)
      melde()
      return
    }
    switch (c.type) {
      case 'dskOnAir':
        dsks[c.keyer].onAir = c.an
        break
      case 'dskTie': {
        const k = dsks[c.keyer]
        k.properties = { rate: k.properties?.rate ?? 25, tie: c.an }
        break
      }
      case 'dskRate': {
        const k = dsks[c.keyer]
        k.properties = { tie: k.properties?.tie ?? false, rate: c.rate }
        break
      }
      case 'dskAuto': {
        const k = dsks[c.keyer]
        if (dskLaeufe.has(c.keyer)) return
        const rate = k.properties?.rate ?? 25
        dskLaeufe.set(c.keyer, { gesamt: rate, rest: rate, von: 0 })
        k.inTransition = true
        k.remainingFrames = rate
        taktStarten()
        break
      }
      case 'dskQuelle': {
        const k = dsks[c.keyer]
        const q = k.sources ?? { fillSource: 0, cutSource: 0 }
        k.sources =
          c.art === 'fill' ? { ...q, fillSource: c.quelle } : { ...q, cutSource: c.quelle }
        break
      }
      case 'makroStart':
        makroEnde()
        macroPlayer.isRunning = true
        macroPlayer.macroIndex = c.index
        if (c.index === MAKRO_MIT_PAUSE) macroPlayer.isWaiting = true
        else {
          makroLauf = setTimeout(() => {
            makroEnde()
            melde()
          }, MAKRO_MS)
        }
        break
      case 'makroStopp':
      case 'makroWeiter':
        makroEnde()
        break
      case 'mediaQuelle': {
        const p = media.players[c.player]
        if (!p) return
        if (c.art === 'still') {
          media.players = media.players.map((x, i) =>
            i === c.player && x ? { ...x, sourceType: MEDIEN_STILL, stillIndex: c.index } : x
          )
        } else {
          media.players = media.players.map((x, i) =>
            i === c.player && x ? { ...x, sourceType: MEDIEN_CLIP, clipIndex: c.index } : x
          )
        }
        break
      }
      case 'clipSpielen':
      case 'clipSchleife':
      case 'clipAnfang':
        media.players = media.players.map((x, i) => {
          if (i !== c.player || !x) return x
          if (c.type === 'clipSchleife') return { ...x, loop: c.an }
          if (c.type === 'clipAnfang') return { ...x, atBeginning: true, playing: false }
          return { ...x, playing: c.an, atBeginning: false }
        })
        break
      case 'aux':
        auxBusse[c.bus] = c.quelle
    }
    melde()
  }

  return {
    async start() {
      aufbau = setTimeout(() => {
        melde()
        m.verbunden()
      }, AUFBAU_MS)
    },
    async stopp() {
      if (aufbau) clearTimeout(aufbau)
      makroEnde()
      taktHalten()
    },
    async befehl(cmd) {
      ausfuehren(cmd)
    },
    protokollBekannt: () => true
  }
}
