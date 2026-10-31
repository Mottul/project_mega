import { Channels } from '@shared/ipc-contracts'
import type { JingleImportResult, JingleRemoteSnapshot } from '@shared/types'
import { cleanupJingles, importJingle, readJingleBytes } from '../services/jingle/jingleLibrary'
import {
  forgetJingleSnapshot,
  getJingleRemoteStatus,
  publishSnapshot,
  setJingleCommandSink,
  startJingleRemote,
  stopJingleRemote
} from '../services/jingle/jingleRemoteServer'
import { publishFrom, registerRemoteControl, sendToSource } from './remoteControls'
import { handle } from './kanal'

let wired = false

export function registerJingleHandlers(): void {
  if (!wired) {
    wired = true
    // Trigger/Stopp vom Handy an alle Fenster (der Jingle-Tab spielt das Audio).
    setJingleCommandSink((cmd, source) =>
      sendToSource(Channels.jingles.onRemoteCommand, cmd, source)
    )
  }

  handle(Channels.jingles.import, (_e, paths: string[]) => {
    const out: JingleImportResult[] = []
    for (const p of paths) {
      try {
        const res = importJingle(p)
        if (res) out.push(res)
      } catch {
        // einzelne Datei nicht kopierbar -> überspringen
      }
    }
    return out
  })

  handle(Channels.jingles.cleanup, (_e, keep: string[]) => cleanupJingles(keep))
  handle(Channels.jingles.bytes, (_e, storedName: string) => readJingleBytes(storedName))

  // Fernsteuerung
  handle(Channels.jingles.publish, (e, snap: JingleRemoteSnapshot) =>
    publishFrom(e.sender, snap, publishSnapshot, forgetJingleSnapshot)
  )
  registerRemoteControl({
    id: 'jingle',
    channels: Channels.jingles,
    start: startJingleRemote,
    stop: stopJingleRemote,
    status: getJingleRemoteStatus
  })
}
