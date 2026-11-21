import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fenster und NDI-Binding nachgebaut: geprüft wird die Reihenfolge von Start, Stopp und Abbau,
// an der die echten Sender schon gescheitert sind (Absturz beim Stoppen, verwaister Sender) –
// seit Stufe 2 des Streams mit der Offscreen-Erfassung, aus der NDI seine Bilder bekommt.
const h = vi.hoisted(() => {
  let nextId = 0
  class FakeWindow {
    static all: FakeWindow[] = []
    destroyed = false
    closed: (() => void)[] = []
    paint: ((e: unknown, dirty: unknown, image: unknown) => void) | null = null
    setContentSize = vi.fn()
    webContents = {
      id: ++nextId,
      setFrameRate: vi.fn(),
      invalidate: vi.fn(),
      on: (ev: string, cb: FakeWindow['paint']) => {
        if (ev === 'paint') this.paint = cb
      }
    }
    constructor(public opts: Record<string, unknown>) {
      FakeWindow.all.push(this)
    }
    on(ev: string, cb: () => void): void {
      if (ev === 'closed') this.closed.push(cb)
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    // wie Electron: 'closed' kommt erst nach dem Aufruf
    destroy(): void {
      this.destroyed = true
      setTimeout(() => this.closed.forEach((cb) => cb()), 0)
    }
  }
  const g = { send: vi.fn(), FOURCC_BGRA: 11, FOURCC_FLTp: 22, FORMAT_TYPE_PROGRESSIVE: 1 }
  return { FakeWindow, g, available: { value: true } }
})

vi.mock('electron', () => ({ BrowserWindow: h.FakeWindow }))
vi.mock('../windows/appWindows', () => ({
  loadRoute: vi.fn(),
  secureWebPreferences: (o: object) => o
}))
vi.mock('../log', () => ({ logLine: vi.fn() }))
vi.mock('./ndi', () => ({
  loadGrandiose: () => (h.available.value ? h.g : null),
  getNdiLoadError: () => (h.available.value ? null : 'NDI-Modul nicht geladen'),
  ensureNdiInitialized: async () => {}
}))

const { NdiSender } = await import('./ndiSender')
const { OffscreenErfassung } = await import('../erfassung/offscreenErfassung')
const { loadRoute } = await import('../windows/appWindows')

const size = { name: 'Bühne', width: 640, height: 360, fps: 25 }
const image = { getSize: () => ({ width: 4, height: 2 }), toBitmap: () => Buffer.alloc(32) }
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const timerErfassung = (): InstanceType<typeof OffscreenErfassung> =>
  new OffscreenErfassung('[t-erf]', { route: () => '/timer-output' })
const playerErfassung = (): InstanceType<typeof OffscreenErfassung> =>
  new OffscreenErfassung('[p-erf]', {
    route: (p) => `/player-ndi?fit=${p.fit}&audio=${p.ton ? 1 : 0}`,
    autoplay: true
  })

function fakeSender(): {
  video: ReturnType<typeof vi.fn>
  audio: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
} {
  return {
    video: vi.fn(async () => {}),
    audio: vi.fn(async () => {}),
    destroy: vi.fn(async () => {})
  }
}
const lastWindow = (): InstanceType<typeof h.FakeWindow> => h.FakeWindow.all.at(-1)!

beforeEach(() => {
  h.FakeWindow.all = []
  h.available.value = true
  h.g.send.mockReset()
  vi.mocked(loadRoute).mockClear()
})

describe('NDI-Sender an der Offscreen-Erfassung', () => {
  it('startet Sender und Offscreen-Fenster mit Route und Bildrate, Stopp baut beides ab', async () => {
    const s = fakeSender()
    h.g.send.mockResolvedValue(s)
    const emit = vi.fn()
    const erfassung = timerErfassung()
    const ndi = new NdiSender('[t]', emit, erfassung)
    await ndi.start(size)

    expect(h.g.send).toHaveBeenCalledWith({ name: 'Bühne', clockVideo: true, clockAudio: false })
    const win = lastWindow()
    expect(win.opts).toMatchObject({
      show: false,
      width: 640,
      height: 360,
      webPreferences: { offscreen: true, backgroundThrottling: false }
    })
    expect(win.opts.webPreferences).not.toHaveProperty('autoplayPolicy')
    expect(win.webContents.setFrameRate).toHaveBeenCalledWith(25)
    expect(loadRoute).toHaveBeenCalledWith(win, '/timer-output')
    expect(ndi.running).toBe(true)
    expect(erfassung.isOwnWindow(win.webContents.id)).toBe(true)
    expect(emit).toHaveBeenCalled()

    win.paint?.(null, null, image)
    await vi.waitFor(() => expect(ndi.framesSent).toBe(1))
    expect(s.video).toHaveBeenCalledWith(
      expect.objectContaining({ xres: 4, yres: 2, lineStrideBytes: 16, frameRateN: 25000 })
    )

    ndi.stop()
    expect(win.destroyed).toBe(true)
    expect(ndi.running).toBe(false)
    expect(erfassung.isOwnWindow(win.webContents.id)).toBe(false)
    await vi.waitFor(() => expect(s.destroy).toHaveBeenCalled())
  })

  it('Ton und Autoplay für den Player-Spiegel; der Ton kommt über die Erfassung', async () => {
    const s = fakeSender()
    h.g.send.mockResolvedValue(s)
    const erfassung = playerErfassung()
    const ndi = new NdiSender('[p]', () => {}, erfassung)
    await ndi.start(size, { audio: true, fit: 'fill' })
    expect(h.g.send).toHaveBeenCalledWith({ name: 'Bühne', clockVideo: true, clockAudio: true })
    expect(lastWindow().opts.webPreferences).toMatchObject({
      autoplayPolicy: 'no-user-gesture-required'
    })
    expect(loadRoute).toHaveBeenCalledWith(lastWindow(), '/player-ndi?fit=fill&audio=1')
    erfassung.ton({ sampleRate: 48000, channels: [new Float32Array([0.5, -0.5])] })
    await vi.waitFor(() => expect(ndi.audioChunks).toBe(1))
    ndi.stop(false)
  })

  it('Stopp mitten im Start: der Sender wird wieder abgebaut, kein Fenster geöffnet', async () => {
    const s = fakeSender()
    let created: (v: unknown) => void = () => {}
    h.g.send.mockImplementation(() => new Promise((r) => (created = r)))
    const ndi = new NdiSender('[t]', () => {}, timerErfassung())
    const starting = ndi.start(size)
    await vi.waitFor(() => expect(h.g.send).toHaveBeenCalled())
    ndi.stop(false)
    created(s)
    await starting

    expect(ndi.running).toBe(false)
    expect(h.FakeWindow.all).toHaveLength(0)
    await vi.waitFor(() => expect(s.destroy).toHaveBeenCalled())
  })

  it('„closed“ des alten Fensters nach einem Neustart stoppt den neuen Sender nicht', async () => {
    const s1 = fakeSender()
    const s2 = fakeSender()
    h.g.send.mockResolvedValueOnce(s1).mockResolvedValueOnce(s2)
    const erfassung = timerErfassung()
    const ndi = new NdiSender('[t]', () => {}, erfassung)
    await ndi.start(size)
    const first = lastWindow()
    await ndi.start({ ...size, width: 1280, height: 720 })
    const second = lastWindow()
    await sleep(10) // 'closed' des ersten Fensters ist jetzt durch

    expect(first.destroyed).toBe(true)
    expect(ndi.running).toBe(true)
    expect(erfassung.isOwnWindow(second.webContents.id)).toBe(true)
    expect(second.opts).toMatchObject({ width: 1280, height: 720 })
    expect(s1.destroy).toHaveBeenCalled()
    expect(s2.destroy).not.toHaveBeenCalled()

    // Fenster von außen geschlossen (z. B. App-Ende) -> sauber gestoppt
    second.destroy()
    await vi.waitFor(() => expect(ndi.running).toBe(false))
    await vi.waitFor(() => expect(s2.destroy).toHaveBeenCalled())
  })

  it('zerstört den Sender erst nach dem laufenden Bild; Bilder während eines Sends verworfen', async () => {
    const s = fakeSender()
    let finish: (v?: unknown) => void = () => {}
    s.video.mockImplementation(() => new Promise((r) => (finish = r)))
    h.g.send.mockResolvedValue(s)
    const toBitmap = vi.fn(() => Buffer.alloc(32))
    const ndi = new NdiSender('[t]', () => {}, timerErfassung())
    await ndi.start(size)
    const win = lastWindow()

    win.paint?.(null, null, { ...image, toBitmap })
    win.paint?.(null, null, { ...image, toBitmap }) // noch im Flug -> verworfen
    await sleep(0)
    expect(s.video).toHaveBeenCalledTimes(1)
    // … und gar nicht erst umgewandelt (8 MB je Bild bei 1080p)
    expect(toBitmap).toHaveBeenCalledTimes(1)

    ndi.stop()
    await sleep(80)
    expect(s.destroy).not.toHaveBeenCalled()
    finish()
    await vi.waitFor(() => expect(s.destroy).toHaveBeenCalled())
    expect(ndi.framesSent).toBe(1)
  })

  it('Sendefehler verschwindet mit dem nächsten Bild, ein gemeldetes Problem bleibt stehen', async () => {
    const s = fakeSender()
    s.video
      .mockRejectedValueOnce(new Error('weg'))
      .mockImplementationOnce(() => {
        throw new Error('sofort')
      })
      .mockResolvedValue(undefined)
    h.g.send.mockResolvedValue(s)
    const erfassung = playerErfassung()
    const ndi = new NdiSender('[t]', () => {}, erfassung)
    await ndi.start(size, { audio: true })
    const paint = async (): Promise<void> => {
      lastWindow().paint?.(null, null, image)
      await sleep(0)
    }

    await paint()
    expect(ndi.error).toBe('NDI-Send fehlgeschlagen: weg')
    // auch ein synchroner Wurf des Bindings darf das Senden nicht für immer blockieren
    await paint()
    expect(ndi.error).toBe('NDI-Send fehlgeschlagen: sofort')
    await paint()
    expect(ndi.error).toBeNull()
    expect(ndi.framesSent).toBe(1)

    erfassung.tonFehler('kein Worklet')
    await paint()
    expect(ndi.error).toBe('Audio-Tap: kein Worklet')
    ndi.stop(false)
  })

  it('Sender lässt sich nicht erstellen: zweiter Versuch, dann Hinweis statt Fenster', async () => {
    h.g.send.mockRejectedValue(new Error('NDIlib_send_create'))
    const ndi = new NdiSender('[t]', () => {}, timerErfassung())
    await ndi.start(size)
    expect(h.g.send).toHaveBeenCalledTimes(2)
    expect(ndi.running).toBe(false)
    expect(h.FakeWindow.all).toHaveLength(0)
    expect(ndi.error).toMatch(/^NDI-Sender nicht erstellt: NDIlib_send_create .*Firewall/)
  })

  it('Ton: ungültige Blöcke verworfen, Pegel gemessen, Stau begrenzt', async () => {
    const s = fakeSender()
    const pending: (() => void)[] = []
    s.audio.mockImplementation(() => new Promise<void>((r) => pending.push(r)))
    h.g.send.mockResolvedValue(s)
    const ndi = new NdiSender('[p]', () => {}, playerErfassung())
    await ndi.start(size, { audio: true })

    ndi.pushAudio({ sampleRate: 48000, channels: [new Float32Array(4), new Float32Array(2)] })
    expect(s.audio).not.toHaveBeenCalled()

    const chunk = { sampleRate: 48000, channels: [new Float32Array([0.2, -0.8])] }
    for (let i = 0; i < 12; i++) ndi.pushAudio(chunk)
    expect(s.audio).toHaveBeenCalledTimes(9) // höchstens 9 im Flug, der Rest verworfen
    expect(ndi.audioLevel).toBeCloseTo(0.8)
    expect(s.audio).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 48000, noChannels: 1, noSamples: 2, fourCC: 22 })
    )

    pending.forEach((r) => r())
    await vi.waitFor(() => expect(ndi.audioChunks).toBe(9))
    ndi.stop(false)
  })

  it('Ton aus: die Erfassung reicht keinen Ton an NDI', async () => {
    const s = fakeSender()
    h.g.send.mockResolvedValue(s)
    const erfassung = playerErfassung()
    const ndi = new NdiSender('[p]', () => {}, erfassung)
    await ndi.start(size, { audio: false })
    expect(loadRoute).toHaveBeenCalledWith(lastWindow(), '/player-ndi?fit=contain&audio=0')
    erfassung.ton({ sampleRate: 48000, channels: [new Float32Array([0.5])] })
    await sleep(0)
    expect(s.audio).not.toHaveBeenCalled()
    ndi.stop(false)
  })

  it('ohne NDI-Modul: Start tut nichts, der Grund steht im Fehler', async () => {
    h.available.value = false
    const ndi = new NdiSender('[t]', () => {}, timerErfassung())
    await ndi.start(size)
    expect(ndi.available).toBe(false)
    expect(ndi.running).toBe(false)
    expect(h.g.send).not.toHaveBeenCalled()
    expect(ndi.error).toBe('NDI-Modul nicht geladen')
  })
})
