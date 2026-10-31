// Mischer-Zustand zu kleiner Ansicht verdichten: Der volle Zustand von atem-connection ist groß und
// ändert sich laufend, zu den Fenstern geht nur, was die Seiten zeigen. `AtemRoh` beschreibt den
// Teil, den die Ansicht liest: `AtemState` der Bibliothek passt darauf (der Compiler prüft das in
// atemVerbindung.ts), der Simulator baut ihn selbst. So bleibt dieses Modul frei von der Bibliothek.

import type { AtemFtb, AtemMe, AtemQuelle, AtemRatenStil, AtemStil, AtemView } from './atem'

/** Interner Quellentyp des Mischers, Werte wie `InternalPortType` der Bibliothek */
const PORT_EXTERN = 0
const PORT_EXTERN_DIREKT = 7

export interface AtemRohQuelle {
  inputId: number
  longName: string
  shortName: string
  internalPortType: number
  meAvailability: number
}

export interface AtemRohMe {
  programInput: number
  previewInput: number
  transitionPosition: {
    inTransition: boolean
    remainingFrames: number
    handlePosition: number
  }
  transitionProperties: { nextStyle: number }
  transitionSettings: {
    mix?: { rate: number }
    dip?: { rate: number }
    wipe?: { rate: number }
    DVE?: { rate: number }
  }
  fadeToBlack?: {
    isFullyBlack: boolean
    inTransition: boolean
    remainingFrames: number
    rate: number
  }
}

export interface AtemRoh {
  info: {
    apiVersion: number
    productIdentifier?: string
    capabilities?: { DVEs: number; stingers: number }
  }
  video: { mixEffects: ReadonlyArray<AtemRohMe | undefined> }
  inputs: Readonly<Record<number, AtemRohQuelle | undefined>>
  settings: { videoMode: number }
}

/** Reihenfolge wie `TransitionStyle` der Bibliothek: Der Index ist der Wert am Gerät */
export const STIL_NACH_NUMMER: readonly AtemStil[] = ['mix', 'dip', 'wipe', 'dve', 'sting']

/** Vollbilder je Sekunde, Index ist `VideoMode` der Bibliothek. Halbbild-Modi zählen als Vollbild */
const BILDRATEN = [
  29.97, 25, 29.97, 25, 50, 59.94, 25, 29.97, 23.98, 24, 25, 29.97, 50, 59.94, 23.98, 24, 25, 29.97,
  50, 59.94, 23.98, 24, 25, 29.97, 50, 59.94, 30, 60
]

export function bildrateAusModus(modus: number): number | null {
  return BILDRATEN[modus] ?? null
}

const istExtern = (q: AtemRohQuelle): boolean =>
  q.internalPortType === PORT_EXTERN || q.internalPortType === PORT_EXTERN_DIREKT

function quellen(roh: AtemRoh): AtemQuelle[] {
  return Object.values(roh.inputs)
    .filter((q): q is AtemRohQuelle => q !== undefined && q.meAvailability !== 0)
    .sort(
      (a, b) =>
        Number(istExtern(b)) - Number(istExtern(a)) ||
        a.internalPortType - b.internalPortType ||
        a.inputId - b.inputId
    )
    .map((q) => ({
      id: q.inputId,
      kurz: q.shortName,
      lang: q.longName,
      extern: istExtern(q),
      meMaske: q.meAvailability
    }))
}

function raten(me: AtemRohMe): Partial<Record<AtemRatenStil, number>> {
  const s = me.transitionSettings
  const r: Partial<Record<AtemRatenStil, number>> = {}
  if (s.mix) r.mix = s.mix.rate
  if (s.dip) r.dip = s.dip.rate
  if (s.wipe) r.wipe = s.wipe.rate
  if (s.DVE) r.dve = s.DVE.rate
  return r
}

function ftb(me: AtemRohMe): AtemFtb {
  const f = me.fadeToBlack
  return {
    schwarz: f?.isFullyBlack ?? false,
    laeuft: f?.inTransition ?? false,
    restBilder: f?.remainingFrames ?? 0,
    rate: f?.rate ?? 0
  }
}

function meView(me: AtemRohMe, hebelOben: boolean): AtemMe {
  return {
    programm: me.programInput,
    vorschau: me.previewInput,
    stil: STIL_NACH_NUMMER[me.transitionProperties.nextStyle] ?? 'mix',
    raten: raten(me),
    hebel: me.transitionPosition.handlePosition,
    uebergang: me.transitionPosition.inTransition,
    restBilder: me.transitionPosition.remainingFrames,
    hebelOben,
    ftb: ftb(me)
  }
}

/** Was das Gerät an Übergängen kann: Mix, Dip und Wipe immer, der Rest hängt an der Hardware */
function stile(roh: AtemRoh): AtemStil[] {
  const c = roh.info.capabilities
  const s: AtemStil[] = ['mix', 'dip', 'wipe']
  if (c && c.DVEs > 0) s.push('dve')
  if (c && c.stingers > 0) s.push('sting')
  return s
}

/** @param hebelOben Ruhelage je M/E, die der Dienst mitführt (der Mischer kennt sie nicht) */
export function atemViewAus(roh: AtemRoh, hebelOben: readonly boolean[]): AtemView {
  return {
    quellen: quellen(roh),
    mes: roh.video.mixEffects
      .filter((me): me is AtemRohMe => me !== undefined)
      .map((me, i) => meView(me, hebelOben[i] ?? false)),
    stile: stile(roh),
    bildrate: bildrateAusModus(roh.settings.videoMode)
  }
}

/** „2.32“ aus der Protokollversion (obere 16 Bit Haupt-, untere Nebenversion) */
export function protokollText(version: number): string {
  return `${version >>> 16}.${version & 0xffff}`
}
