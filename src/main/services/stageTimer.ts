// Autoritativer Stage-Timer im main-Prozess (gleiche Architektur wie der
// Player-Zustand): Steuer-UI und Vollbild-Ausgabe schicken Befehle hierher,
// jede Aenderung wird an alle Fenster gebroadcastet. Getickt wird ueber die
// Wanduhr (Date.now()-Delta), nicht ueber Intervall-Zaehlung -> bleibt auch
// bei Timer-Drosselung exakt.

import type {
  StageTimerState,
  StageTimerTick,
  TimerCommand,
  TimerSegment,
  TimerSetup
} from '@shared/types'

type StateSink = (state: StageTimerState) => void
type TickSink = (tick: StageTimerTick) => void
type SetupSink = (setup: TimerSetup) => void

export const EMPTY_TIMER_STATE: StageTimerState = {
  segments: [],
  current: -1,
  running: false,
  remainingSec: 0,
  endBehavior: 'overtime',
  warnSec: 120,
  alertSec: 60,
  message: null,
  displayMode: 'timer',
  showClockInTimer: true,
  clockShowSeconds: true,
  clockShowDate: true,
  overtimeFlash: true,
  outputOpen: false,
  ndiActive: false
}

const state: StageTimerState = { ...EMPTY_TIMER_STATE }
let stateSink: StateSink = () => {}
let tickSink: TickSink = () => {}
let setupSink: SetupSink = () => {}
let interval: ReturnType<typeof setInterval> | null = null
let lastTs = 0
let messageSeq = 0

export function setTimerSinks(s: StateSink, t: TickSink): void {
  stateSink = s
  tickSink = t
}

export function getTimerState(): StageTimerState {
  return state
}

/** Diese Befehle ändern den Ablauf (nicht nur den Laufzustand) -> danach merken. */
const SETUP_COMMANDS = new Set<TimerCommand['type']>([
  'setSegments',
  'setEndBehavior',
  'setThresholds',
  'setDisplayMode',
  'setShowClock',
  'setClockOptions',
  'setOvertimeFlash'
])

/** Gemerkt wird der Ablauf: Abschnitte, Schwellen, Ende-Verhalten, Anzeige. */
export function timerSetupOf(s: StageTimerState): TimerSetup {
  return {
    segments: s.segments.map((seg) => ({ ...seg })),
    warnSec: s.warnSec,
    alertSec: s.alertSec,
    endBehavior: s.endBehavior,
    displayMode: s.displayMode,
    showClockInTimer: s.showClockInTimer,
    clockShowSeconds: s.clockShowSeconds,
    clockShowDate: s.clockShowDate,
    overtimeFlash: s.overtimeFlash
  }
}

/** Wird nach jeder Ablauf-Änderung aufgerufen (der main speichert in settings.json). */
export function setTimerSetupSink(fn: SetupSink): void {
  setupSink = fn
}

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback
const secs = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : fallback

/** Gespeicherten Ablauf prüfen (die Datei kann alt, kaputt oder von Hand bearbeitet sein). */
export function sanitizeTimerSetup(raw: unknown): TimerSetup | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const segments: TimerSegment[] = []
  for (const x of Array.isArray(r.segments) ? r.segments : []) {
    if (!x || typeof x !== 'object') continue
    const seg = x as Record<string, unknown>
    const durationSec = secs(seg.durationSec, 0)
    if (typeof seg.id !== 'string' || durationSec < 1) continue
    segments.push({
      id: seg.id,
      speaker: typeof seg.speaker === 'string' ? seg.speaker : '',
      // ältere Stände kannten nur `label`
      title:
        typeof seg.title === 'string' ? seg.title : typeof seg.label === 'string' ? seg.label : '',
      durationSec
    })
  }
  const warnSec = secs(r.warnSec, EMPTY_TIMER_STATE.warnSec)
  return {
    segments,
    warnSec,
    alertSec: Math.min(secs(r.alertSec, EMPTY_TIMER_STATE.alertSec), warnSec),
    endBehavior: oneOf(['stop', 'overtime', 'next'], r.endBehavior, EMPTY_TIMER_STATE.endBehavior),
    displayMode: oneOf(['timer', 'clock'], r.displayMode, EMPTY_TIMER_STATE.displayMode),
    showClockInTimer:
      typeof r.showClockInTimer === 'boolean'
        ? r.showClockInTimer
        : EMPTY_TIMER_STATE.showClockInTimer,
    clockShowSeconds:
      typeof r.clockShowSeconds === 'boolean'
        ? r.clockShowSeconds
        : EMPTY_TIMER_STATE.clockShowSeconds,
    clockShowDate:
      typeof r.clockShowDate === 'boolean' ? r.clockShowDate : EMPTY_TIMER_STATE.clockShowDate,
    overtimeFlash:
      typeof r.overtimeFlash === 'boolean' ? r.overtimeFlash : EMPTY_TIMER_STATE.overtimeFlash
  }
}

/** Gemerkten Ablauf beim Start übernehmen: gestoppt, erster Abschnitt mit voller Zeit. */
export function restoreTimerSetup(raw: unknown): void {
  const setup = sanitizeTimerSetup(raw)
  if (!setup) return
  stopTicking()
  Object.assign(state, setup, {
    running: false,
    current: setup.segments.length ? 0 : -1,
    remainingSec: setup.segments[0]?.durationSec ?? 0
  })
  emitState()
}

