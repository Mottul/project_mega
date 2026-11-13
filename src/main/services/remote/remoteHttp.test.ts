import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, vi } from 'vitest'

// remoteHttp loggt über log.ts -> zieht `electron` (app.getPath) herein.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false }
}))

const { createSnapshotServer, nurEigeneHerkunft, readBody, safeHandler } =
  await import('./remoteHttp')

describe('readBody – Befehl vom Handy lesen', () => {
  /** Schickt `teile` als einzelne Blöcke (ohne Content-Length) und liefert, was readBody liest */
  async function lies(teile: Buffer[], maxBytes?: number): Promise<string> {
    let gelesen = ''
    const http = createServer((req, res) => {
      void readBody(req, maxBytes).then((body) => {
        gelesen = body
        res.end('ok')
      })
    })
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
    const port = (http.address() as AddressInfo).port
    try {
      await new Promise<void>((resolve, reject) => {
        const req = request(
          { host: '127.0.0.1', port, path: '/api/command', method: 'POST' },
          (res) => {
            res.resume()
            res.on('end', resolve)
          }
        )
        req.on('error', reject)
        // jeder Teil mit Abstand: so kommen sie beim Server sicher als eigene Blöcke an
        teile.forEach((teil, i) => {
          setTimeout(() => (i === teile.length - 1 ? req.end(teil) : req.write(teil)), i * 30)
        })
      })
    } finally {
      await new Promise((r) => http.close(r))
    }
    return gelesen
  }

  it('setzt einen Umlaut wieder zusammen, der auf der Grenze zweier Blöcke liegt', async () => {
    const ganz = Buffer.from('{"type":"message","text":"Bühne frei"}', 'utf8')
    // „ü“ sind zwei Bytes (C3 BC) – mitten hindurch teilen
    const schnitt = ganz.indexOf(0xc3) + 1
    expect(ganz[schnitt]).toBe(0xbc)
    const text = await lies([ganz.subarray(0, schnitt), ganz.subarray(schnitt)])
    expect(text).toBe('{"type":"message","text":"Bühne frei"}')
  })

  it('auch ein Zeichen aus vier Bytes, über drei Blöcke verteilt', async () => {
    const ganz = Buffer.from('a🎬b', 'utf8')
    const text = await lies([ganz.subarray(0, 2), ganz.subarray(2, 4), ganz.subarray(4)])
    expect(text).toBe('a🎬b')
  })

  it('kappt an der Obergrenze, statt beliebig viel anzunehmen', async () => {
    const text = await lies([Buffer.from('x'.repeat(500)), Buffer.from('y'.repeat(500))], 600)
    expect(text).toHaveLength(600)
    expect(text.endsWith('y')).toBe(true)
  })
})

describe('nurEigeneHerkunft – der Wächter vor jedem Fernsteuer-Server', () => {
  /** Server mit Wächter; `befehle` zählt, was beim Handler ankommt */
  async function mitWaechter(
    lauf: (
      frage: (
        kopf: Record<string, string>,
        method?: string
      ) => Promise<{ status: number; text: string }>,
      port: number
    ) => Promise<void>
  ): Promise<number> {
    let befehle = 0
    const http = createServer(
      nurEigeneHerkunft('test', (_req, res) => {
        befehle++
        res.writeHead(200)
        res.end('ok')
      })
    )
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
    const port = (http.address() as AddressInfo).port
    // http.request statt fetch: fetch übergeht eine gesetzte Host-Kopfzeile
    const frage = (
      kopf: Record<string, string>,
      method = 'POST'
    ): Promise<{ status: number; text: string }> =>
      new Promise((resolve, reject) => {
        const req = request(
          { host: '127.0.0.1', port, path: '/api/command', method, headers: kopf },
          (res) => {
            let text = ''
            res.setEncoding('utf8')
            res.on('data', (d: string) => (text += d))
            res.on('end', () => resolve({ status: res.statusCode ?? 0, text }))
          }
        )
        req.on('error', reject)
        req.setTimeout(5_000, () => req.destroy(new Error('Zeitlimit')))
        req.end(method === 'POST' ? '{"type":"x"}' : undefined)
      })
    try {
      await lauf(frage, port)
    } finally {
      await new Promise((r) => http.close(r))
    }
    return befehle
  }

  it('weist fremde Websites mit 403 ab, bevor der Handler den Befehl sieht', async () => {
    const befehle = await mitWaechter(async (frage) => {
      for (const origin of ['http://boese.example', 'null', 'http://127.0.0.1:1']) {
        const r = await frage({ Origin: origin })
        expect(r.status, origin).toBe(403)
        expect(r.text).toContain('fremden Website')
      }
    })
    expect(befehle).toBe(0)
  })

  it('weist einen fremden Namen ab – auch beim Lesen – und sagt, welche Adresse geht', async () => {
    const befehle = await mitWaechter(async (frage, port) => {
      const r = await frage({ Host: `boese.example:${port}` }, 'GET')
      expect(r.status).toBe(403)
      expect(r.text).toContain('QR-Code')
    })
    expect(befehle).toBe(0)
  })

  it('lässt die eigene Seite und Programme ohne Origin durch', async () => {
    const befehle = await mitWaechter(async (frage, port) => {
      expect((await frage({ Origin: `http://127.0.0.1:${port}` })).status).toBe(200)
      expect((await frage({})).status).toBe(200)
      expect((await frage({}, 'GET')).status).toBe(200)
    })
    expect(befehle).toBe(3)
  })
})

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
