import { describe, expect, it } from 'vitest'
import { hostRange, intToIp, ipToInt, normalizeMac, rangeIps } from './netUtil'

describe('netUtil – IP-Arithmetik', () => {
  it('ipToInt/intToIp sind zueinander invers', () => {
    for (const ip of ['0.0.0.0', '192.168.0.1', '10.20.30.40', '255.255.255.255']) {
      expect(intToIp(ipToInt(ip))).toBe(ip)
    }
  })
  it('ipToInt lehnt Ungültiges ab', () => {
    expect(ipToInt('1.2.3')).toBe(-1)
    expect(ipToInt('256.0.0.1')).toBe(-1)
    expect(ipToInt('a.b.c.d')).toBe(-1)
    expect(ipToInt('192.168.0.')).toBe(-1)
  })
})

describe('netUtil – normalizeMac', () => {
  it('vereinheitlicht Trenner und füllt Nullen auf', () => {
    expect(normalizeMac('AB-CD-EF-12-34-56')).toBe('ab:cd:ef:12:34:56')
    expect(normalizeMac('a:b:c:d:e:f')).toBe('0a:0b:0c:0d:0e:0f')
  })
  it('lehnt leere/ungültige MACs ab', () => {
    expect(normalizeMac('00:00:00:00:00:00')).toBeNull()
    expect(normalizeMac('xy:zz:00:00:00:00')).toBeNull()
    expect(normalizeMac('12:34:56')).toBeNull()
  })
})

describe('netUtil – hostRange', () => {
  it('/24 liefert 254 Hosts (ohne Netz/Broadcast)', () => {
    const r = hostRange('192.168.1.50', '255.255.255.0')
    expect(r).not.toBeNull()
    expect(r!.count).toBe(254)
    expect(intToIp(r!.start)).toBe('192.168.1.1')
    expect(intToIp(r!.end)).toBe('192.168.1.254')
  })
  it('deckelt große Netze auf das /24 der lokalen IP', () => {
    const r = hostRange('10.5.6.7', '255.255.0.0') // /16 -> zu groß
    expect(r!.count).toBe(254)
    expect(intToIp(r!.start)).toBe('10.5.6.1')
    expect(intToIp(r!.end)).toBe('10.5.6.254')
  })
  it('/30 liefert 2 Hosts', () => {
    const r = hostRange('192.168.1.5', '255.255.255.252')
    expect(r!.count).toBe(2)
    expect(intToIp(r!.start)).toBe('192.168.1.5')
    expect(intToIp(r!.end)).toBe('192.168.1.6')
  })
  it('/32 liefert genau die eine Adresse', () => {
    const r = hostRange('192.168.1.5', '255.255.255.255')
    expect(r!.count).toBe(1)
    expect(intToIp(r!.start)).toBe('192.168.1.5')
  })
})

describe('netUtil – rangeIps', () => {
  it('zählt inklusive beider Enden auf', () => {
    const ips = rangeIps(ipToInt('192.168.1.1'), ipToInt('192.168.1.3'))
    expect(ips).toEqual(['192.168.1.1', '192.168.1.2', '192.168.1.3'])
  })
})
