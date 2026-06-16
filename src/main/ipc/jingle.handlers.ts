import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { JingleImportResult, JingleRemoteSnapshot } from '@shared/types'
import { broadcast } from '../services/broadcast'
import { cleanupJingles, importJingle, readJingleBytes } from '../services/jingleLibrary'
import {
  getJingleRemoteStatus,
  publishSnapshot,
  setJingleCommandSink,
  startJingleRemote,
  stopJingleRemote
} from '../services/jingleRemoteServer'

let wired = false

export function registerJingleHandlers(): void {
  if (!wired) {
    wired = true
    // Trigger/Stopp vom Handy an alle Fenster (der Jingle-Tab spielt das Audio).
    setJingleCommandSink((cmd) => broadcast(Channels.jingleRemoteCommand, cmd))
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
  ipcMain.handle(Channels.jinglePublish, (_e, snap: JingleRemoteSnapshot) => publishSnapshot(snap))
  ipcMain.handle(Channels.jingleRemoteStatus, () => getJingleRemoteStatus())
  ipcMain.handle(Channels.jingleRemoteStart, async (_e, port: number) => {
    const status = await startJingleRemote(port)
    broadcast(Channels.jingleRemoteChanged, status)
    return status
  })
  ipcMain.handle(Channels.jingleRemoteStop, () => {
    stopJingleRemote()
    const status = getJingleRemoteStatus()
    broadcast(Channels.jingleRemoteChanged, status)
    return status
  })
}
