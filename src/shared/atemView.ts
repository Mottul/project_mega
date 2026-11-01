// Mischer-Zustand zu kleiner Ansicht verdichten: Der volle Zustand von atem-connection ist groß und
// ändert sich laufend, zu den Fenstern geht nur, was die Seiten zeigen. `AtemRoh` beschreibt den
// Teil, den die Ansicht liest: `AtemState` der Bibliothek passt darauf (der Compiler prüft das in
// atemVerbindung.ts), der Simulator baut ihn selbst. So bleibt dieses Modul frei von der Bibliothek.

import {
  ATEM_KEY_ARTEN,
  type AtemAux,
  type AtemDsk,
  type AtemFtb,
  type AtemMakro,
  type AtemMe,
  type AtemMedien,
  type AtemMedium,
  type AtemQuelle,
  type AtemRatenStil,
  type AtemStil,
  type AtemUsk,
  type AtemView
} from './atem'

/** Interner Quellentyp des Mischers, Werte wie `InternalPortType` der Bibliothek */
const PORT_EXTERN = 0
const PORT_EXTERN_DIREKT = 7
/** Kennung des ersten AUX-Busses unter den Quellen: Dort steht sein Name */
const AUX_ERSTE_KENNUNG = 8001
/** `MediaSourceType.Clip` der Bibliothek */
const MEDIEN_CLIP = 2

export interface AtemRohQuelle {
  inputId: number
  longName: string
  shortName: string
  internalPortType: number
  meAvailability: number
  sourceAvailability: number
}

export interface AtemRohUsk {
  onAir: boolean
  mixEffectKeyType: number
  fillSource: number
  cutSource: number
}

export interface AtemRohDsk {
  onAir: boolean
  inTransition: boolean
  remainingFrames: number
  sources?: { fillSource: number; cutSource: number }
  properties?: { tie: boolean; rate: number }
}

export interface AtemRohMe {
  programInput: number
  previewInput: number
  transitionPosition: {
    inTransition: boolean
    remainingFrames: number
    handlePosition: number
  }
  transitionProperties: { nextStyle: number; nextSelection: readonly number[] }
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
  upstreamKeyers: ReadonlyArray<AtemRohUsk | undefined>
}

export interface AtemRoh {
  info: {
    apiVersion: number
    productIdentifier?: string
    capabilities?: { DVEs: number; stingers: number }
    macroPool?: { macroCount: number }
  }
  video: {
    mixEffects: ReadonlyArray<AtemRohMe | undefined>
    downstreamKeyers: ReadonlyArray<AtemRohDsk | undefined>
    auxilliaries: ReadonlyArray<number | undefined>
  }
  inputs: Readonly<Record<number, AtemRohQuelle | undefined>>
  settings: { videoMode: number }
  macro: {
    macroPlayer: { isRunning: boolean; isWaiting: boolean; macroIndex: number }
    macroProperties: ReadonlyArray<
      { isUsed: boolean; name: string; description: string } | undefined
    >
  }
  media: {
    stillPool: ReadonlyArray<{ isUsed: boolean; fileName: string } | undefined>
    clipPool: ReadonlyArray<{ isUsed: boolean; name: string } | undefined>
    players: ReadonlyArray<
      | {
          sourceType: number
          stillIndex: number
          clipIndex: number
          playing: boolean
          loop: boolean
          atBeginning: boolean
        }
      | undefined
    >
  }
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
    .filter(
      (q): q is AtemRohQuelle =>
        q !== undefined && (q.meAvailability !== 0 || q.sourceAvailability !== 0)
    )
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
      meMaske: q.meAvailability,
      verfuegbar: q.sourceAvailability
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
    rest: f?.remainingFrames ?? 0,
    rate: f?.rate ?? 0
  }
}

function keyer(me: AtemRohMe): AtemUsk[] {
  return me.upstreamKeyers
    .filter((k): k is AtemRohUsk => k !== undefined)
    .map((k) => ({
      onAir: k.onAir,
      art: ATEM_KEY_ARTEN[k.mixEffectKeyType] ?? 'luma',
      fill: k.fillSource,
      cut: k.cutSource
    }))
}

function dsk(roh: AtemRoh): AtemDsk[] {
  return roh.video.downstreamKeyers
    .filter((k): k is AtemRohDsk => k !== undefined)
    .map((k) => ({
      onAir: k.onAir,
      laeuft: k.inTransition,
      rest: k.remainingFrames,
      tie: k.properties?.tie ?? false,
      rate: k.properties?.rate ?? 0,
      fill: k.sources?.fillSource ?? 0,
      cut: k.sources?.cutSource ?? 0
    }))
}

function makros(roh: AtemRoh): AtemMakro[] {
  const liste: AtemMakro[] = []
  roh.macro.macroProperties.forEach((m, index) => {
    if (m?.isUsed) {
      liste.push({ index, name: m.name || `Makro ${index + 1}`, beschreibung: m.description })
    }
  })
  return liste
}

function medien(roh: AtemRoh): AtemMedien {
  const belegt = (
    pool: ReadonlyArray<{ isUsed: boolean } | undefined>,
    name: (i: number) => string
  ): AtemMedium[] =>
    pool.flatMap((m, index) => (m?.isUsed ? [{ index, name: name(index) || `${index + 1}` }] : []))
  const { stillPool, clipPool, players } = roh.media
  return {
    stills: belegt(stillPool, (i) => stillPool[i]?.fileName ?? ''),
    clips: belegt(clipPool, (i) => clipPool[i]?.name ?? ''),
    player: players
      .filter((p) => p !== undefined)
      .map((p) => {
        const clip = p.sourceType === MEDIEN_CLIP
        return {
          art: clip ? 'clip' : 'still',
          index: clip ? p.clipIndex : p.stillIndex,
          spielt: p.playing,
          schleife: p.loop,
          amAnfang: p.atBeginning
        }
      })
  }
}

function aux(roh: AtemRoh): AtemAux[] {
  return roh.video.auxilliaries.map((quelle, bus) => ({
    name: roh.inputs[AUX_ERSTE_KENNUNG + bus]?.longName ?? `AUX ${bus + 1}`,
    quelle: quelle ?? 0
  }))
}

function meView(me: AtemRohMe, hebelOben: boolean): AtemMe {
  return {
    programm: me.programInput,
    vorschau: me.previewInput,
    stil: STIL_NACH_NUMMER[me.transitionProperties.nextStyle] ?? 'mix',
    raten: raten(me),
    hebel: me.transitionPosition.handlePosition,
    uebergang: me.transitionPosition.inTransition,
    rest: me.transitionPosition.remainingFrames,
    hebelOben,
    ftb: ftb(me),
    keyer: keyer(me),
    naechster: me.transitionProperties.nextSelection.reduce((maske, bit) => maske | bit, 0)
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
    bildrate: bildrateAusModus(roh.settings.videoMode),
    dsk: dsk(roh),
    makros: makros(roh),
    makroPlaetze: roh.info.macroPool?.macroCount ?? roh.macro.macroProperties.length,
    makroPlayer: {
      laeuft: roh.macro.macroPlayer.isRunning,
      wartet: roh.macro.macroPlayer.isWaiting,
      index: roh.macro.macroPlayer.macroIndex
    },
    medien: medien(roh),
    aux: aux(roh)
  }
}

/** „2.32“ aus der Protokollversion (obere 16 Bit Haupt-, untere Nebenversion) */
export function protokollText(version: number): string {
  return `${version >>> 16}.${version & 0xffff}`
}
