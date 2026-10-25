import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, vi } from 'vitest'

// remoteHttp loggt über log.ts -> zieht `electron` (app.getPath) herein.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false }
}))

const { createSnapshotServer, safeHandler } = await import('./remoteHttp')

describe('safeHandler', () => {
  it('beantwortet eine Anfrage mit 500, wenn der Handler wirft – statt sie hängen zu lassen', async () => {
    const http = createServer(
      safeHandler('test', (req) => {
        // wie eine Medien-Adresse mit kaputter %-Kodierung vom Handy
        decodeURIComponent(req.url ?? '')
      })
    )
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
    try {
      const port = (http.address() as AddressInfo).port
      const res = await fetch(`http://127.0.0.1:${port}/media/x%E0.mp4`, {
        signal: AbortSignal.timeout(5_000)
      })
      expect(res.status).toBe(500)
      // der Server läuft weiter und beantwortet auch die nächste
      const zweite = await fetch(`http://127.0.0.1:${port}/media/y%FF`, {
        signal: AbortSignal.timeout(5_000)
      })
      expect(zweite.status).toBe(500)
    } finally {
      await new Promise((r) => http.close(r))
    }
  })

  it('reicht Anfragen sonst unverändert durch', async () => {
    const http = createServer(
      safeHandler('test', (_req, res) => {
        res.writeHead(204)
        res.end()
      })
    )
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
    try {
      const port = (http.address() as AddressInfo).port
      expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(204)
    } finally {
      await new Promise((r) => http.close(r))
    }
  })
})

interface Snap {
  connected: boolean
  name: string
}
const EMPTY: Snap = { connected: false, name: '' }

function setup(): {
  srv: ReturnType<typeof createSnapshotServer<Snap, { type: string }>>
  state: () => Promise<Snap>
  command: () => Promise<void>
  close: () => Promise<void>
} {
  const srv = createSnapshotServer<Snap, { type: string }>({
    logTag: 'test',
    page: '<html></html>',
    empty: EMPTY,
    defaultPort: 1,
    parseCommand: (b) => JSON.parse(b) as { type: string }
  })
  const http = createServer(srv.handle)
  const ready = new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
  const base = async (): Promise<string> => {
    await ready
    return `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  }
  return {
    srv,
    state: async () => (await fetch(`${await base()}/api/state`)).json() as Promise<Snap>,
    command: async () => {
      await fetch(`${await base()}/api/command`, { method: 'POST', body: '{"type":"x"}' })
    },
    close: () => new Promise((r) => http.close(() => r()))
  }
}

describe('Snapshot-Server – Stand je Fenster', () => {
  it('ein schließendes Fenster überschreibt kein anderes, das verbunden ist', async () => {
    const t = setup()
    try {
      t.srv.publish({ connected: true, name: 'A' }, 1) // Fenster 1 zeigt das Werkzeug
      t.srv.publish({ connected: true, name: 'B' }, 2) // Fenster 2 öffnet es auch
      t.srv.publish({ connected: false, name: '' }, 2) // Fenster 2 wechselt weg
      expect(await t.state()).toEqual({ connected: true, name: 'A' })
      t.srv.publish({ connected: false, name: '' }, 1)
      expect((await t.state()).connected).toBe(false)
    } finally {
      await t.close()
    }
  })

  it('zeigt den zuletzt veröffentlichten verbundenen Stand und vergisst tote Fenster', async () => {
    const t = setup()
    try {
      t.srv.publish({ connected: true, name: 'A' }, 1)
      t.srv.publish({ connected: true, name: 'B' }, 2)
      expect((await t.state()).name).toBe('B')
      t.srv.publish({ connected: true, name: 'A2' }, 1)
      expect((await t.state()).name).toBe('A2')
      t.srv.forget(1)
      expect((await t.state()).name).toBe('B')
    } finally {
      await t.close()
    }
  })

  it('schickt Befehle an das Fenster, dessen Stand das Handy sieht', async () => {
    const t = setup()
    const got: (number | null)[] = []
    t.srv.setCommandSink((_cmd, source) => got.push(source))
    try {
      await t.command()
      t.srv.publish({ connected: true, name: 'A' }, 7)
      t.srv.publish({ connected: false, name: '' }, 8)
      await t.command()
      expect(got).toEqual([null, 7])
    } finally {
      await t.close()
    }
  })
})
