import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { JingleImportResult } from '@shared/types'
import { cleanupJingles, importJingle } from '../services/jingleLibrary'

export function registerJingleHandlers(): void {
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
}
