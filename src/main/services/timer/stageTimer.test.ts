import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimerSegment } from '@shared/types'
import {
  applyTimerCommand,
  disposeTimer,
  getTimerState,
  restoreTimerSetup,
  sanitizeTimerSetup,
  setTimerSetupSink,
  setTimerSinks
} from './stageTimer'

const seg = (id: string, durationSec: number): TimerSegment => ({
  id,
  speaker: '',
  title: id,
  durationSec
})
const st = getTimerState

// Der Timer-Zustand ist ein Modul-Singleton -> vor jedem Test auf eine bekannte
// Basis zurücksetzen (es gibt keinen kompletten Reset-Export).
beforeEach(() => {
  setTimerSinks(
    () => {},
    () => {}
  )
  applyTimerCommand({ type: 'setEndBehavior', behavior: 'overtime' })
  applyTimerCommand({ type: 'setThresholds', warnSec: 120, alertSec: 60 })
  applyTimerCommand({ type: 'clearMessage' })
  applyTimerCommand({ type: 'setSegments', segments: [] })
})
afterEach(() => {
  disposeTimer()
  vi.useRealTimers()
})

describe('stageTimer – Befehlslogik', () => {
  it('setSegments rundet/klemmt Dauer und setzt den ersten Abschnitt', () => {
    applyTimerCommand({ type: 'setSegments', segments: [seg('a', 10.6), seg('b', 0)] })
    expect(st().segments.map((s) => s.durationSec)).toEqual([11, 1]) // gerundet, min 1
    expect(st().current).toBe(0)
    expect(st().remainingSec).toBe(11)
    expect(st().running).toBe(false)
  })

  it('setSegments behält die Restzeit, wenn der laufende Abschnitt (id) bleibt', () => {
    applyTimerCommand({ type: 'setSegments', segments: [seg('a', 100)] })
    applyTimerCommand({ type: 'adjust', deltaSec: -40 })
    expect(st().remainingSec).toBe(60)
    // Neue Liste mit derselben id 'a' -> Restzeit NICHT zurücksetzen.
    applyTimerCommand({ type: 'setSegments', segments: [seg('a', 100), seg('b', 30)] })
    expect(st().current).toBe(0)
    expect(st().remainingSec).toBe(60)
  })

  it('start/pause/toggle schalten „läuft" korrekt', () => {
    applyTimerCommand({ type: 'setSegments', segments: [seg('a', 60)] })
    applyTimerCommand({ type: 'start' })
    expect(st().running).toBe(true)
    applyTimerCommand({ type: 'toggle' })
    expect(st().running).toBe(false)
    applyTimerCommand({ type: 'toggle' })
    expect(st().running).toBe(true)
    applyTimerCommand({ type: 'pause' })
    expect(st().running).toBe(false)
  })

  it('next/prev/goto wechseln Abschnitt + setzen die Restzeit; Ränder sind No-ops', () => {
    applyTimerCommand({ type: 'setSegments', segments: [seg('a', 60), seg('b', 30), seg('c', 90)] })
    applyTimerCommand({ type: 'next' })
    expect(st().current).toBe(1)
    expect(st().remainingSec).toBe(30)
    applyTimerCommand({ type: 'goto', index: 2 })
    expect(st().current).toBe(2)
    expect(st().remainingSec).toBe(90)
    applyTimerCommand({ type: 'next' }) // über das Ende hinaus -> No-op
    expect(st().current).toBe(2)
    applyTimerCommand({ type: 'goto', index: 99 }) // außerhalb -> No-op
    expect(st().current).toBe(2)
  })

  it('reset/resetAll/adjust wirken auf die Restzeit', () => {
    applyTimerCommand({ type: 'setSegments', segments: [seg('a', 60), seg('b', 30)] })
    applyTimerCommand({ type: 'next' }) // -> b, 30
    applyTimerCommand({ type: 'adjust', deltaSec: -5 })
    expect(st().remainingSec).toBe(25)
    applyTimerCommand({ type: 'reset' }) // aktuellen Abschnitt voll
    expect(st().remainingSec).toBe(30)
    applyTimerCommand({ type: 'resetAll' }) // zurück zum ersten, gestoppt
    expect(st().current).toBe(0)
    expect(st().remainingSec).toBe(60)
    expect(st().running).toBe(false)
  })

  it('setThresholds klemmt Alarm <= Warnung', () => {
    applyTimerCommand({ type: 'setThresholds', warnSec: 30, alertSec: 90 })
    expect(st().warnSec).toBe(30)
    expect(st().alertSec).toBe(30)
  })

  it('message setzt eine aufsteigende seq, clearMessage löscht', () => {
    applyTimerCommand({ type: 'message', text: 'Bitte zum Ende kommen', flash: true })
    const first = st().message
    expect(first?.text).toBe('Bitte zum Ende kommen')
    applyTimerCommand({ type: 'message', text: 'Zeit!', flash: false })
    expect(st().message!.seq).toBeGreaterThan(first!.seq)
    applyTimerCommand({ type: 'clearMessage' })
    expect(st().message).toBeNull()
  })
})

