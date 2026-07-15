import { describe, expect, it } from 'vitest'
import { parseArpOutput, parseProcNetArp } from './arp'

describe('arp – parseArpOutput (arp -a, plattformübergreifend)', () => {
  it('liest Linux/BSD-Format', () => {
    const out = 'router.lan (192.168.1.1) at ab:cd:ef:12:34:56 [ether] on eth0'
    expect(parseArpOutput(out).get('192.168.1.1')).toBe('ab:cd:ef:12:34:56')
  })
  it('liest macOS-Format und füllt Nullen auf', () => {
    const out = '? (192.168.1.20) at a4:83:e7:0:1:2 on en0 ifscope [ethernet]'
    expect(parseArpOutput(out).get('192.168.1.20')).toBe('a4:83:e7:00:01:02')
  })
  it('liest Windows-Format (Bindestriche)', () => {
    const out = '  192.168.1.30          aa-bb-cc-dd-ee-ff     dynamisch'
    expect(parseArpOutput(out).get('192.168.1.30')).toBe('aa:bb:cc:dd:ee:ff')
  })
  it('überspringt unvollständige (00:00:…) Einträge', () => {
    const out = '  192.168.1.40          00-00-00-00-00-00     unvollständig'
    expect(parseArpOutput(out).has('192.168.1.40')).toBe(false)
  })
  it('verarbeitet mehrere Zeilen', () => {
    const out = [
      '? (10.0.0.2) at 11:22:33:44:55:66 on en0',
      '? (10.0.0.3) at 66:55:44:33:22:11 on en0'
    ].join('\n')
    const m = parseArpOutput(out)
    expect(m.size).toBe(2)
    expect(m.get('10.0.0.3')).toBe('66:55:44:33:22:11')
  })
})

describe('arp – parseProcNetArp (Linux /proc/net/arp)', () => {
  it('liest IP + MAC aus den Spalten', () => {
    const txt = [
      'IP address       HW type     Flags       HW address            Mask     Device',
      '192.168.1.1      0x1         0x2         ab:cd:ef:12:34:56     *        eth0',
      '192.168.1.9      0x1         0x0         00:00:00:00:00:00     *        eth0'
    ].join('\n')
    const m = parseProcNetArp(txt)
    expect(m.get('192.168.1.1')).toBe('ab:cd:ef:12:34:56')
    expect(m.has('192.168.1.9')).toBe(false) // leerer Eintrag
  })
})
