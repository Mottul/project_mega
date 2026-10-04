import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { HapEnqueueRequest, MediaProbeOptions } from '@shared/types'
import { checkHap } from '../services/ffmpeg/hapEncoder'
import { jobManager } from '../services/ffmpeg/jobManager'
import { collectMediaFiles, probeMediaInfo, rawMediaInfo } from '../services/ffmpeg/mediaInfo'
import { probe } from '../services/ffmpeg/probe'

export function registerFfmpegHandlers(): void {
  ipcMain.handle(Channels.ffmpegCheckHap, () => checkHap())
  ipcMain.handle(Channels.ffmpegProbe, (_e, path: string) => probe(path))
  ipcMain.handle(Channels.hapEnqueue, (_e, req: HapEnqueueRequest) => jobManager.enqueue(req))
  ipcMain.handle(Channels.hapList, () => jobManager.list())
  ipcMain.handle(Channels.hapCancel, (_e, id: string) => jobManager.cancel(id))
  ipcMain.handle(Channels.hapCancelAll, () => jobManager.cancelAll())
  ipcMain.handle(Channels.hapClearFinished, () => jobManager.clearFinished())
  // Medien-Info
  ipcMain.handle(Channels.mediaInfoProbe, (_e, path: string, opts?: MediaProbeOptions) =>
    probeMediaInfo(path, opts ?? {})
  )
  ipcMain.handle(Channels.mediaInfoRaw, (_e, path: string) => rawMediaInfo(path))
  ipcMain.handle(Channels.mediaInfoCollect, (_e, inputs: string[]) =>
    collectMediaFiles(Array.isArray(inputs) ? inputs : [])
  )
}
