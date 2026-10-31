import { describe, expect, it } from 'vitest'
import {
  atemCommand,
  atemZiel,
  bilderInSekunden,
  hostUndPort,
  type AtemMe,
  type AtemView
} from './atem'

const me: AtemMe = {
  programm: 1,
  vorschau: 2,
  stil: 'mix',
  raten: { mix: 25 },
  hebel: 0,
  uebergang: false,
  restBilder: 0,
  hebelOben: false,
  ftb: { schwarz: false, laeuft: false, restBilder: 0, rate: 25 },
  keyer: [
    { onAir: false, art: 'luma', fill: 1, cut: 1 },
    { onAir: false, art: 'dve', fill: 1, cut: 1 }
  ],
  naechster: 1
}

const view: AtemView = {
  quellen: [
    { id: 1, kurz: 'CAM1', lang: 'Kamera 1', extern: true, meMaske: 0b11, verfuegbar: 0xff },
    { id: 2, kurz: 'CAM2', lang: 'Kamera 2', extern: true, meMaske: 0b01, verfuegbar: 0xff },
    { id: 3, kurz: 'CAM3', lang: 'Kamera 3', extern: true, meMaske: 0b10, verfuegbar: 0 },
    { id: 9001, kurz: 'MV', lang: 'Multiview', extern: false, meMaske: 0, verfuegbar: 1 }
  ],
  mes: [me, me],
  stile: ['mix', 'dip', 'wipe'],
  bildrate: 50,
  dsk: [{ onAir: false, laeuft: false, restBilder: 0, tie: false, rate: 25, fill: 1, cut: 1 }],
  makros: [{ index: 4, name: 'Abspann', beschreibung: '' }],
  makroPlaetze: 100,
  makroPlayer: { laeuft: false, wartet: false, index: 0 },
  medien: {
    stills: [{ index: 2, name: 'Logo' }],
    clips: [{ index: 1, name: 'Opener' }],
    player: [{ art: 'still', index: 2, spielt: false, schleife: false, amAnfang: true }]
  },
  aux: [{ name: 'AUX 1', quelle: 1 }]
}

describe('atemCommand', () => {
  it('lässt gültige Befehle durch und übernimmt nur bekannte Felder', () => {
    expect(atemCommand({ type: 'programm', me: 0, quelle: 2, x: 'y' }, view)).toEqual({
      type: 'programm',
      me: 0,
      quelle: 2
    })
    expect(atemCommand({ type: 'cut', me: 1 }, view)).toEqual({ type: 'cut', me: 1 })
    expect(atemCommand({ type: 'stil', me: 0, stil: 'dip' }, view)).toEqual({
      type: 'stil',
      me: 0,
      stil: 'dip'
    })
    expect(atemCommand({ type: 'hebel', me: 0, wert: 10000 }, view)).toEqual({
      type: 'hebel',
      me: 0,
      wert: 10000
    })
  })

  it('kennt nur vorhandene M/Es', () => {
    expect(atemCommand({ type: 'cut', me: 2 }, view)).toBeNull()
    expect(atemCommand({ type: 'cut', me: -1 }, view)).toBeNull()
    expect(atemCommand({ type: 'cut', me: 0.5 }, view)).toBeNull()
    expect(atemCommand({ type: 'cut' }, view)).toBeNull()
  })

  it('prüft die Quelle je M/E', () => {
    expect(atemCommand({ type: 'vorschau', me: 0, quelle: 3 }, view)).toBeNull()
    expect(atemCommand({ type: 'vorschau', me: 1, quelle: 3 }, view)).not.toBeNull()
    expect(atemCommand({ type: 'programm', me: 0, quelle: 99 }, view)).toBeNull()
    expect(atemCommand({ type: 'programm', me: 0, quelle: '1' }, view)).toBeNull()
  })

  it('kennt nur Stile, die der Mischer kann', () => {
    expect(atemCommand({ type: 'stil', me: 0, stil: 'dve' }, view)).toBeNull()
    expect(atemCommand({ type: 'rate', me: 0, stil: 'dve', bilder: 25 }, view)).toBeNull()
    // Der Stinger hat keine einfache Dauer
    const mitSting: AtemView = { ...view, stile: [...view.stile, 'sting'] }
    expect(atemCommand({ type: 'stil', me: 0, stil: 'sting' }, mitSting)).not.toBeNull()
    expect(atemCommand({ type: 'rate', me: 0, stil: 'sting', bilder: 25 }, mitSting)).toBeNull()
  })

  it('hält Dauer und Hebel in den Grenzen des Geräts', () => {
    expect(atemCommand({ type: 'rate', me: 0, stil: 'mix', bilder: 0 }, view)).toBeNull()
    expect(atemCommand({ type: 'rate', me: 0, stil: 'mix', bilder: 251 }, view)).toBeNull()
    expect(atemCommand({ type: 'rate', me: 0, stil: 'mix', bilder: 250 }, view)).not.toBeNull()
    expect(atemCommand({ type: 'ftbRate', me: 0, bilder: 1.5 }, view)).toBeNull()
    expect(atemCommand({ type: 'hebel', me: 0, wert: 10001 }, view)).toBeNull()
    expect(atemCommand({ type: 'hebel', me: 0, wert: -1 }, view)).toBeNull()
  })

  it('lehnt alles Fremde ab', () => {
    for (const roh of [null, undefined, 'cut', 7, [], {}, { type: 'macroRun', me: 0 }]) {
      expect(atemCommand(roh, view)).toBeNull()
    }
  })
})

