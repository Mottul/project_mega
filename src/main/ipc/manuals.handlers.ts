import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { ImportProgress, ManualPatch } from '@shared/types'
import {
  deleteManual,
  getManual,
  importManuals,
  listManuals,
  readManualBytes,
  searchInManual,
  searchManuals,
  updateManual
} from '../services/manuals/manualsService'

export function registerManualsHandlers(): void {
  ipcMain.handle(Channels.manualsImport, (e, paths: string[]) =>
    importManuals(paths, (p: ImportProgress) =>
      e.sender.send(Channels.manualsImportProgress, p)
    )
  )
  ipcMain.handle(Channels.manualsList, (_e, query?: string) => listManuals(query))
  ipcMain.handle(Channels.manualsSearch, (_e, query: string) => searchManuals(query))
  ipcMain.handle(Channels.manualsSearchInDoc, (_e, manualId: number, query: string) =>
    searchInManual(manualId, query)
  )
  ipcMain.handle(Channels.manualsGet, (_e, id: number) => getManual(id))
  ipcMain.handle(Channels.manualsBytes, (_e, id: number) => readManualBytes(id))
  ipcMain.handle(Channels.manualsUpdate, (_e, id: number, patch: ManualPatch) =>
    updateManual(id, patch)
  )
  ipcMain.handle(Channels.manualsDelete, (_e, id: number) => deleteManual(id))
}
