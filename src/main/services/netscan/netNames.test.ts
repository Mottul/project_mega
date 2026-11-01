import { describe, expect, it } from 'vitest'
import { parseMacPorts, parseNmcli, parseWindowsNames } from './netNames'

describe('netNames – parseWindowsNames', () => {
  // Echte Ausgabe eines Rechners mit WLAN, Kabel zum Mischer und Loopback-Adapter.
  const out = JSON.stringify({
    profiles: [
      { InterfaceAlias: 'Ethernet 2', Name: 'Nicht identifiziertes Netzwerk' },
      { InterfaceAlias: 'Ethernet', Name: 'Nicht identifiziertes Netzwerk' },
      { InterfaceAlias: 'WLAN', Name: 'FRITZ!Box 7530 VN 2' }
    ],
    adapters: [
      { Name: 'WLAN', InterfaceDescription: 'Intel(R) Wireless-AC 9560 160MHz' },
      { Name: 'Ethernet', InterfaceDescription: 'Intel(R) Ethernet Connection (7) I219-V' },
      { Name: 'Ethernet 2', InterfaceDescription: 'Microsoft Loopbackadapter für KM-TEST' }
    ]
  })

  it('verbindet Gerät und Netz über den Adapter-Namen', () => {
    expect(parseWindowsNames(out).WLAN).toEqual({
      adapter: 'Intel(R) Wireless-AC 9560 160MHz',
      network: 'FRITZ!Box 7530 VN 2'
    })
  })
  it('nimmt „Nicht identifiziertes Netzwerk“ nicht als Namen', () => {
    expect(parseWindowsNames(out)['Ethernet 2']).toEqual({
      adapter: 'Microsoft Loopbackadapter für KM-TEST',
      network: null
    })
  })
  it('erkennt das auch auf Englisch', () => {
    const en = JSON.stringify({ profiles: [{ InterfaceAlias: 'A', Name: 'Unidentified network' }] })
    expect(parseWindowsNames(en)).toEqual({})
  })
  it('kommt ohne Netzprofile aus', () => {
    const nur = JSON.stringify({ adapters: [{ Name: 'A', InterfaceDescription: 'X' }] })
    expect(parseWindowsNames(nur).A).toEqual({ adapter: 'X', network: null })
  })
})

describe('netNames – parseMacPorts', () => {
  it('ordnet Hardware Port dem Gerät zu', () => {
    const out = [
      '',
      'Hardware Port: Wi-Fi',
      'Device: en0',
      'Ethernet Address: 11:22:33:44:55:66',
      '',
      'Hardware Port: USB 10/100/1000 LAN',
      'Device: en5',
      'Ethernet Address: 66:55:44:33:22:11'
    ].join('\n')
    const names = parseMacPorts(out)
    expect(names.en0).toEqual({ adapter: 'Wi-Fi', network: null })
    expect(names.en5).toEqual({ adapter: 'USB 10/100/1000 LAN', network: null })
  })
})

describe('netNames – parseNmcli', () => {
  it('trennt Gerät und Name, löst geschützte Doppelpunkte auf', () => {
    const names = parseNmcli('wlp2s0:Mein WLAN\neth0:Halle\\: Regie\n')
    expect(names.wlp2s0).toEqual({ adapter: null, network: 'Mein WLAN' })
    expect(names.eth0).toEqual({ adapter: null, network: 'Halle: Regie' })
  })
  it('überspringt Zeilen ohne Namen', () => {
    expect(parseNmcli('eth1:\n\n')).toEqual({})
  })
})
