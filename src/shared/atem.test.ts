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
  ftb: { schwarz: false, laeuft: false, restBilder: 0, rate: 25 }
}

const view: AtemView = {
  quellen: [
    { id: 1, kurz: 'CAM1', lang: 'Kamera 1', extern: true, meMaske: 0b11 },
    { id: 2, kurz: 'CAM2', lang: 'Kamera 2', extern: true, meMaske: 0b01 },
    { id: 3, kurz: 'CAM3', lang: 'Kamera 3', extern: true, meMaske: 0b10 }
  ],
  mes: [me, me],
  stile: ['mix', 'dip', 'wipe'],
  bildrate: 50
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
