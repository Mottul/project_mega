import { app } from 'electron'
import { ausgabeZiel } from '@shared/ausgabe'
import { Channels } from '@shared/ipc-contracts'
import type { TimerCommand, TimerNdiConfig, TimerSetup } from '@shared/types'
import { broadcast } from '../services/broadcast'
import {
  applyTimerCommand,
  getTimerState,
  restoreTimerSetup,
  setTimerSetupSink,
  setTimerSinks
} from '../services/timer/stageTimer'
import { getSettings, setSettings } from '../services/store'
import { closeTimerOutput, openTimerOutput } from '../services/timer/timerWindow'
import { getTimerNdiStatus, startTimerNdi, stopTimerNdi } from '../services/timer/timerNdi'
import {
  getTimerRemoteStatus,
  pushTimerRemoteState,
  pushTimerRemoteTick,
  startTimerRemote,
  stopTimerRemote
} from '../services/timer/timerRemoteServer'
import { registerRemoteControl } from './remoteControls'
import { handle } from './kanal'

export function registerTimerHandlers(): void {
  // Zustand/Ticks an alle Fenster UND – falls aktiv – an die Handy-Clients (SSE).
  setTimerSinks(
    (state) => {
      broadcast(Channels.timer.onState, state)
      pushTimerRemoteState(state)
    },
    (tick) => {
      broadcast(Channels.timer.onTick, tick)
      pushTimerRemoteTick(tick)
    }
  )

  // Ablauf (Abschnitte, Schwellen, Anzeige) führt der main selbst: beim Start laden, nach
  // Änderungen gebündelt speichern – unabhängig davon, ob das Werkzeug je geöffnet war
  // (auch reine Handy-Bedienung bleibt erhalten).
  restoreTimerSetup(getSettings().timer.setup)
  let pending: TimerSetup | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    if (pending) setSettings({ timer: { setup: pending } })
    pending = null
  }
  setTimerSetupSink((setup) => {
    pending = setup
    // Tippen im Titel erzeugt viele Änderungen -> nicht jede einzeln auf die Platte
    timer ??= setTimeout(flush, 500)
  })
  app.once('will-quit', flush)

  handle(Channels.timer.getState, () => getTimerState())
  handle(Channels.timer.command, (_e, cmd: TimerCommand) => applyTimerCommand(cmd))
  handle(Channels.timer.openOutput, (_e, z: unknown) => {
    const ziel = ausgabeZiel(z)
    if (ziel != null) openTimerOutput(ziel)
  })
  handle(Channels.timer.closeOutput, () => closeTimerOutput())

  // NDI-Ausgabe (experimentell; ohne optionales Binding meldet Status "nicht verfügbar")
  handle(Channels.timer.ndiStart, (_e, cfg: TimerNdiConfig) => startTimerNdi(cfg))
  handle(Channels.timer.ndiStop, () => stopTimerNdi())
  handle(Channels.timer.ndiStatus, () => getTimerNdiStatus())

  // Fernsteuerung (Handy/Tablet)
  registerRemoteControl({
    id: 'timer',
    channels: Channels.timer,
    start: startTimerRemote,
    stop: stopTimerRemote,
    status: getTimerRemoteStatus
  })
}
