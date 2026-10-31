import { Channels } from '@shared/ipc-contracts'
import type { YtEnqueueRequest } from '@shared/types'
import { broadcast } from '../services/broadcast'
import { getStatus, probeUrl, setStatusSink, updateTool, ytManager } from '../services/ytdlp/ytDlp'
import { handle } from './kanal'

let wired = false

export function registerYoutubeHandlers(): void {
  if (!wired) {
    wired = true
    ytManager.setSink((job) => broadcast(Channels.youtube.onJobUpdate, job))
    setStatusSink((status) => broadcast(Channels.youtube.onStatusUpdate, status))
  }

  handle(Channels.youtube.status, () => getStatus())
  handle(Channels.youtube.updateTool, () => updateTool())
  handle(Channels.youtube.probe, (_e, url: string) => probeUrl(url))
  handle(Channels.youtube.enqueue, (_e, req: YtEnqueueRequest) => ytManager.enqueue(req))
  handle(Channels.youtube.list, () => ytManager.list())
  handle(Channels.youtube.cancel, (_e, id: string) => ytManager.cancel(id))
  handle(Channels.youtube.clearFinished, () => ytManager.clearFinished())
}
