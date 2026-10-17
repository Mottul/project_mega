// Eigene Bausteine des Mini-Manuals – dünne Hülle um services/bausteine/bausteinStore.ts.

import { BrowserWindow, ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import {
  exportBausteine,
  importBausteine,
  listBausteine,
  removeBaustein,
  saveBaustein
} from '../services/bausteine/bausteinStore'

export function registerBausteineHandlers(): void {
  ipcMain.handle(Channels.bausteineList, () => listBausteine())
  ipcMain.handle(Channels.bausteineSave, (_e, b: unknown) => saveBaustein(b))
  ipcMain.handle(Channels.bausteineRemove, (_e, id: unknown) => removeBaustein(id))
  ipcMain.handle(Channels.bausteineExport, (e, ids: unknown) =>
    exportBausteine(BrowserWindow.fromWebContents(e.sender), ids)
  )
  ipcMain.handle(Channels.bausteineImport, (e) =>
    importBausteine(BrowserWindow.fromWebContents(e.sender))
  )
}
