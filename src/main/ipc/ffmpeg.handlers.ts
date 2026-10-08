import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { ConverterEnqueueRequest, MediaProbeOptions } from '@shared/types'
import { getConvertCapabilities } from '../services/convert/capabilities'
import { converterJobs } from '../services/convert/converterJobs'
import { detectConverterEncoders } from '../services/convert/encoders'
import { collectMediaFiles, probeMediaInfo, rawMediaInfo } from '../services/ffmpeg/mediaInfo'
import {
  checkFfmpegUpdate,
  ffmpegToolStatus,
  setFfmpegStatusSink,
  useBundledFfmpeg
} from '../services/ffmpeg/ffmpegUpdate'
import { probe } from '../services/ffmpeg/probe'
import { broadcast } from '../services/broadcast'

export function registerFfmpegHandlers(): void {
  ipcMain.handle(Channels.ffmpegProbe, (_e, path: string) => probe(path))
  // ffmpeg in der fertigen App aktuell halten (keine Eingaben – nichts zu prüfen)
  setFfmpegStatusSink((s) => broadcast(Channels.ffmpegStatusUpdate, s))
  ipcMain.handle(Channels.ffmpegStatus, () => ffmpegToolStatus())
  ipcMain.handle(Channels.ffmpegCheckUpdate, () => checkFfmpegUpdate())
  ipcMain.handle(Channels.ffmpegUseBundled, () => useBundledFfmpeg())
  // Video-Konverter
  ipcMain.handle(Channels.converterCapabilities, () => getConvertCapabilities())
  ipcMain.handle(Channels.converterEncoders, () => detectConverterEncoders())
  ipcMain.handle(Channels.converterEnqueue, (_e, req: ConverterEnqueueRequest) =>
    converterJobs.enqueue(req)
  )
  ipcMain.handle(Channels.converterList, () => converterJobs.list())
  ipcMain.handle(Channels.converterCancel, (_e, id: string) => converterJobs.cancel(id))
  ipcMain.handle(Channels.converterCancelAll, () => converterJobs.cancelAll())
  ipcMain.handle(Channels.converterClearFinished, () => converterJobs.clearFinished())
  // Medien-Info
  ipcMain.handle(Channels.mediaInfoProbe, (_e, path: string, opts?: MediaProbeOptions) =>
    probeMediaInfo(path, opts ?? {})
  )
  ipcMain.handle(Channels.mediaInfoRaw, (_e, path: string) => rawMediaInfo(path))
  ipcMain.handle(Channels.mediaInfoCollect, (_e, inputs: string[]) =>
    collectMediaFiles(Array.isArray(inputs) ? inputs : [])
  )
}
