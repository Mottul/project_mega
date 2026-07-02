import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { TimerCommand, TimerNdiConfig } from '@shared/types'
import { broadcast } from '../services/broadcast'
import { applyTimerCommand, getTimerState, setTimerSinks } from '../services/stageTimer'
import { closeTimerOutput, openTimerOutput } from '../services/timerWindow'
import { getTimerNdiStatus, startTimerNdi, stopTimerNdi } from '../services/timerNdi'

export function registerTimerHandlers(): void {
  setTimerSinks(
    (state) => broadcast(Channels.timerState, state),
    (tick) => broadcast(Channels.timerTick, tick)
  )

  ipcMain.handle(Channels.timerGetState, () => getTimerState())
  ipcMain.handle(Channels.timerCommand, (_e, cmd: TimerCommand) => applyTimerCommand(cmd))
  ipcMain.handle(Channels.timerOpenOutput, (_e, displayId: number) => openTimerOutput(displayId))
  ipcMain.handle(Channels.timerCloseOutput, () => closeTimerOutput())

  // NDI-Ausgabe (experimentell; ohne optionales Binding meldet Status "nicht verfügbar")
  ipcMain.handle(Channels.timerNdiStart, (_e, cfg: TimerNdiConfig) => startTimerNdi(cfg))
  ipcMain.handle(Channels.timerNdiStop, () => stopTimerNdi())
  ipcMain.handle(Channels.timerNdiStatus, () => getTimerNdiStatus())
}
