import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { crc32, isSafeEntryName, readZip, writeZip, ZipError } from './zip'

const LIMITS = { entries: 100, entryBytes: 1024 * 1024, totalBytes: 4 * 1024 * 1024 }
const txt = (s: string): Buffer => Buffer.from(s, 'utf8')

describe('ZIP der Projektdatei', () => {
  it('CRC-32 nach IEEE', () => {
    expect(crc32(txt('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })

  it('runder Weg: komprimiert und gespeichert, UTF-8-Namen', () => {
    const json = txt(JSON.stringify({ a: 'Ä'.repeat(500) }))
    const foto = Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 37) % 256))
    const zip = writeZip([
      { name: 'projekt.json', data: json, compress: true },
      { name: 'fotos/äbc.jpg', data: foto, compress: false }
    ])
    const out = readZip(zip, LIMITS)
    expect(out.get('projekt.json')?.equals(json)).toBe(true)
    expect(out.get('fotos/äbc.jpg')?.equals(foto)).toBe(true)
    // JSON wurde wirklich komprimiert
    expect(zip.length).toBeLessThan(json.length + foto.length)
  })

  it('liest nur gewünschte Einträge', () => {
    const zip = writeZip([
      { name: 'projekt.json', data: txt('{}'), compress: true },
      { name: 'fotos/a.jpg', data: txt('x'), compress: false }
    ])
    expect([...readZip(zip, LIMITS, (n) => n === 'projekt.json').keys()]).toEqual(['projekt.json'])
  })

  it('leere Liste und leerer Eintrag', () => {
    expect(readZip(writeZip([]), LIMITS).size).toBe(0)
    const out = readZip(
      writeZip([{ name: 'leer', data: new Uint8Array(), compress: true }]),
      LIMITS
    )
    expect(out.get('leer')?.length).toBe(0)
  })

  it('unsichere Namen werden weder geschrieben noch gelesen', () => {
    for (const bad of ['../x', '/etc/passwd', 'a/../b', 'C:/x', 'a\\b', '', 'a//b', './a']) {
      expect(isSafeEntryName(bad)).toBe(false)
    }
    expect(() => writeZip([{ name: '../x', data: txt('x'), compress: false }])).toThrow(ZipError)
    // Name nachträglich im Archiv auf „../x“ geändert (gleiche Länge wie „a/xx“)
    const zip = writeZip([{ name: 'a/xx', data: txt('x'), compress: false }])
    const evil = Buffer.from(zip.toString('latin1').split('a/xx').join('../x'), 'latin1')
    expect(() => readZip(evil, LIMITS)).toThrow(ZipError)
  })

  it('Grenzen gegen ZIP-Bomben', () => {
    const big = Buffer.alloc(2 * 1024 * 1024) // Nullen: winzig komprimiert, groß entpackt
    const zip = writeZip([{ name: 'bombe', data: big, compress: true }])
    expect(zip.length).toBeLessThan(10_000)
    expect(() => readZip(zip, LIMITS)).toThrow(/zu groß/)
    const many = writeZip(
      Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, data: txt('x'), compress: false }))
    )
    expect(() => readZip(many, { ...LIMITS, entries: 4 })).toThrow(/Zu viele/)
  })

  it('falsche Größe im Verzeichnis (gelogene Entpackgröße) fällt auf', () => {
    const data = Buffer.alloc(50_000, 7)
    const zip = writeZip([{ name: 'x', data, compress: true }])
    // angegebene Größe im zentralen Verzeichnis kleiner machen
    const cd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    zip.writeUInt32LE(10, cd + 24)
    expect(() => readZip(zip, LIMITS)).toThrow(ZipError)
  })

  it('kaputte Prüfsumme und kein ZIP', () => {
    const zip = writeZip([{ name: 'x', data: txt('hallo welt'), compress: false }])
    const i = zip.indexOf(txt('hallo welt'))
    zip[i] = 'H'.charCodeAt(0)
    expect(() => readZip(zip, LIMITS)).toThrow(/Prüfsumme/)
    expect(() => readZip(txt('kein zip, nur text'), LIMITS)).toThrow(ZipError)
  })

  it('liest auch Deflate-Daten anderer Packer', () => {
    // Eintrag mit Methode 8 wie von anderen Programmen erzeugt (Inhalt identisch)
    const data = txt('x'.repeat(1000))
    const zip = writeZip([{ name: 'x', data, compress: true }])
    expect(zip.includes(deflateRawSync(data))).toBe(true)
    expect(readZip(zip, LIMITS).get('x')?.equals(data)).toBe(true)
  })
})
