import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NetDevice } from '@shared/types'
import { readArpTable } from './arp'
import { probeAtem } from './atem'
import { browseMdns } from './mdns'
import { setNetscanSinks, startScan } from './netscanService'

// Der echte Fall: Kabel zum ATEM ohne DHCP, beide mit Link-Local-Adresse im /16. Abgetastet wird
// nur 169.254.164.x, der Mischer sitzt auf 169.254.36.88.
const ADAPTER = '169.254.164.96'
const ATEM_IP = '169.254.36.88'
const ATEM_MAC = '7c:2e:0d:16:29:1c'

const { connects } = vi.hoisted(() => ({ connects: [] as { localAddress?: string }[] }))

vi.mock('../log', () => ({ logLine: () => {} }))
vi.mock('./arp', () => ({ readArpTable: vi.fn() }))
vi.mock('./atem', () => ({ probeAtem: vi.fn() }))
vi.mock('./mdns', () => ({ browseMdns: vi.fn() }))
vi.mock('./netUtil', async (original) => ({
  ...(await original<typeof import('./netUtil')>()),
  listInterfaces: () => [
    {
      address: '169.254.164.96',
      netmask: '255.255.0.0',
      mac: 'e8:6a:64:aa:7c:02',
      label: 'Ethernet',
      hosts: 254
    }
  ]
}))
// Keine echten Verbindungen: Jeder Port bleibt stumm.
vi.mock('node:net', () => ({
  Socket: class {
    private onError: (e: { code: string }) => void = () => {}
    setTimeout(): void {}
    destroy(): void {}
    once(ev: string, cb: (e: { code: string }) => void): this {
      if (ev === 'error') this.onError = cb
      return this
    }
    connect(opts: { localAddress?: string }): void {
      connects.push(opts)
      queueMicrotask(() => this.onError({ code: 'ETIMEDOUT' }))
    }
  }
}))

/** Scan durchlaufen lassen; liefert den letzten Stand je Gerät. */
async function scan(): Promise<Map<string, NetDevice>> {
  const seen = new Map<string, NetDevice>()
  setNetscanSinks(
    () => {},
    (d) => seen.set(d.ip, structuredClone(d))
  )
  await startScan(ADAPTER)
  return seen
}

describe('netscanService – Geräte außerhalb des abgetasteten Bereichs', () => {
  beforeEach(() => {
    connects.length = 0
    vi.mocked(readArpTable).mockResolvedValue(new Map())
    vi.mocked(probeAtem).mockImplementation(async (ip) => ip === ATEM_IP)
    vi.mocked(browseMdns).mockReturnValue(() => {})
    // Nur das Nachlaufen von mDNS wartet per Timer – die Tests sollen das nicht aussitzen.
    const real = globalThis.setTimeout
    vi.stubGlobal('setTimeout', (fn: () => void) => real(fn, 0))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('findet den ATEM über die ARP-Tabelle des gewählten Adapters', async () => {
    vi.mocked(readArpTable).mockResolvedValue(new Map([[ATEM_IP, ATEM_MAC]]))
    const d = (await scan()).get(ATEM_IP)
    expect(readArpTable).toHaveBeenCalledWith(ADAPTER)
    expect(d?.mac).toBe(ATEM_MAC)
    expect(d?.vendor).toBe('Blackmagic Design')
    expect(d?.type).toBe('atem')
  })

  it('erkennt den ATEM per UDP auch ohne bekannten Hersteller', async () => {
    vi.mocked(readArpTable).mockResolvedValue(new Map([[ATEM_IP, 'aa:bb:cc:dd:ee:ff']]))
    expect((await scan()).get(ATEM_IP)?.type).toBe('atem')
  })

  it('findet ihn über mDNS, wenn die ARP-Tabelle ihn noch nicht kennt', async () => {
    vi.mocked(browseMdns).mockImplementation((_local, onUpdate) => {
      queueMicrotask(() => onUpdate(ATEM_IP, { hostname: 'ATEM-Extreme', services: [] }))
      return () => {}
    })
    const d = (await scan()).get(ATEM_IP)
    expect(d?.hostname).toBe('ATEM-Extreme')
    expect(d?.type).toBe('atem')
  })

  it('prüft dieselbe Adresse aus ARP und mDNS nur einmal', async () => {
    vi.mocked(readArpTable).mockResolvedValue(new Map([[ATEM_IP, ATEM_MAC]]))
    vi.mocked(browseMdns).mockImplementation((_local, onUpdate) => {
      queueMicrotask(() => onUpdate(ATEM_IP, { hostname: 'ATEM-Extreme', services: [] }))
      return () => {}
    })
    await scan()
    expect(vi.mocked(probeAtem).mock.calls.filter(([ip]) => ip === ATEM_IP)).toHaveLength(1)
  })

  it('lässt Broadcast und fremde Netze aus ARP und mDNS weg', async () => {
    vi.mocked(readArpTable).mockResolvedValue(
      new Map([
        ['169.254.255.255', 'ff:ff:ff:ff:ff:ff'],
        ['192.168.178.1', '98:9b:cb:6d:22:30'],
        ['224.0.0.251', '01:00:5e:00:00:fb']
      ])
    )
    vi.mocked(browseMdns).mockImplementation((_local, onUpdate) => {
      queueMicrotask(() => onUpdate('192.168.178.20', { hostname: 'drucker', services: [] }))
      return () => {}
    })
    expect((await scan()).size).toBe(0)
  })

  it('tastet alles über den gewählten Adapter ab', async () => {
    vi.mocked(readArpTable).mockResolvedValue(new Map([[ATEM_IP, ATEM_MAC]]))
    await scan()
    expect(browseMdns).toHaveBeenCalledWith(ADAPTER, expect.any(Function))
    expect(connects.length).toBeGreaterThan(0)
    expect(connects.every((c) => c.localAddress === ADAPTER)).toBe(true)
    expect(vi.mocked(probeAtem).mock.calls.every(([, local]) => local === ADAPTER)).toBe(true)
  })
})
