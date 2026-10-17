// Eigene Bausteine des Mini-Manuals – dünne Hülle um services/bausteine/bausteinStore.ts.

import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import { listBausteine, removeBaustein, saveBaustein } from '../services/bausteine/bausteinStore'

export function registerBausteineHandlers(): void {
  ipcMain.handle(Channels.bausteineList, () => listBausteine())
  ipcMain.handle(Channels.bausteineSave, (_e, b: unknown) => saveBaustein(b))
  ipcMain.handle(Channels.bausteineRemove, (_e, id: unknown) => removeBaustein(id))
}
