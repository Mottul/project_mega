import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RASTER_ANLAUF_MS } from './bildRaster'
import { StockWaechter, type Stockungen } from './stockWaechter'

/** Wächter an der Wanduhr der falschen Timer – so lässt sich ein Stocken nachstellen */
function waechter(): { w: StockWaechter; gemeldet: Stockungen[] } {
  const gemeldet: Stockungen[] = []
  const w = new StockWaechter(
    (s) => gemeldet.push(s),
    () => Date.now()
  )
  return { w, gemeldet }
}

/** Der main-Prozess steht `ms` lang: Die Uhr läuft weiter, kein Takt kommt dran. */
function stocken(ms: number): void {
  vi.setSystemTime(Date.now() + ms)
}

/** gestartet und über den Anlauf hinaus */
function laeuft(w: StockWaechter): void {
  w.start()
  vi.advanceTimersByTime(RASTER_ANLAUF_MS + 1000)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})
afterEach(() => vi.useRealTimers())

describe('Stockungen des main-Prozesses', () => {
  it('ruhiger main: keine Meldung', () => {
    const { w, gemeldet } = waechter()
    laeuft(w)
    vi.advanceTimersByTime(30_000)
    w.stop()
    expect(gemeldet).toEqual([])
  })

  it('ein Hänger von 800 ms: sofort gemeldet, einmal, mit seiner Länge', () => {
    const { w, gemeldet } = waechter()
    laeuft(w)
    stocken(800)
    vi.advanceTimersByTime(20)
    expect(gemeldet).toEqual([{ n: 1, maxMs: 800 }])
    vi.advanceTimersByTime(10_000)
    w.stop()
    expect(gemeldet).toHaveLength(1)
  })

  it('bis 50 ms zu spät zählt nicht (Zittern des Takts), darüber schon', () => {
    const { w, gemeldet } = waechter()
    laeuft(w)
    stocken(50)
    vi.advanceTimersByTime(20)
    expect(gemeldet).toEqual([])
    stocken(51)
    vi.advanceTimersByTime(20)
    expect(gemeldet).toEqual([{ n: 1, maxMs: 51 }])
  })

  it('mehrere Hänger kurz hintereinander: gesammelt, höchstens alle 5 s eine Meldung', () => {
    const { w, gemeldet } = waechter()
    laeuft(w)
    stocken(800)
    vi.advanceTimersByTime(20)
    vi.advanceTimersByTime(2500)
    stocken(300)
    vi.advanceTimersByTime(20)
    vi.advanceTimersByTime(1000)
    stocken(120)
    vi.advanceTimersByTime(20)
    expect(gemeldet).toEqual([{ n: 1, maxMs: 800 }])
    vi.advanceTimersByTime(5000)
    expect(gemeldet).toEqual([
      { n: 1, maxMs: 800 },
      { n: 2, maxMs: 300 }
    ])
  })

  it('im Anlauf nach dem Start zählt nichts', () => {
    const { w, gemeldet } = waechter()
    w.start()
    vi.advanceTimersByTime(500)
    stocken(800)
    vi.advanceTimersByTime(20)
    vi.advanceTimersByTime(10_000)
    w.stop()
    expect(gemeldet).toEqual([])
  })

  it('Stopp: Gesammeltes geht noch hinaus, danach kein Takt mehr; neu gestartet von vorn', () => {
    const { w, gemeldet } = waechter()
    laeuft(w)
    stocken(800)
    vi.advanceTimersByTime(20)
    vi.advanceTimersByTime(1000)
    stocken(200)
    vi.advanceTimersByTime(20)
    w.stop()
    expect(gemeldet).toEqual([
      { n: 1, maxMs: 800 },
      { n: 1, maxMs: 200 }
    ])
    stocken(900)
    vi.advanceTimersByTime(10_000)
    expect(gemeldet).toHaveLength(2)
    // neuer Start: wieder mit Anlauf, die erste Stockung danach sofort
    w.start()
    vi.advanceTimersByTime(500)
    stocken(400)
    vi.advanceTimersByTime(20)
    expect(gemeldet).toHaveLength(2)
    vi.advanceTimersByTime(RASTER_ANLAUF_MS)
    stocken(150)
    vi.advanceTimersByTime(20)
    expect(gemeldet.at(-1)).toEqual({ n: 1, maxMs: 150 })
    w.stop()
  })
})
