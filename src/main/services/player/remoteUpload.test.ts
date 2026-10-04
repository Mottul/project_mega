// Upload der Player-Fernsteuerung gegen einen echten HTTP-Server – mit kleinen Grenzen,
// damit Größen-, Platz- und Abbruchfälle ohne Gigabytes prüfbar sind.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const userData = mkdtempSync(join(tmpdir(), 'mottulbox-upload-'))
const enqueue = vi.fn()

vi.mock('electron', () => ({ app: { getPath: () => userData, isPackaged: false } }))
vi.mock('../log', () => ({ logLine: () => {} }))
vi.mock('../store', () => ({
  getSettings: () => ({
    player: { defaultFit: 'blur', wallWidth: 1920, wallHeight: 1080, savedPlaylists: [] }
  })
}))
vi.mock('./convertManager', () => ({
  ALLOWED_MEDIA_EXT: new Set(['.mp4', '.mov']),
  convertManager: { enqueue: (...a: unknown[]) => enqueue(...a) }
}))
vi.mock('./mediaLibrary', () => ({ listMedia: () => [], resolveMediaFile: () => null }))
vi.mock('./playerState', () => ({ applyCommand: () => {}, getPlayerState: () => ({}) }))

const { receiveUpload } = await import('./remoteServer')
type Limits = Parameters<typeof receiveUpload>[2]

let limits: NonNullable<Limits>
let server: Server
let port = 0
const uploads = join(userData, 'player-uploads')
const leftovers = (): string[] => (existsSync(uploads) ? readdirSync(uploads) : [])

beforeAll(async () => {
  server = createServer((req, res) => receiveUpload(req, res, limits))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
})
afterAll(async () => {
  await new Promise((r) => server.close(r))
  rmSync(userData, { recursive: true, force: true })
})
beforeEach(() => {
  limits = { maxBytes: 1000, minFreeBytes: 500, freeBytes: () => 1_000_000 }
  enqueue.mockClear()
  rmSync(uploads, { recursive: true, force: true })
})

type Result = { status: number; body: { ok?: boolean; error?: string } } | 'abgebrochen'

/** Upload senden: mit Content-Length, gestückelt (chunked) oder mittendrin abgebrochen. */
function upload(
  name: string,
  data: Buffer,
  mode: 'length' | 'chunked' | 'abort' = 'length'
): Promise<Result> {
  return new Promise((resolve) => {
    const headers: Record<string, string | number> = { 'x-filename': encodeURIComponent(name) }
    if (mode !== 'chunked') headers['content-length'] = data.length
    const req = request({ host: '127.0.0.1', port, method: 'POST', path: '/', headers }, (res) => {
      let text = ''
      res.on('data', (c: Buffer) => (text += c.toString()))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(text || '{}') }))
      res.on('error', () => resolve('abgebrochen'))
    })
    req.on('error', () => resolve('abgebrochen'))
    if (mode === 'abort') {
      req.write(data.subarray(0, data.length / 2), () => {
        setTimeout(() => {
          req.destroy()
          resolve('abgebrochen')
        }, 50)
      })
      return
    }
    // in Stücken schreiben, damit die Größenprüfung beim Streamen greift
    for (let i = 0; i < data.length; i += 256) req.write(data.subarray(i, i + 256))
    req.end()
  })
}

const waitFor = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 20))
}

describe('Upload der Player-Fernsteuerung', () => {
  it('speichert eine erlaubte Datei und reiht sie zur Konvertierung ein', async () => {
    const data = Buffer.alloc(800, 7)
    const res = await upload('Clip 1.mp4', data)
    expect(res).toEqual({ status: 200, body: { ok: true } })
    expect(enqueue).toHaveBeenCalledTimes(1)
    const { sources, fitMode } = enqueue.mock.calls[0][0] as { sources: string[]; fitMode: string }
    expect(fitMode).toBe('blur')
    expect(readFileSync(sources[0])).toEqual(data)
    expect(sources[0].endsWith('Clip 1.mp4')).toBe(true)
  })

  it('weist zu große Dateien schon am Content-Length ab', async () => {
    const res = await upload('gross.mp4', Buffer.alloc(1500))
    expect(res).toMatchObject({
      status: 413,
      body: { ok: false, error: expect.stringMatching(/zu groß/) }
    })
    expect(enqueue).not.toHaveBeenCalled()
    expect(leftovers()).toEqual([])
  })

  it('weist Uploads ab, wenn danach zu wenig Platz bliebe', async () => {
    limits.freeBytes = () => 1200
    const res = await upload('knapp.mp4', Buffer.alloc(800))
    expect(res).toMatchObject({
      status: 507,
      body: { ok: false, error: expect.stringMatching(/Speicher/) }
    })
    expect(enqueue).not.toHaveBeenCalled()
    expect(leftovers()).toEqual([])
  })

  it('bricht ohne Content-Length beim Überschreiten der Grenze ab und räumt auf', async () => {
    // Der Server trennt nach der Antwort – je nach Timing sieht der Client nur den Abbruch.
    const res = await upload('endlos.mp4', Buffer.alloc(5000), 'chunked')
    if (res !== 'abgebrochen') expect(res.status).toBe(413)
    await waitFor(() => leftovers().length === 0)
    expect(leftovers()).toEqual([])
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('räumt halbe Dateien weg, wenn das Handy die Verbindung verliert', async () => {
    await upload('halb.mp4', Buffer.alloc(900), 'abort')
    await waitFor(() => leftovers().length === 0)
    expect(leftovers()).toEqual([])
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('lehnt fremde Dateitypen ab', async () => {
    const res = await upload('tool.exe', Buffer.alloc(10))
    expect(res).toEqual({ status: 415, body: { ok: false, error: 'Dateityp nicht unterstützt' } })
    expect(leftovers()).toEqual([])
  })
})
