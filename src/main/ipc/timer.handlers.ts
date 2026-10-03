import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { TimerCommand, TimerNdiConfig } from '@shared/types'
import { broadcast } from '../services/broadcast'
import { applyTimerCommand, getTimerState, setTimerSinks } from '../services/stageTimer'
import { closeTimerOutput, openTimerOutput } from '../services/timerWindow'
import { getTimerNdiStatus, startTimerNdi, stopTimerNdi } from '../services/timerNdi'
import {
  getTimerRemoteStatus,
  pushTimerRemoteState,
  pushTimerRemoteTick,
  startTimerRemote,
  stopTimerRemote
} from '../services/timerRemoteServer'
import { syncedRemoteStatus, withAppLink } from '../services/remoteAppServer'

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

  ipcMain.handle(Channels.timerGetState, () => getTimerState())
  ipcMain.handle(Channels.timerCommand, (_e, cmd: TimerCommand) => applyTimerCommand(cmd))
  ipcMain.handle(Channels.timerOpenOutput, (_e, displayId: number) => openTimerOutput(displayId))
  ipcMain.handle(Channels.timerCloseOutput, () => closeTimerOutput())

  // NDI-Ausgabe (experimentell; ohne optionales Binding meldet Status "nicht verfügbar")
  ipcMain.handle(Channels.timerNdiStart, (_e, cfg: TimerNdiConfig) => startTimerNdi(cfg))
  ipcMain.handle(Channels.timerNdiStop, () => stopTimerNdi())
  ipcMain.handle(Channels.timerNdiStatus, () => getTimerNdiStatus())

  // Fernsteuerung (Handy/Tablet)
  ipcMain.handle(Channels.timerRemoteStatus, () => withAppLink('timer', getTimerRemoteStatus()))
  ipcMain.handle(Channels.timerRemoteStart, async (_e, port: number) => {
    await startTimerRemote(port)
    const status = await syncedRemoteStatus('timer', getTimerRemoteStatus)
    broadcast(Channels.timerRemoteChanged, status)
    return status
  })
  ipcMain.handle(Channels.timerRemoteStop, async () => {
    stopTimerRemote()
    const status = await syncedRemoteStatus('timer', getTimerRemoteStatus)
    broadcast(Channels.timerRemoteChanged, status)
    return status
  })
}
