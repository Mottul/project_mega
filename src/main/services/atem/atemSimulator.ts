// Probebetrieb: dieselbe Schnittstelle wie die echte Verbindung, ohne Gerät. Führt Befehle aus und
// meldet den neuen Zustand, Übergänge laufen Bild für Bild wie am Mischer. So lassen sich Bedienung
// und Oberfläche für jede Mischer-Größe üben und bauen. Das Protokoll prüft er nicht: Dafür gibt es
// den Schein-Mischer der E2E-Tests und die Abnahme am Gerät.

import {
  ATEM_HEBEL_MAX,
  ATEM_SIM_NAMEN,
  type AtemCommand,
  type AtemRatenStil,
  type AtemSimModell
} from '@shared/atem'
import {
  bildrateAusModus,
  STIL_NACH_NUMMER,
  type AtemRoh,
  type AtemRohMe,
  type AtemRohQuelle
} from '@shared/atemView'
import type { AtemMeldungen, AtemVerbindung } from './atemVerbindung'

/** Werte wie `InternalPortType` und `VideoMode` der Bibliothek */
const PORT = { extern: 0, schwarz: 1, balken: 2, farbe: 3, media: 4, supersource: 6 } as const
const MODUS_1080P25 = 10
const MODUS_1080P50 = 12
const MODUS_4K50 = 18
const VERSION = 131104
/** So lange dauert der Verbindungsaufbau, spürbar wie am Gerät */
const AUFBAU_MS = 150

interface SimDaten {
  eingaenge: number
  mes: number
  dves: number
  stingers: number
  supersource: boolean
  modus: number
}

const DATEN: Record<AtemSimModell, SimDaten> = {
  mini: {
    eingaenge: 4,
    mes: 1,
    dves: 1,
    stingers: 0,
    supersource: false,
    modus: MODUS_1080P25
  },
  'mini-extreme': {
    eingaenge: 8,
    mes: 1,
    dves: 2,
    stingers: 0,
    supersource: true,
    modus: MODUS_1080P50
  },
  constellation: {
    eingaenge: 40,
    mes: 4,
    dves: 4,
    stingers: 4,
    supersource: true,
    modus: MODUS_4K50
  }
}

const quelle = (
  inputId: number,
  longName: string,
  shortName: string,
  internalPortType: number,
  meAvailability: number
): AtemRohQuelle => ({ inputId, longName, shortName, internalPortType, meAvailability })

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
    quelle(3020, 'Media-Player 2', 'MP2', PORT.media, alleMes)
  ]
  if (d.supersource) liste.push(quelle(6000, 'SuperSource', 'SSRC', PORT.supersource, alleMes))
  return Object.fromEntries(liste.map((q) => [q.inputId, q]))
}

function meStart(d: SimDaten): AtemRohMe {
  return {
    programInput: 1,
    previewInput: 2,
    transitionPosition: { inTransition: false, remainingFrames: 0, handlePosition: 0 },
    transitionProperties: { nextStyle: 0 },
    transitionSettings: {
      mix: { rate: 25 },
      dip: { rate: 25 },
      wipe: { rate: 25 },
      ...(d.dves > 0 ? { DVE: { rate: 25 } } : {})
    },
    fadeToBlack: { isFullyBlack: false, inTransition: false, remainingFrames: 0, rate: 25 }
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
  const roh: AtemRoh = {
    info: {
      apiVersion: VERSION,
      productIdentifier: ATEM_SIM_NAMEN[modell],
      capabilities: { DVEs: d.dves, stingers: d.stingers }
    },
    video: { mixEffects: mes },
    inputs: quellenFuer(d),
    settings: { videoMode: d.modus }
  }
  const uebergaenge = new Map<number, Lauf>()
  const fades = new Map<number, Lauf>()
  let takt: ReturnType<typeof setInterval> | null = null
  let aufbau: ReturnType<typeof setTimeout> | null = null

  const melde = (): void => m.zustand(roh)

  function tausche(me: AtemRohMe): void {
    ;[me.programInput, me.previewInput] = [me.previewInput, me.programInput]
    me.transitionPosition = { inTransition: false, remainingFrames: 0, handlePosition: 0 }
  }

  function bild(): void {
    for (const [i, lauf] of uebergaenge) {
      const me = mes[i]
      lauf.rest--
      if (lauf.rest <= 0) {
        uebergaenge.delete(i)
        tausche(me)
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
    if (uebergaenge.size === 0 && fades.size === 0) taktHalten()
    melde()
  }

  function taktStarten(): void {
    if (takt) return
    const fps = bildrateAusModus(d.modus) ?? 25
    takt = setInterval(bild, 1000 / fps)
  }

  function taktHalten(): void {
    if (takt) clearInterval(takt)
    takt = null
  }

  function ausfuehren(c: AtemCommand): void {
    const me = mes[c.me]
    switch (c.type) {
      case 'programm':
        me.programInput = c.quelle
        break
      case 'vorschau':
        me.previewInput = c.quelle
        break
      case 'cut':
        uebergaenge.delete(c.me)
        tausche(me)
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
        if (me.fadeToBlack) me.fadeToBlack = { ...me.fadeToBlack, rate: c.bilder }
        break
      case 'stil':
        me.transitionProperties = { nextStyle: STIL_NACH_NUMMER.indexOf(c.stil) }
        break
      case 'rate': {
        const s = me.transitionSettings
        if (c.stil === 'mix') s.mix = { rate: c.bilder }
        else if (c.stil === 'dip') s.dip = { rate: c.bilder }
        else if (c.stil === 'wipe') s.wipe = { rate: c.bilder }
        else s.DVE = { rate: c.bilder }
        break
      }
      case 'hebel':
        if (c.wert >= ATEM_HEBEL_MAX) tausche(me)
        else {
          me.transitionPosition = {
            inTransition: c.wert > 0,
            remainingFrames: 0,
            handlePosition: c.wert
          }
        }
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
      taktHalten()
    },
    async befehl(cmd) {
      ausfuehren(cmd)
    },
    protokollBekannt: () => true
  }
}
