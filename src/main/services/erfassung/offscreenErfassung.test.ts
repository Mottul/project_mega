import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Ein Offscreen-Fenster für NDI und Stream (Stufe 2 des Heimnetz-Streams): Fenster nachgebaut,
// geprüft wird, was die Ausgänge vom gemeinsamen Fenster bekommen.
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
    destroy(): void {
      this.destroyed = true
      setTimeout(() => this.closed.forEach((cb) => cb()), 0)
    }
  }
  return { FakeWindow }
})

vi.mock('electron', () => ({ BrowserWindow: h.FakeWindow }))
vi.mock('../windows/appWindows', () => ({
  loadRoute: vi.fn(),
  secureWebPreferences: (o: object) => o
}))
vi.mock('../log', () => ({ logLine: vi.fn() }))

const { OffscreenErfassung, planeErfassung } = await import('./offscreenErfassung')
type Wunsch = import('./offscreenErfassung').ErfassungsWunsch
type Ausgang = import('./offscreenErfassung').ErfassungsAusgang
const { loadRoute } = await import('../windows/appWindows')

const NDI: Wunsch = {
  width: 3840,
  height: 1080,
  fps: 50,
  festeGroesse: true,
  takt: true,
  fit: 'fill'
}
const STREAM: Wunsch = {
  width: 1280,
  height: 720,
  fps: 30,
  festeGroesse: false,
  takt: false,
  ton: true,
  fit: 'contain'
}

function ausgang(
  w: Wunsch,
  will = true
): Ausgang & {
  bilder: ReturnType<typeof vi.fn>
  ende: ReturnType<typeof vi.fn>
} {
  const bilder = vi.fn()
  const ende = vi.fn()
  return {
    wunsch: () => w,
    willBilder: () => will,
    bild: bilder,
    beendet: ende,
    bilder,
    ende
  }
}
const route = (p: { fit: string; ton: boolean }): string =>
  `/player-ndi?fit=${p.fit}&audio=${p.ton ? 1 : 0}`
const bild = (toBitmap = vi.fn(() => Buffer.alloc(32))): Record<string, unknown> => ({
  getSize: () => ({ width: 4, height: 2 }),
  toBitmap
})
const lastWindow = (): InstanceType<typeof h.FakeWindow> => h.FakeWindow.all.at(-1)!

beforeEach(() => {
  h.FakeWindow.all = []
  vi.mocked(loadRoute).mockClear()
})
afterEach(() => vi.useRealTimers())

describe('Plan der Erfassung', () => {
  it('ohne Ausgang kein Fenster', () => {
    expect(planeErfassung([])).toBeNull()
  })

  it('NDI bestimmt die Größe (es sendet das Bild, wie es kommt), der Stream skaliert selbst', () => {
    expect(planeErfassung([STREAM, NDI])).toEqual({
      width: 3840,
      height: 1080,
      fps: 50,
      takt: true,
      ton: true,
      fit: 'fill'
    })
  })

  it('Stream allein: seine Größe, eingebettet, ohne Takt', () => {
    expect(planeErfassung([STREAM])).toEqual({
      width: 1280,
      height: 720,
      fps: 30,
      takt: false,
      ton: true,
      fit: 'contain'
    })
  })
})

