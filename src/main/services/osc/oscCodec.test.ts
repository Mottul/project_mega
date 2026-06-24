import { describe, expect, it } from 'vitest'
import { decodeOsc, encodeOsc } from './oscCodec'
import type { OscMessage } from '@shared/types'

/** decode ohne das nichtdeterministische 'at'-Feld. */
const dec = (buf: Buffer): { address: string; args: (number | string | boolean)[] }[] =>
  decodeOsc(buf).map(({ address, args }) => ({ address, args }))
const enc = (msg: OscMessage): number[] => [...encodeOsc(msg)]

describe('encodeOsc – OSC-1.0 Byte-Layout (4-Byte-Alignment)', () => {
  it('Adresse ohne Args, Länge nicht durch 4 teilbar', () => {
    // '/ab' (3B) +1 Null = 4B; ',' +3 Null = 4B
    expect(enc({ address: '/ab', args: [] })).toEqual([0x2f, 0x61, 0x62, 0x00, 0x2c, 0x00, 0x00, 0x00])
  })
  it('Adresslänge GENAU durch 4 teilbar erzwingt vollen 4-Byte-Null-Block', () => {
    expect(enc({ address: '/abc', args: [] })).toEqual([
      0x2f, 0x61, 0x62, 0x63, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00
    ])
  })
  it('int32 big-endian', () => {
    expect(enc({ address: '/x', args: [{ type: 'i', value: 1 }] })).toEqual([
      0x2f, 0x78, 0x00, 0x00, 0x2c, 0x69, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01
    ])
  })
  it('float32 1.0 = IEEE-754 0x3f800000', () => {
    const b = encodeOsc({ address: '/x', args: [{ type: 'f', value: 1 }] })
    expect([...b.subarray(b.length - 4)]).toEqual([0x3f, 0x80, 0x00, 0x00])
  })
  it('String-Argument einzeln 4-Byte-aufgefüllt', () => {
    expect(enc({ address: '/s', args: [{ type: 's', value: 'hi' }] })).toEqual([
      0x2f, 0x73, 0x00, 0x00, 0x2c, 0x73, 0x00, 0x00, 0x68, 0x69, 0x00, 0x00
    ])
  })
  it('T/F erzeugen nur Typetag-Zeichen, keine Datenbytes', () => {
    expect(enc({ address: '/b', args: [{ type: 'T' }, { type: 'F' }] })).toEqual([
      0x2f, 0x62, 0x00, 0x00, 0x2c, 0x54, 0x46, 0x00
    ])
  })
  it('Ausgabelänge ist IMMER ein Vielfaches von 4', () => {
    const msgs: OscMessage[] = [
      { address: '/a', args: [] },
      { address: '/abcd', args: [{ type: 'i', value: 9 }] },
      { address: '/s', args: [{ type: 's', value: 'xyz' }] },
      { address: '/t', args: [{ type: 'T' }] }
    ]
    for (const m of msgs) expect(encodeOsc(m).length % 4).toBe(0)
  })
})

describe('Roundtrips encode → decode', () => {
  it('int32 erhalten', () => {
    expect(dec(encodeOsc({ address: '/fader', args: [{ type: 'i', value: 42 }] }))).toEqual([
      { address: '/fader', args: [42] }
    ])
  })
  it('negativer int32 (Vorzeichen-Erhalt)', () => {
    expect(dec(encodeOsc({ address: '/x', args: [{ type: 'i', value: -1 }] }))[0].args).toEqual([-1])
  })
  it('String erhalten (inkl. Padding-Skip beim Lesen)', () => {
    expect(dec(encodeOsc({ address: '/name', args: [{ type: 's', value: 'hello' }] }))[0].args).toEqual(['hello'])
  })
  it('leerer String roundtrippt zu ""', () => {
    expect(dec(encodeOsc({ address: '/x', args: [{ type: 's', value: '' }] }))[0].args).toEqual([''])
  })
  it('T/F → true/false', () => {
    expect(dec(encodeOsc({ address: '/btn', args: [{ type: 'T' }, { type: 'F' }] }))[0].args).toEqual([true, false])
  })
  it('float32-exakter Wert (0.5) bleibt exakt', () => {
    expect(dec(encodeOsc({ address: '/x', args: [{ type: 'f', value: 0.5 }] }))[0].args[0]).toBe(0.5)
  })
  it('gemischte Args behalten Reihenfolge; T (datenlos) stört Alignment nicht', () => {
    const msg: OscMessage = {
      address: '/m',
      args: [{ type: 'i', value: 7 }, { type: 'T' }, { type: 'f', value: 0.5 }, { type: 's', value: 'ok' }]
    }
    expect(dec(encodeOsc(msg))[0].args).toEqual([7, true, 0.5, 'ok'])
  })
})

describe('Codec-Eigenheiten (dokumentiertes Verhalten)', () => {
  it('float ist 32-bit: 0.1 → Math.fround(0.1), NICHT exakt 0.1', () => {
    const v = dec(encodeOsc({ address: '/x', args: [{ type: 'f', value: 0.1 }] }))[0].args[0] as number
    expect(v).toBe(Math.fround(0.1))
    expect(v).not.toBe(0.1)
  })
  it("int |0 schneidet Bruchwerte Richtung Null ab (3.9 → 3)", () => {
    expect(dec(encodeOsc({ address: '/x', args: [{ type: 'i', value: 3.9 }] }))[0].args[0]).toBe(3)
  })
  it('nicht-finiter Float (Infinity) → 0', () => {
    expect(dec(encodeOsc({ address: '/x', args: [{ type: 'f', value: Infinity }] }))[0].args[0]).toBe(0)
  })
  it('Adresse ohne führenden / wird beim Encodieren präfigiert', () => {
    expect(dec(encodeOsc({ address: 'noSlash', args: [] }))[0].address).toBe('/noSlash')
  })
})

describe('decodeOsc – Robustheit (leeres Array statt Wurf)', () => {
  it('Adresse ohne / wird verworfen', () => {
    expect(dec(Buffer.from([0x61, 0x62, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00]))).toEqual([])
  })
  it('Paket < 4 Byte', () => {
    expect(dec(Buffer.from([0x2f, 0x78, 0x00]))).toEqual([])
  })
  it('Message ohne Typetag-Sektion → leere args', () => {
    expect(dec(Buffer.from([0x2f, 0x78, 0x00, 0x00]))).toEqual([{ address: '/x', args: [] }])
  })
})

describe('Bundle-Decode', () => {
  it('#bundle mit zwei Messages → zwei flache Einträge', () => {
    const msg1 = encodeOsc({ address: '/a', args: [{ type: 'i', value: 1 }] })
    const msg2 = encodeOsc({ address: '/b', args: [{ type: 'i', value: 2 }] })
    const len1 = Buffer.alloc(4)
    len1.writeInt32BE(msg1.length)
    const len2 = Buffer.alloc(4)
    len2.writeInt32BE(msg2.length)
    const bundle = Buffer.concat([
      Buffer.from('#bundle\0', 'binary'), // 8 B Header
      Buffer.alloc(8), // 8 B Timetag (ignoriert)
      len1,
      msg1,
      len2,
      msg2
    ])
    expect(dec(bundle)).toEqual([
      { address: '/a', args: [1] },
      { address: '/b', args: [2] }
    ])
  })
})
