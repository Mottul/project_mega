// Dateien ausliefern gegen einen echten HTTP-Server bzw. als Antwort eines eigenen Protokolls.
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ReadStream } from 'node:fs'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), isPackaged: false } }))
vi.mock('./log', () => ({ logLine: () => {} }))

const { fileResponse, sendFile } = await import('./serveFile')

const dir = mkdtempSync(join(tmpdir(), 'mottulbox-servefile-'))
/** 26 Bytes mit bekanntem Inhalt */
const klein = join(dir, 'klein.bin')
/** 64 MB (dünn besetzt): mehr, als die Puffer zwischen Server und Empfänger fassen */
const gross = join(dir, 'gross.mp4')
const ABC = 'abcdefghijklmnopqrstuvwxyz'

let server: Server
let port = 0
/** Lesestrom der letzten Anfrage */
let strom: ReadStream | null = null

beforeAll(async () => {
  writeFileSync(klein, ABC)
  writeFileSync(gross, '')
  truncateSync(gross, 64 * 1024 * 1024)
  server = createServer((req, res) => {
    strom = sendFile(req, res, req.url === '/gross' ? gross : klein, 'video/mp4')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise((r) => server.close(r))
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

function hole(
  path: string,
  range?: string
): Promise<{ status: number; body: string; headers: Record<string, string | undefined> }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, headers: range ? { Range: range } : {} },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (d: string) => (body += d))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body,
            headers: res.headers as Record<string, string | undefined>
          })
        )
      }
    )
    req.on('error', reject)
    req.end()
  })
}

describe('sendFile – Medien der Fernsteuerung', () => {
  it('ohne Range die ganze Datei mit 200', async () => {
    const r = await hole('/klein')
    expect(r.status).toBe(200)
    expect(r.body).toBe(ABC)
    expect(r.headers['content-length']).toBe('26')
    expect(r.headers['accept-ranges']).toBe('bytes')
    expect(r.headers['content-type']).toBe('video/mp4')
  })

  it('ein Bereich mit 206 und Content-Range', async () => {
    const r = await hole('/klein', 'bytes=2-5')
    expect(r.status).toBe(206)
    expect(r.body).toBe('cdef')
    expect(r.headers['content-range']).toBe('bytes 2-5/26')
    expect(r.headers['content-length']).toBe('4')
  })

  it('„bytes=-5“ liefert die letzten fünf Bytes – vorher kamen die ersten sechs', async () => {
    const r = await hole('/klein', 'bytes=-5')
    expect(r.status).toBe(206)
    expect(r.body).toBe('vwxyz')
    expect(r.headers['content-range']).toBe('bytes 21-25/26')
  })

  it('Bereich hinter der Datei: 416 mit der Größe', async () => {
    const r = await hole('/klein', 'bytes=100-')
    expect(r.status).toBe(416)
    expect(r.headers['content-range']).toBe('bytes */26')
    expect(strom).toBeNull()
  })

  it('schließt die Datei, wenn der Empfänger mitten im Abruf abbricht (Spulen am Handy)', async () => {
    strom = null
    await new Promise<void>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/gross' }, (res) => {
        // die ersten Bytes sind da – jetzt die Verbindung kappen, wie ein <video>, das springt
        res.once('data', () => {
          req.destroy()
          resolve()
        })
      })
      req.on('error', reject)
      req.end()
    })
    expect(strom).not.toBeNull()
    await vi.waitFor(() => expect(strom?.destroyed).toBe(true), { timeout: 3_000, interval: 50 })
  }, 10_000)
})

describe('fileResponse – eigene Protokolle (media://, jingle://)', () => {
  const anfrage = (range?: string): Request =>
    new Request('http://x/klein', { headers: range ? { Range: range } : {} })

  it('ganze Datei mit 200, CORS-Freigabe nur auf Wunsch', async () => {
    const ohne = await fileResponse(anfrage(), klein, 'audio/mpeg')
    expect(ohne.status).toBe(200)
    expect(await ohne.text()).toBe(ABC)
    expect(ohne.headers.get('Content-Length')).toBe('26')
    expect(ohne.headers.get('Accept-Ranges')).toBe('bytes')
    expect(ohne.headers.get('Access-Control-Allow-Origin')).toBeNull()
    const mit = await fileResponse(anfrage(), klein, 'video/mp4', true)
    expect(mit.headers.get('Access-Control-Allow-Origin')).toBe('*')
    await mit.body?.cancel()
  })

  it('Bereich mit 206 – auch „die letzten N Bytes“, die jingle:// vorher falsch las', async () => {
    const r = await fileResponse(anfrage('bytes=-3'), klein, 'audio/mpeg')
    expect(r.status).toBe(206)
    expect(await r.text()).toBe('xyz')
    expect(r.headers.get('Content-Range')).toBe('bytes 23-25/26')
    expect(r.headers.get('Content-Length')).toBe('3')
    const mitte = await fileResponse(anfrage('bytes=1-3'), klein, 'video/mp4', true)
    expect(await mitte.text()).toBe('bcd')
    expect(mitte.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('Bereich hinter der Datei: 416', async () => {
    const r = await fileResponse(anfrage('bytes=26-'), klein, 'audio/mpeg')
    expect(r.status).toBe(416)
    expect(r.headers.get('Content-Range')).toBe('bytes */26')
  })
})
