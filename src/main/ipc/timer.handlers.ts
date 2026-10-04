import { app, ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { TimerCommand, TimerNdiConfig, TimerSetup } from '@shared/types'
import { broadcast } from '../services/broadcast'
import {
  applyTimerCommand,
  getTimerState,
  restoreTimerSetup,
  setTimerSetupSink,
  setTimerSinks
} from '../services/stageTimer'
import { getSettings, setSettings } from '../services/store'
import { closeTimerOutput, openTimerOutput } from '../services/timerWindow'
import { getTimerNdiStatus, startTimerNdi, stopTimerNdi } from '../services/timerNdi'
import {
  getTimerRemoteStatus,
  pushTimerRemoteState,
  pushTimerRemoteTick,
  startTimerRemote,
  stopTimerRemote
} from '../services/timerRemoteServer'
import { registerRemoteControl } from './remoteControls'

export function registerTimerHandlers(): void {
  // Zustand/Ticks an alle Fenster UND – falls aktiv – an die Handy-Clients (SSE).
  setTimerSinks(
    (state) => {
      broadcast(Channels.timerState, state)
      pushTimerRemoteState(state)
    },
    (tick) => {
      broadcast(Channels.timerTick, tick)
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

  ipcMain.handle(Channels.timerGetState, () => getTimerState())
  ipcMain.handle(Channels.timerCommand, (_e, cmd: TimerCommand) => applyTimerCommand(cmd))
  ipcMain.handle(Channels.timerOpenOutput, (_e, displayId: number) => openTimerOutput(displayId))
  ipcMain.handle(Channels.timerCloseOutput, () => closeTimerOutput())

  // NDI-Ausgabe (experimentell; ohne optionales Binding meldet Status "nicht verfügbar")
  ipcMain.handle(Channels.timerNdiStart, (_e, cfg: TimerNdiConfig) => startTimerNdi(cfg))
  ipcMain.handle(Channels.timerNdiStop, () => stopTimerNdi())
  ipcMain.handle(Channels.timerNdiStatus, () => getTimerNdiStatus())

  // Fernsteuerung (Handy/Tablet)
  registerRemoteControl({
    id: 'timer',
    channels: {
      status: Channels.timerRemoteStatus,
      start: Channels.timerRemoteStart,
      stop: Channels.timerRemoteStop,
      changed: Channels.timerRemoteChanged
    },
    start: startTimerRemote,
    stop: stopTimerRemote,
    status: getTimerRemoteStatus
  })
}
