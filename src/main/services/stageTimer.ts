// Autoritativer Stage-Timer im main-Prozess (gleiche Architektur wie der
// Player-Zustand): Steuer-UI und Vollbild-Ausgabe schicken Befehle hierher,
// jede Aenderung wird an alle Fenster gebroadcastet. Getickt wird ueber die
// Wanduhr (Date.now()-Delta), nicht ueber Intervall-Zaehlung -> bleibt auch
// bei Timer-Drosselung exakt.

import type { StageTimerState, StageTimerTick, TimerCommand, TimerSegment } from '@shared/types'

type StateSink = (state: StageTimerState) => void
type TickSink = (tick: StageTimerTick) => void

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
  outputOpen: false
}

const state: StageTimerState = { ...EMPTY_TIMER_STATE }
let stateSink: StateSink = () => {}
let tickSink: TickSink = () => {}
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
    case 'message':
      state.message = { text: cmd.text, flash: cmd.flash, seq: ++messageSeq }
      break
    case 'clearMessage':
      state.message = null
      break
  }
  emitState()
}

export function setTimerOutputOpen(open: boolean): void {
  state.outputOpen = open
  emitState()
}

export function disposeTimer(): void {
  stopTicking()
}
