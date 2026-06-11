import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { TimerCommand } from '@shared/types'
import { broadcast } from '../services/broadcast'
import { applyTimerCommand, getTimerState, setTimerSinks } from '../services/stageTimer'
import { closeTimerOutput, openTimerOutput } from '../services/timerWindow'

export function registerTimerHandlers(): void {
  setTimerSinks(
    (state) => broadcast(Channels.timerState, state),
    (tick) => broadcast(Channels.timerTick, tick)
  )

  ipcMain.handle(Channels.timerGetState, () => getTimerState())
  ipcMain.handle(Channels.timerCommand, (_e, cmd: TimerCommand) => applyTimerCommand(cmd))
  ipcMain.handle(Channels.timerOpenOutput, (_e, displayId: number) => openTimerOutput(displayId))
  ipcMain.handle(Channels.timerCloseOutput, () => closeTimerOutput())
}
