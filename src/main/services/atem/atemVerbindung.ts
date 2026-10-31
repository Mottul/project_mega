// Was der Dienst von einer Verbindung braucht, und die echte Fassung über atem-connection. Die
// Bibliothek wird erst beim ersten Verbinden geladen: Sie zieht das native FreeType mit, das soll
// weder den Start bremsen noch ohne Mischer eine Rolle spielen. Der Probebetrieb (atemSimulator)
// erfüllt dieselbe Schnittstelle.

import { app } from 'electron'
import type { Atem } from 'atem-connection'
import { ATEM_HEBEL_MAX, hostUndPort, type AtemCommand } from '@shared/atem'
import { STIL_NACH_NUMMER, type AtemRoh } from '@shared/atemView'
import { logLine } from '../log'

/** Was eine Verbindung dem Dienst meldet */
export interface AtemMeldungen {
  verbunden(): void
  /** Verbindung weg, sie baut sich selbst wieder auf */
  verloren(): void
  zustand(roh: AtemRoh): void
  fehler(text: string): void
}

export interface AtemVerbindung {
  start(): Promise<void>
  /** Trennt und gibt alles frei, danach kommt keine Meldung mehr */
  stopp(): Promise<void>
  /** Geprüfter Befehl; erledigt, sobald der Mischer ihn bestätigt hat */
  befehl(cmd: AtemCommand): Promise<void>
  /** Kennt die Gegenseite diese Protokollversion? */
  protokollBekannt(version: number): boolean
}

async function anGeraet(a: Atem, c: AtemCommand): Promise<void> {
  switch (c.type) {
    case 'programm':
      return a.changeProgramInput(c.quelle, c.me)
    case 'vorschau':
      return a.changePreviewInput(c.quelle, c.me)
    case 'cut':
      return a.cut(c.me)
    case 'auto':
      return a.autoTransition(c.me)
    case 'ftb':
      return a.fadeToBlack(c.me)
    case 'ftbRate':
      return a.setFadeToBlackRate(c.bilder, c.me)
    case 'stil':
      return a.setTransitionStyle({ nextStyle: STIL_NACH_NUMMER.indexOf(c.stil) }, c.me)
    case 'rate':
      switch (c.stil) {
        case 'mix':
          return a.setMixTransitionSettings({ rate: c.bilder }, c.me)
        case 'dip':
          return a.setDipTransitionSettings({ rate: c.bilder }, c.me)
        case 'wipe':
          return a.setWipeTransitionSettings({ rate: c.bilder }, c.me)
        case 'dve':
          return a.setDVETransitionSettings({ rate: c.bilder }, c.me)
      }
      return
    case 'hebel':
      await a.setTransitionPosition(c.wert, c.me)
      // Am Ende schickt eine 0 hinterher, wie es ältere Hardware-Steuerungen tun: Erst sie schließt
      // dort den Übergang ab. Endet er schon beim Höchstwert, ändert die 0 nichts. Die Abnahme am
      // Gerät zeigt, ob sie nötig ist.
      if (c.wert >= ATEM_HEBEL_MAX) await a.setTransitionPosition(0, c.me)
      return
    case 'uskOnAir':
      return a.setUpstreamKeyerOnAir(c.an, c.me, c.keyer)
    case 'uskQuelle':
      return c.art === 'fill'
        ? a.setUpstreamKeyerFillSource(c.quelle, c.me, c.keyer)
        : a.setUpstreamKeyerCutSource(c.quelle, c.me, c.keyer)
    case 'naechster':
      return a.setTransitionStyle({ nextSelection: auswahlBits(c.maske) }, c.me)
    case 'dskOnAir':
      return a.setDownstreamKeyOnAir(c.an, c.keyer)
    case 'dskTie':
      return a.setDownstreamKeyTie(c.an, c.keyer)
    case 'dskAuto':
      return a.autoDownstreamKey(c.keyer)
    case 'dskRate':
      return a.setDownstreamKeyRate(c.bilder, c.keyer)
    case 'dskQuelle':
      return c.art === 'fill'
        ? a.setDownstreamKeyFillSource(c.quelle, c.keyer)
        : a.setDownstreamKeyCutSource(c.quelle, c.keyer)
    case 'makroStart':
      return a.macroRun(c.index)
    case 'makroStopp':
      return a.macroStop()
    case 'makroWeiter':
      return a.macroContinue()
    case 'mediaQuelle':
      return a.setMediaPlayerSource(
        c.art === 'still'
          ? { sourceType: MEDIEN_STILL, stillIndex: c.index }
          : { sourceType: MEDIEN_CLIP, clipIndex: c.index },
        c.player
      )
    case 'clipSpielen':
      return a.setMediaPlayerSettings({ playing: c.an }, c.player)
    case 'clipSchleife':
      return a.setMediaPlayerSettings({ loop: c.an }, c.player)
    case 'clipAnfang':
      return a.setMediaPlayerSettings({ atBeginning: true }, c.player)
    case 'aux':
      return a.setAuxSource(c.quelle, c.bus)
  }
}

/** `MediaSourceType` der Bibliothek: Sie selbst kommt erst beim Verbinden, siehe oben */
const MEDIEN_STILL = 1
const MEDIEN_CLIP = 2

/** Bitmaske des nächsten Übergangs als Liste, wie die Bibliothek sie will */
function auswahlBits(maske: number): number[] {
  const bits: number[] = []
  for (let bit = 1; bit <= maske; bit <<= 1) if (maske & bit) bits.push(bit)
  return bits
}

let signaleUebernommen = false

/**
 * exit-hook aus der Bibliothek beendet die App bei SIGTERM und SIGINT sofort mit process.exit: Die
 * Rückfrage und das Aufräumen liefen dann nicht, ffmpeg schriebe unter macOS und Linux weiter. Ein
 * bloßes Entfernen seiner Listener genügte nicht, denn danach greift das Standardverhalten des
 * Systems statt Electrons. Deshalb beendet ein eigener Listener über den normalen Weg.
 */
function signaleUebernehmen(): void {
  if (signaleUebernommen) return
  signaleUebernommen = true
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.removeAllListeners(signal)
    process.on(signal, () => app.quit())
  }
}

export function echteVerbindung(host: string, m: AtemMeldungen): AtemVerbindung {
  const { adresse, port } = hostUndPort(host)
  let atem: Atem | null = null
  let gestoppt = false
  let bekannt: readonly unknown[] = []

  return {
    async start() {
      const { Atem, Enums } = await import('atem-connection')
      if (gestoppt) return
      bekannt = Object.values(Enums.ProtocolVersion)
      const a = new Atem({})
      atem = a
      a.on('connected', () => {
        if (a.state) m.zustand(a.state)
        m.verbunden()
      })
      a.on('disconnected', () => m.verloren())
      a.on('stateChanged', (state) => m.zustand(state))
      a.on('error', (text) => m.fehler(text))
      a.on('info', (text) => logLine('[atem]', text))
      await a.connect(adresse, port)
      signaleUebernehmen()
    },
    async stopp() {
      gestoppt = true
      const a = atem
      atem = null
      if (!a) return
      a.removeAllListeners()
      await a.destroy()
    },
    async befehl(cmd) {
      if (atem) await anGeraet(atem, cmd)
    },
    protokollBekannt: (version) => bekannt.includes(version)
  }
}