describe('atemCommand: Keyer', () => {
  it('kennt nur Keyer, die die M/E hat', () => {
    expect(atemCommand({ type: 'uskOnAir', me: 0, keyer: 1, an: true }, view)).toEqual({
      type: 'uskOnAir',
      me: 0,
      keyer: 1,
      an: true
    })
    expect(atemCommand({ type: 'uskOnAir', me: 0, keyer: 2, an: true }, view)).toBeNull()
    expect(atemCommand({ type: 'uskOnAir', me: 0, keyer: 0, an: 'ja' }, view)).toBeNull()
    expect(atemCommand({ type: 'uskOnAir', keyer: 0, an: true }, view)).toBeNull()
  })

  it('nimmt als Key-Quelle nur, was dafür taugt', () => {
    const uskFill = { type: 'uskQuelle', me: 0, keyer: 0, art: 'fill' }
    expect(atemCommand({ ...uskFill, quelle: 2 }, view)).toEqual({ ...uskFill, quelle: 2 })
    expect(atemCommand({ ...uskFill, quelle: 3 }, view)).toBeNull()
    expect(atemCommand({ ...uskFill, quelle: 9001 }, view)).toBeNull()
    expect(atemCommand({ ...uskFill, art: 'mask', quelle: 2 }, view)).toBeNull()
    expect(atemCommand({ type: 'dskQuelle', keyer: 0, art: 'cut', quelle: 2 }, view)).toEqual({
      type: 'dskQuelle',
      keyer: 0,
      art: 'cut',
      quelle: 2
    })
    expect(atemCommand({ type: 'dskQuelle', keyer: 0, art: 'cut', quelle: 3 }, view)).toBeNull()
  })

  it('nimmt für den nächsten Übergang nur vorhandene Teile, und nie gar nichts', () => {
    const naechster = (maske: unknown): unknown =>
      atemCommand({ type: 'naechster', me: 0, maske }, view)
    expect(naechster(1)).toEqual({ type: 'naechster', me: 0, maske: 1 })
    expect(naechster(0b111)).toEqual({ type: 'naechster', me: 0, maske: 0b111 })
    expect(naechster(0)).toBeNull()
    expect(naechster(0b1000)).toBeNull()
    expect(naechster('1')).toBeNull()
  })

  it('prüft DSK-Nummer, Schalter und Dauer', () => {
    expect(atemCommand({ type: 'dskOnAir', keyer: 0, an: true }, view)).not.toBeNull()
    expect(atemCommand({ type: 'dskOnAir', keyer: 1, an: true }, view)).toBeNull()
    expect(atemCommand({ type: 'dskTie', keyer: 0, an: 1 }, view)).toBeNull()
    expect(atemCommand({ type: 'dskAuto', keyer: 0 }, view)).toEqual({ type: 'dskAuto', keyer: 0 })
    expect(atemCommand({ type: 'dskAuto', keyer: 9 }, view)).toBeNull()
    expect(atemCommand({ type: 'dskRate', keyer: 0, bilder: 250 }, view)).not.toBeNull()
    expect(atemCommand({ type: 'dskRate', keyer: 0, bilder: 251 }, view)).toBeNull()
  })
})

