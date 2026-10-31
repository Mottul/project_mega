// Eigene Bausteine des Mini-Manuals – dünne Hülle um services/bausteine/bausteinStore.ts.

import { BrowserWindow } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import {
  exportBausteine,
  importBausteine,
  listBausteine,
  removeBaustein,
  saveBaustein
} from '../services/bausteine/bausteinStore'
import { handle } from './kanal'

export function registerBausteineHandlers(): void {
  handle(Channels.bausteine.list, () => listBausteine())
  handle(Channels.bausteine.save, (_e, b: unknown) => saveBaustein(b))
  handle(Channels.bausteine.remove, (_e, id: unknown) => removeBaustein(id))
  handle(Channels.bausteine.export, (e, ids: unknown) =>
    exportBausteine(BrowserWindow.fromWebContents(e.sender), ids)
  )
  handle(Channels.bausteine.import, (e) => importBausteine(BrowserWindow.fromWebContents(e.sender)))
}