function emitState(): void {
  stateSink({ ...state, segments: [...state.segments] })
}

function emitTick(): void {
  tickSink({ remainingSec: state.remainingSec, running: state.running, current: state.current })
}

function currentSegment(): TimerSegment | null {
  return state.current >= 0 && state.current < state.segments.length
    ? state.segments[state.current]
    : null
}

function stopTicking(): void {
  if (interval) {
    clearInterval(interval)
    interval = null
  }
}

function startTicking(): void {
  if (interval) return
  lastTs = Date.now()
  interval = setInterval(() => {
    const now = Date.now()
    const dt = (now - lastTs) / 1000
    lastTs = now
    const before = state.remainingSec
    state.remainingSec -= dt

    // 0:00 ueberschritten -> Ablauf-Verhalten anwenden
    if (before > 0 && state.remainingSec <= 0) {
      if (state.endBehavior === 'stop') {
        state.remainingSec = 0
        state.running = false
        stopTicking()
        emitState()
        return
      }
      if (state.endBehavior === 'next') {
        if (state.current < state.segments.length - 1) {
          goTo(state.current + 1, true)
          emitState()
          return
        }
        // letzter Abschnitt -> stehen bleiben
        state.remainingSec = 0
        state.running = false
        stopTicking()
        emitState()
        return
      }
      // 'overtime' -> einfach ins Minus weiterzaehlen (Anzeige blinkt rot)
    }
    emitTick()
  }, 200)
}

function goTo(index: number, keepRunning: boolean): void {
  if (index < 0 || index >= state.segments.length) return
  state.current = index
  state.remainingSec = state.segments[index].durationSec
  state.running = keepRunning && state.running
  if (!state.running) stopTicking()
}

export function applyTimerCommand(cmd: TimerCommand): void {
  switch (cmd.type) {
    case 'setSegments': {
      const prevId = currentSegment()?.id ?? null
      state.segments = cmd.segments.map((s) => ({
        ...s,
        durationSec: Math.max(1, Math.round(s.durationSec))
      }))
      if (state.segments.length === 0) {
        state.current = -1
        state.remainingSec = 0
        state.running = false
        stopTicking()
        break
      }
      // Laeuft der aktuelle Abschnitt noch (gleiche id)? -> Restzeit behalten.
      const keep = prevId ? state.segments.findIndex((s) => s.id === prevId) : -1
      if (keep >= 0) {
        state.current = keep
      } else {
        state.current = Math.max(0, Math.min(state.current, state.segments.length - 1))
        state.remainingSec = state.segments[state.current].durationSec
        state.running = false
        stopTicking()
      }
      break
    }
    case 'start':
      if (state.current < 0 && state.segments.length > 0) goTo(0, false)
      if (state.current >= 0) {
        state.running = true
        startTicking()
      }
      break
    case 'pause':
      state.running = false
      stopTicking()
      break
    case 'toggle':
      applyTimerCommand({ type: state.running ? 'pause' : 'start' })
      return // emitState passiert im rekursiven Aufruf
    case 'reset': {
      const seg = currentSegment()
      if (seg) state.remainingSec = seg.durationSec
      break
    }
    case 'resetAll':
      state.running = false
      stopTicking()
      if (state.segments.length > 0) {
        state.current = 0
        state.remainingSec = state.segments[0].durationSec
      } else {
        state.current = -1
        state.remainingSec = 0
      }
      break
    case 'next':
      goTo(state.current + 1, true)
      break
    case 'prev':
      goTo(state.current - 1, true)
      break
    case 'goto':
      goTo(cmd.index, true)
      break
    case 'adjust':
      if (state.current >= 0) state.remainingSec += cmd.deltaSec
      break
    case 'setEndBehavior':
      state.endBehavior = cmd.behavior
      break
    case 'setThresholds':
      state.warnSec = Math.max(0, Math.round(cmd.warnSec))
      state.alertSec = Math.max(0, Math.min(Math.round(cmd.alertSec), state.warnSec))
      break
    case 'setDisplayMode':
      state.displayMode = cmd.mode
      break
    case 'setShowClock':
      state.showClockInTimer = cmd.show
      break
    case 'setClockOptions':
      if (cmd.showSeconds !== undefined) state.clockShowSeconds = cmd.showSeconds
      if (cmd.showDate !== undefined) state.clockShowDate = cmd.showDate
      break
    case 'setOvertimeFlash':
      state.overtimeFlash = cmd.flash
      break
    case 'message':
      state.message = { text: cmd.text, flash: cmd.flash, seq: ++messageSeq }
      break
    case 'clearMessage':
      state.message = null
      break
  }
  if (SETUP_COMMANDS.has(cmd.type)) setupSink(timerSetupOf(state))
  emitState()
}

export function setTimerOutputOpen(open: boolean): void {
  state.outputOpen = open
  emitState()
}

export function setTimerNdiActive(active: boolean): void {
  if (state.ndiActive === active) return
  state.ndiActive = active
  emitState()
}

export function disposeTimer(): void {
  stopTicking()
}