describe('atemCommand: Makros', () => {
  it('startet nur belegte Plätze', () => {
    expect(atemCommand({ type: 'makroStart', index: 4 }, view)).toEqual({
      type: 'makroStart',
      index: 4
    })
    expect(atemCommand({ type: 'makroStart', index: 5 }, view)).toBeNull()
    expect(atemCommand({ type: 'makroStart', index: '4' }, view)).toBeNull()
  })

  it('kennt Stopp und Weiter ohne Zusatz', () => {
    expect(atemCommand({ type: 'makroStopp', index: 99 }, view)).toEqual({ type: 'makroStopp' })
    expect(atemCommand({ type: 'makroWeiter' }, view)).toEqual({ type: 'makroWeiter' })
  })
})

describe('atemCommand: Medien und AUX', () => {
  it('nimmt nur belegte Plätze des passenden Pools', () => {
    const q = { type: 'mediaQuelle', player: 0 }
    expect(atemCommand({ ...q, art: 'still', index: 2 }, view)).toEqual({
      ...q,
      art: 'still',
      index: 2
    })
    expect(atemCommand({ ...q, art: 'still', index: 1 }, view)).toBeNull()
    expect(atemCommand({ ...q, art: 'clip', index: 1 }, view)).not.toBeNull()
    expect(atemCommand({ ...q, art: 'audio', index: 1 }, view)).toBeNull()
    expect(atemCommand({ ...q, player: 1, art: 'still', index: 2 }, view)).toBeNull()
  })

  it('prüft die Steuerung der Clips', () => {
    expect(atemCommand({ type: 'clipSpielen', player: 0, an: true }, view)).not.toBeNull()
    expect(atemCommand({ type: 'clipSpielen', player: 1, an: true }, view)).toBeNull()
    expect(atemCommand({ type: 'clipSchleife', player: 0 }, view)).toBeNull()
    expect(atemCommand({ type: 'clipAnfang', player: 0 }, view)).not.toBeNull()
  })

  it('kennt nur vorhandene Busse und AUX-taugliche Quellen', () => {
    expect(atemCommand({ type: 'aux', bus: 0, quelle: 9001 }, view)).toEqual({
      type: 'aux',
      bus: 0,
      quelle: 9001
    })
    expect(atemCommand({ type: 'aux', bus: 1, quelle: 1 }, view)).toBeNull()
    expect(atemCommand({ type: 'aux', bus: 0, quelle: 3 }, view)).toBeNull()
  })
})

describe('atemZiel', () => {
  it('nimmt Adressen mit und ohne Port', () => {
    expect(atemZiel({ host: ' 192.168.1.240 ' })).toEqual({ host: '192.168.1.240' })
    expect(atemZiel({ host: '127.0.0.1:9910' })).toEqual({ host: '127.0.0.1:9910' })
    expect(atemZiel({ host: 'atem-mini.local' })).toEqual({ host: 'atem-mini.local' })
  })

  it('nimmt die Modelle des Probebetriebs', () => {
    expect(atemZiel({ simulator: 'mini' })).toEqual({ simulator: 'mini' })
    expect(atemZiel({ simulator: 'sps9000' })).toBeNull()
  })

  it('lehnt alles andere ab', () => {
    for (const roh of [
      null,
      'simulator',
      { host: '' },
      { host: 'a b' },
      { host: '1.2.3.4:0' },
      { host: '1.2.3.4:70000' },
      { host: '-x' },
      { host: 'http://x' },
      { host: 7 }
    ]) {
      expect(atemZiel(roh)).toBeNull()
    }
  })
})

describe('hostUndPort', () => {
  it('trennt den Port ab', () => {
    expect(hostUndPort('1.2.3.4:9000')).toEqual({ adresse: '1.2.3.4', port: 9000 })
    expect(hostUndPort('1.2.3.4')).toEqual({ adresse: '1.2.3.4', port: undefined })
  })
})

describe('bilderInSekunden', () => {
  it('rechnet mit der Bildrate des Mischers', () => {
    expect(bilderInSekunden(25, 50)).toBe('0,50 s')
    expect(bilderInSekunden(25, 25)).toBe('1,00 s')
    expect(bilderInSekunden(25, null)).toBeNull()
  })
})
