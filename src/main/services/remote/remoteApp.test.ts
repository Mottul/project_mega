import {
  createServer,
  get as httpGet,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// remoteHttp loggt über log.ts -> zieht `electron` (app.getPath) herein.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false }
}))

const { createRemoteApp } = await import('./remoteApp')
const { setPwaIconSource } = await import('./remotePwa')
type AppRemote = import('./remoteApp').AppRemote

/** Fake-Fernsteuerung: antwortet mit der Pfad-Ansicht, die sie bekommt. */
function fakeRemote(id: string, running: boolean): AppRemote & { running: boolean } {
  const r = {
    id,
    name: id.toUpperCase(),
    tool: `Tool ${id}`,
    description: `Beschreibung ${id}`,
    icon: '<path d="M0 0"/>',
    running,
    isRunning: () => r.running,
    handle: (req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(`${id}:${req.url}`)
    }
  }
  return r
}

/** Freien Port finden (createRemoteHost akzeptiert keinen Port 0). */
async function freePort(): Promise<number> {
  const s = createServer()
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve))
  const { port } = s.address() as AddressInfo
  await new Promise((resolve) => s.close(resolve))
  return port
}

describe('Fernsteuer-App – Routing', () => {
  const jingle = fakeRemote('jingle', true)
  const osc = fakeRemote('osc', false)
  const app = createRemoteApp([jingle, osc], 1)
  let server: Server
  let base = ''

  beforeEach(async () => {
    jingle.running = true
    osc.running = false
    server = createServer(app.handle)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  const get = (path: string): Promise<Response> => fetch(base + path, { redirect: 'manual' })
  // Roh gesendeter Pfad (fetch würde Punkt-Segmente schon clientseitig auflösen).
  const rawGet = (path: string): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const { port } = server.address() as AddressInfo
      httpGet({ host: '127.0.0.1', port, path }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      }).on('error', reject)
    })

  it('liefert die Startseite', async () => {
    const res = await get('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('api/remotes')
  })

  it('listet alle Fernsteuerungen mit Laufzustand', async () => {
    const data = (await (await get('/api/remotes')).json()) as {
      remotes: { id: string; running: boolean; tool: string }[]
    }
    expect(data.remotes.map((r) => [r.id, r.running])).toEqual([
      ['jingle', true],
      ['osc', false]
    ])
    expect(data.remotes[0].tool).toBe('Tool jingle')
  })

  it('reicht Anfragen ohne Präfix (inkl. Query) an die Fernsteuerung weiter', async () => {
    expect(await (await get('/jingle/')).text()).toBe('jingle:/')
    expect(await (await get('/jingle/api/state?x=1')).text()).toBe('jingle:/api/state?x=1')
    expect(await (await get('/jingle/media/a%20b.mp4')).text()).toBe('jingle:/media/a%20b.mp4')
  })

  it('ergänzt den Schrägstrich, damit relative Pfade der Seite stimmen', async () => {
    const res = await get('/jingle?x=1')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/jingle/?x=1')
  })

  it('gibt ausgeschaltete Fernsteuerungen nicht frei', async () => {
    const page = await get('/osc/')
    expect(page.status).toBe(302)
    expect(page.headers.get('location')).toBe('/')
    expect((await get('/osc/api/state')).status).toBe(503)
    // SSE: Verbindung wird gekappt (EventSource versucht es dann erneut).
    await expect(get('/osc/api/events')).rejects.toThrow()
  })

  it('kennt nur eingetragene Fernsteuerungen', async () => {
    expect((await get('/unbekannt/')).status).toBe(404)
    expect((await get('/jingle/x/y')).status).toBe(200)
  })

  it('löst Punkt-Segmente auf, bevor die Fernsteuerung gewählt wird', async () => {
    // /jingle/../osc/… ist /osc/… -> osc ist aus -> nicht über jingle erreichbar
    expect((await rawGet('/jingle/../osc/api/state')).status).toBe(503)
    expect((await rawGet('/jingle/%2e%2e/osc/api/state')).status).toBe(503)
    expect(await rawGet('/osc/../jingle/api/state')).toEqual({
      status: 200,
      body: 'jingle:/api/state'
    })
  })
})

describe('Fernsteuer-App – Lebenszyklus', () => {
  it('läuft nur, solange eine Fernsteuerung an ist, und liefert App-Adressen', async () => {
    const port = await freePort()
    const jingle = fakeRemote('jingle', false)
    const app = createRemoteApp([jingle], port)
    try {
      await app.sync()
      expect(app.isRunning()).toBe(false)
      expect(app.link('jingle').urls).toEqual([])

      jingle.running = true
      await Promise.all([app.sync(), app.sync()]) // parallel angestoßen -> hintereinander
      expect(app.isRunning()).toBe(true)
      const urls = app.link('jingle').urls
      expect(urls.length).toBeGreaterThan(0)
      for (const u of urls) expect(u).toMatch(new RegExp(`^http://[^/]+:${port}/jingle/$`))

      // Die App beantwortet auch Manifest-Anfragen (über den gemeinsamen Host).
      const manifest = await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`)
      expect(manifest.headers.get('content-type')).toContain('application/manifest+json')

      jingle.running = false
      await app.sync()
      expect(app.isRunning()).toBe(false)
    } finally {
      app.stop()
    }
  })

  it('meldet einen belegten Port statt abzustürzen', async () => {
    const blocker = createServer()
    await new Promise<void>((resolve) => blocker.listen(0, '0.0.0.0', resolve))
    const port = (blocker.address() as AddressInfo).port
    const app = createRemoteApp([fakeRemote('jingle', true)], port)
    try {
      await app.sync()
      expect(app.isRunning()).toBe(false)
      expect(app.link('jingle')).toEqual({ urls: [], error: `Port ${port} ist belegt` })
    } finally {
      app.stop()
      await new Promise((resolve) => blocker.close(resolve))
    }
  })
})

describe('Fernsteuer-App – Icons', () => {
  afterEach(() => setPwaIconSource(() => null))

  it('liefert das App-Icon in der angefragten Größe', async () => {
    const sizes: number[] = []
    setPwaIconSource((size) => {
      sizes.push(size)
      return Buffer.from([1, 2, 3])
    })
    const port = await freePort()
    const app = createRemoteApp([fakeRemote('jingle', true)], port)
    try {
      await app.sync()
      const res = await fetch(`http://127.0.0.1:${port}/apple-touch-icon.png`)
      expect(res.headers.get('content-type')).toBe('image/png')
      expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3])
      await fetch(`http://127.0.0.1:${port}/icon-512.png`)
      expect(sizes).toEqual([180, 512])
    } finally {
      app.stop()
    }
  })
})