describe('stageTimer – Ablauf (Wanduhr-Tick)', () => {
  it('zählt herunter und stoppt bei 0 (endBehavior „stop")', () => {
    vi.useFakeTimers()
    applyTimerCommand({ type: 'setEndBehavior', behavior: 'stop' })
    applyTimerCommand({ type: 'setSegments', segments: [seg('a', 2)] })
    applyTimerCommand({ type: 'start' })
    vi.advanceTimersByTime(1000)
    expect(st().remainingSec).toBeCloseTo(1, 1)
    vi.advanceTimersByTime(1500) // über 0 hinaus
    expect(st().remainingSec).toBe(0)
    expect(st().running).toBe(false)
  })

  it('springt bei 0 zum nächsten Abschnitt (endBehavior „next")', () => {
    vi.useFakeTimers()
    applyTimerCommand({ type: 'setEndBehavior', behavior: 'next' })
    applyTimerCommand({ type: 'setSegments', segments: [seg('a', 1), seg('b', 50)] })
    applyTimerCommand({ type: 'start' })
    vi.advanceTimersByTime(1300)
    expect(st().current).toBe(1)
    expect(st().remainingSec).toBeCloseTo(50, 0)
    expect(st().running).toBe(true)
  })

  it('läuft bei „overtime" ins Minus weiter', () => {
    vi.useFakeTimers()
    applyTimerCommand({ type: 'setEndBehavior', behavior: 'overtime' })
    applyTimerCommand({ type: 'setSegments', segments: [seg('a', 1)] })
    applyTimerCommand({ type: 'start' })
    vi.advanceTimersByTime(2000)
    expect(st().remainingSec).toBeLessThan(0)
    expect(st().running).toBe(true)
  })
})

describe('Stage-Timer – Ablauf merken', () => {
  afterEach(() => setTimerSetupSink(() => {}))

  it('meldet Ablauf-Änderungen, nicht aber den Laufzustand', () => {
    const seen: string[] = []
    setTimerSetupSink((setup) => seen.push(setup.segments.map((x) => x.id).join(',')))
    applyTimerCommand({ type: 'setSegments', segments: [seg('a', 60), seg('b', 30)] })
    applyTimerCommand({ type: 'start' })
    applyTimerCommand({ type: 'adjust', deltaSec: 60 })
    applyTimerCommand({ type: 'pause' })
    applyTimerCommand({ type: 'setThresholds', warnSec: 90, alertSec: 30 })
    expect(seen).toEqual(['a,b', 'a,b'])
  })

  it('Überzieh-Blinken abschaltbar und gemerkt', () => {
    const seen: boolean[] = []
    setTimerSetupSink((setup) => seen.push(setup.overtimeFlash))
    applyTimerCommand({ type: 'setOvertimeFlash', flash: false })
    expect(st().overtimeFlash).toBe(false)
    applyTimerCommand({ type: 'setOvertimeFlash', flash: true })
    expect(seen).toEqual([false, true])
  })

  it('prüft gespeicherte Abläufe und übernimmt alte Felder', () => {
    const setup = sanitizeTimerSetup({
      segments: [
        { id: 'x', label: 'Begrüßung', durationSec: 300 },
        { id: 'y', speaker: 'Anna', title: 'Keynote', durationSec: 1200.4 },
        { id: 'kaputt', durationSec: 0 },
        'Unsinn'
      ],
      warnSec: 60,
      alertSec: 120,
      endBehavior: 'explodieren',
      displayMode: 'clock',
      clockShowDate: false,
      overtimeFlash: 'ja'
    })
    expect(setup?.segments).toEqual([
      { id: 'x', speaker: '', title: 'Begrüßung', durationSec: 300 },
      { id: 'y', speaker: 'Anna', title: 'Keynote', durationSec: 1200 }
    ])
    expect(setup).toMatchObject({
      warnSec: 60,
      alertSec: 60, // nie über der Warnschwelle
      endBehavior: 'overtime',
      displayMode: 'clock',
      clockShowDate: false,
      clockShowSeconds: true,
      overtimeFlash: true // Unsinn -> Vorgabe
    })
    expect(sanitizeTimerSetup(null)).toBeNull()
  })

  it('stellt einen gemerkten Ablauf gestoppt am ersten Abschnitt wieder her', () => {
    applyTimerCommand({ type: 'setSegments', segments: [seg('alt', 10)] })
    applyTimerCommand({ type: 'start' })
    restoreTimerSetup({
      segments: [seg('eins', 120), seg('zwei', 60)],
      warnSec: 30,
      alertSec: 10,
      endBehavior: 'stop',
      displayMode: 'timer',
      showClockInTimer: false,
      clockShowSeconds: true,
      clockShowDate: true,
      overtimeFlash: false
    })
    expect(st()).toMatchObject({
      overtimeFlash: false,
      running: false,
      current: 0,
      remainingSec: 120,
      warnSec: 30,
      endBehavior: 'stop',
      showClockInTimer: false
    })
    expect(st().segments.map((x) => x.id)).toEqual(['eins', 'zwei'])
  })
})
