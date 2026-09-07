import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { YtEnqueueRequest } from '@shared/types'
import { broadcast } from '../services/broadcast'
import { getStatus, setStatusSink, updateTool, ytManager } from '../services/ytdlp/ytDlp'

let wired = false

export function registerYoutubeHandlers(): void {
  if (!wired) {
    wired = true
    ytManager.setSink((job) => broadcast(Channels.ytJobUpdate, job))
    setStatusSink((status) => broadcast(Channels.ytStatusUpdate, status))
  }

  ipcMain.handle(Channels.ytStatus, () => getStatus())
  ipcMain.handle(Channels.ytUpdate, () => updateTool())
  ipcMain.handle(Channels.ytEnqueue, (_e, req: YtEnqueueRequest) => ytManager.enqueue(req))
  ipcMain.handle(Channels.ytList, () => ytManager.list())
  ipcMain.handle(Channels.ytCancel, (_e, id: string) => ytManager.cancel(id))
  ipcMain.handle(Channels.ytClearFinished, () => ytManager.clearFinished())
}