describe('Offscreen-Erfassung – ein Fenster für NDI und Stream', () => {
  it('zwei Ausgänge, ein Fenster; geht NDI, passt es sich dem Stream an; mit dem letzten zu', () => {
    const e = new OffscreenErfassung('[t]', { route, autoplay: true })
    const ndi = ausgang(NDI)
    const stream = ausgang(STREAM)
    e.verbinde(ndi)
    e.verbinde(stream)
    expect(h.FakeWindow.all).toHaveLength(1)
    const win = lastWindow()
    expect(win.opts).toMatchObject({ width: 3840, height: 1080 })
    expect(win.opts.webPreferences).toMatchObject({ autoplayPolicy: 'no-user-gesture-required' })
    expect(win.webContents.setFrameRate).toHaveBeenLastCalledWith(50)
    // Ton kam mit dem Stream dazu -> Route mit Ton neu geladen
    expect(loadRoute).toHaveBeenLastCalledWith(win, '/player-ndi?fit=fill&audio=1')

    e.trenne(ndi)
    expect(win.destroyed).toBe(false)
    expect(win.setContentSize).toHaveBeenLastCalledWith(1280, 720)
    expect(win.webContents.setFrameRate).toHaveBeenLastCalledWith(30)
    expect(loadRoute).toHaveBeenLastCalledWith(win, '/player-ndi?fit=contain&audio=1')

    e.trenne(stream)
    expect(win.destroyed).toBe(true)
    expect(e.running).toBe(false)
    expect(stream.ende).not.toHaveBeenCalled() // selbst geschlossen: niemand wird beendet
  })

  it('neues Fenster: Größe gleich nach dem Anlegen noch einmal gesetzt (sonst höchstens Bildschirmgröße)', () => {
    // Gemessen (ST7, Windows, Bildschirm 1920 × 1080 mit Taskleiste): new BrowserWindow mit
    // 3840 × 2160 malte 1920 × 1032, auch mit enableLargerThanScreen – erst setContentSize
    // danach gilt in voller Größe.
    const e = new OffscreenErfassung('[t]', { route })
    e.verbinde(ausgang(NDI))
    const win = lastWindow()
    expect(win.setContentSize).toHaveBeenCalledWith(3840, 1080)
    // macOS hält Fenster sonst im Bildschirm
    expect(win.opts).toMatchObject({ enableLargerThanScreen: true })
  })

  it('ein Bild wird einmal umgewandelt – für alle, die es wollen; ohne Abnehmer gar nicht', () => {
    const e = new OffscreenErfassung('[t]', { route })
    const a = ausgang(NDI)
    const b = ausgang(STREAM)
    const satt = ausgang(STREAM, false)
    e.verbinde(a)
    e.verbinde(b)
    e.verbinde(satt)
    const toBitmap = vi.fn(() => Buffer.alloc(32))
    lastWindow().paint?.(null, null, bild(toBitmap))
    expect(toBitmap).toHaveBeenCalledTimes(1)
    expect(a.bilder).toHaveBeenCalledTimes(1)
    expect(b.bilder.mock.calls[0][0]).toBe(a.bilder.mock.calls[0][0]) // dieselbe Kopie
    expect(satt.bilder).not.toHaveBeenCalled()

    e.trenne(a)
    e.trenne(b)
    const nie = vi.fn(() => Buffer.alloc(32))
    lastWindow().paint?.(null, null, bild(nie))
    expect(nie).not.toHaveBeenCalled()
    // die Größe merkt sich die Erfassung trotzdem (für den Start von ffmpeg)
    expect(e.bildGroesse).toEqual({ width: 4, height: 2 })
    e.trenne(satt)
  })

  it('Neuzeichnen im Takt nur, solange ein Ausgang es verlangt (NDI)', () => {
    vi.useFakeTimers()
    const e = new OffscreenErfassung('[t]', { route })
    const stream = ausgang({ ...STREAM, fps: 25 })
    e.verbinde(stream)
    const win = lastWindow()
    vi.advanceTimersByTime(200)
    expect(win.webContents.invalidate).not.toHaveBeenCalled()

    const ndi = ausgang({ ...NDI, fps: 25 })
    e.verbinde(ndi)
    vi.advanceTimersByTime(200)
    expect(win.webContents.invalidate).toHaveBeenCalledTimes(5) // alle 40 ms

    e.trenne(ndi)
    win.webContents.invalidate.mockClear()
    vi.advanceTimersByTime(200)
    expect(win.webContents.invalidate).not.toHaveBeenCalled()
    e.trenne(stream)
  })

  it('Fenster von außen geschlossen: alle Ausgänge hören auf; ein neues Fenster gilt danach', async () => {
    const e = new OffscreenErfassung('[t]', { route })
    const a = ausgang(NDI)
    const b = ausgang(STREAM)
    e.verbinde(a)
    e.verbinde(b)
    const win = lastWindow()
    expect(e.isOwnWindow(win.webContents.id)).toBe(true)
    win.destroy()
    await vi.waitFor(() => expect(a.ende).toHaveBeenCalled())
    expect(b.ende).toHaveBeenCalled()
    expect(e.running).toBe(false)
    expect(e.isOwnWindow(win.webContents.id)).toBe(false)

    e.verbinde(b)
    expect(h.FakeWindow.all).toHaveLength(2)
    expect(e.isOwnWindow(lastWindow().webContents.id)).toBe(true)
    e.trenne(b)
  })

  it('misst den Weg des Bildes: Übergaben aus dem Spiegel gegen die Ankunft der paints', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const e = new OffscreenErfassung('[t]', { route })
    const stream = { ...ausgang(STREAM), ton: vi.fn() }
    e.verbinde(stream)
    const win = lastWindow()
    const uebergaben: [number, number][] = []
    for (let i = 0; i < 40; i++) {
      uebergaben.push([Date.now(), 6]) // 6 ms nach der Medien-Uhr übergeben
      vi.advanceTimersByTime(15) // so lange braucht das Bild bis zum paint
      win.paint?.(null, null, bild())
      vi.advanceTimersByTime(18)
    }
    expect(e.bildwegStand).toBeNull() // noch nichts gemeldet
    expect(e.bildwegZaehler).toEqual({ paints: 40, uebergaben: 0, verworfen: 0 })
    e.ton({ sampleRate: 48000, channels: [new Float32Array(2)], frame: 0, uebergaben })
    expect(e.bildwegStand).toMatchObject({ ms: 21, weg: 15, spaet: 6, proben: 40 })
    expect(stream.ton).toHaveBeenCalled()
    e.trenne(stream)
  })

  it('Ton nur an Ausgänge, die Ton wollen', () => {
    const e = new OffscreenErfassung('[t]', { route })
    const mit = { ...ausgang(STREAM), ton: vi.fn(), tonFehler: vi.fn() }
    const ohne = { ...ausgang(NDI), ton: vi.fn(), tonFehler: vi.fn() }
    e.verbinde(mit)
    e.verbinde(ohne)
    const t = { sampleRate: 48000, channels: [new Float32Array(2)], frame: 0 }
    e.ton(t)
    e.tonFehler('kein Worklet')
    expect(mit.ton).toHaveBeenCalledWith(t)
    expect(mit.tonFehler).toHaveBeenCalledWith('kein Worklet')
    expect(ohne.ton).not.toHaveBeenCalled()
    expect(ohne.tonFehler).not.toHaveBeenCalled()
    e.trenne(mit)
    e.trenne(ohne)
  })
})
