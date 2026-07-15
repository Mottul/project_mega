import { describe, expect, it } from 'vitest'
import { parseMdnsMessage } from './mdns'

const u16 = (n: number): Buffer => {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(n)
  return b
}
const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}
const encName = (str: string): Buffer => {
  const bufs: Buffer[] = []
  for (const p of str.split('.')) bufs.push(Buffer.from([p.length]), Buffer.from(p, 'utf8'))
  bufs.push(Buffer.from([0]))
  return Buffer.concat(bufs)
}
const rr = (name: string, type: number, rdata: Buffer): Buffer =>
  Buffer.concat([encName(name), u16(type), u16(1), u32(120), u16(rdata.length), rdata])

describe('mdns – parseMdnsMessage', () => {
  it('liest A/PTR/SRV inkl. übersprungener Frage', () => {
    const header = Buffer.concat([u16(0), u16(0x8400), u16(1), u16(3), u16(0), u16(0)])
    const question = Buffer.concat([encName('_http._tcp.local'), u16(12), u16(1)])
    const ptr = rr('_http._tcp.local', 12, encName('MyCam._http._tcp.local'))
    const srv = rr(
      'MyCam._http._tcp.local',
      33,
      Buffer.concat([u16(0), u16(0), u16(80), encName('mycam.local')])
    )
    const a = rr('mycam.local', 1, Buffer.from([192, 168, 1, 50]))
    const recs = parseMdnsMessage(Buffer.concat([header, question, ptr, srv, a]))

    const aRec = recs.find((r) => r.type === 1)
    expect(aRec?.data).toEqual({ kind: 'a', ip: '192.168.1.50' })
    expect(aRec?.name).toBe('mycam.local')

    const srvRec = recs.find((r) => r.type === 33)
    expect(srvRec?.data).toEqual({ kind: 'srv', target: 'mycam.local', port: 80 })

    const ptrRec = recs.find((r) => r.type === 12)
    expect(ptrRec?.name).toBe('_http._tcp.local')
    expect(ptrRec?.data).toEqual({ kind: 'ptr', ptr: 'MyCam._http._tcp.local' })
  })

  it('löst Namens-Kompression (0xC0-Zeiger) im SRV-Ziel auf', () => {
    const header = Buffer.concat([u16(0), u16(0x8400), u16(0), u16(2), u16(0), u16(0)])
    // A-Record-Name beginnt direkt nach dem 12-Byte-Header -> Offset 12.
    const a = rr('device.local', 1, Buffer.from([10, 0, 0, 5]))
    const srvRdata = Buffer.concat([u16(0), u16(0), u16(9000), Buffer.from([0xc0, 0x0c])])
    const srv = rr('svc._z._tcp.local', 33, srvRdata)
    const recs = parseMdnsMessage(Buffer.concat([header, a, srv]))

    expect(recs.find((r) => r.type === 1)?.data).toEqual({ kind: 'a', ip: '10.0.0.5' })
    expect(recs.find((r) => r.type === 33)?.data).toEqual({
      kind: 'srv',
      target: 'device.local',
      port: 9000
    })
  })

  it('gibt bei zu kurzem Puffer nichts zurück', () => {
    expect(parseMdnsMessage(Buffer.from([0, 1, 2]))).toEqual([])
  })
})
