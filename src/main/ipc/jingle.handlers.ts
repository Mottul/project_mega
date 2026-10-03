import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { JingleImportResult, JingleRemoteSnapshot } from '@shared/types'
import { cleanupJingles, importJingle, readJingleBytes } from '../services/jingleLibrary'
import {
  forgetJingleSnapshot,
  getJingleRemoteStatus,
  publishSnapshot,
  setJingleCommandSink,
  startJingleRemote,
  stopJingleRemote
} from '../services/jingleRemoteServer'
import { publishFrom, registerRemoteControl, sendToSource } from './remoteControls'

let wired = false

export function registerJingleHandlers(): void {
  if (!wired) {
    wired = true
    // Trigger/Stopp vom Handy an alle Fenster (der Jingle-Tab spielt das Audio).
    setJingleCommandSink((cmd, source) => sendToSource(Channels.jingleRemoteCommand, cmd, source))
  }

  ipcMain.handle(Channels.jingleImport, (_e, paths: string[]) => {
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

  ipcMain.handle(Channels.jingleCleanup, (_e, keep: string[]) => cleanupJingles(keep))
  ipcMain.handle(Channels.jingleBytes, (_e, storedName: string) => readJingleBytes(storedName))

  // Fernsteuerung
  ipcMain.handle(Channels.jinglePublish, (e, snap: JingleRemoteSnapshot) =>
    publishFrom(e.sender, snap, publishSnapshot, forgetJingleSnapshot)
  )
  registerRemoteControl({
    id: 'jingle',
    channels: {
      status: Channels.jingleRemoteStatus,
      start: Channels.jingleRemoteStart,
      stop: Channels.jingleRemoteStop,
      changed: Channels.jingleRemoteChanged
    },
    start: startJingleRemote,
    stop: stopJingleRemote,
    status: getJingleRemoteStatus
  })
}
