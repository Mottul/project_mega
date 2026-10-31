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
import { handle } from './kanal'

export function registerFfmpegHandlers(): void {
  handle(Channels.ffmpeg.probe, (_e, path: string) => probe(path))
  // ffmpeg in der fertigen App aktuell halten (keine Eingaben – nichts zu prüfen)
  setFfmpegStatusSink((s) => broadcast(Channels.ffmpeg.onStatus, s))
  handle(Channels.ffmpeg.status, () => ffmpegToolStatus())
  handle(Channels.ffmpeg.checkUpdate, () => checkFfmpegUpdate())
  handle(Channels.ffmpeg.useBundled, () => useBundledFfmpeg())
  // Video-Konverter
  handle(Channels.converter.capabilities, () => getConvertCapabilities())
  handle(Channels.converter.encoders, () => detectConverterEncoders())
  handle(Channels.converter.enqueue, (_e, req: ConverterEnqueueRequest) =>
    converterJobs.enqueue(req)
  )
  handle(Channels.converter.list, () => converterJobs.list())
  handle(Channels.converter.cancel, (_e, id: string) => converterJobs.cancel(id))
  handle(Channels.converter.cancelAll, () => converterJobs.cancelAll())
  handle(Channels.converter.clearFinished, () => converterJobs.clearFinished())
  // Medien-Info
  handle(Channels.mediaInfo.probe, (_e, path: string, opts?: MediaProbeOptions) =>
    probeMediaInfo(path, opts ?? {})
  )
  handle(Channels.mediaInfo.raw, (_e, path: string) => rawMediaInfo(path))
  handle(Channels.mediaInfo.collect, (_e, inputs: string[]) =>
    collectMediaFiles(Array.isArray(inputs) ? inputs : [])
  )
}
