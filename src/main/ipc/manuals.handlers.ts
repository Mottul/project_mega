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
import { sendeAn } from '../services/broadcast'
import { handle } from './kanal'

export function registerManualsHandlers(): void {
  handle(Channels.manuals.import, (e, paths: string[]) =>
    importManuals(paths, (p: ImportProgress) =>
      sendeAn(e.sender, Channels.manuals.onImportProgress, p)
    )
  )
  handle(Channels.manuals.list, (_e, query?: string) => listManuals(query))
  handle(Channels.manuals.search, (_e, query: string) => searchManuals(query))
  handle(Channels.manuals.searchInDoc, (_e, manualId: number, query: string) =>
    searchInManual(manualId, query)
  )
  handle(Channels.manuals.get, (_e, id: number) => getManual(id))
  handle(Channels.manuals.bytes, (_e, id: number) => readManualBytes(id))
  handle(Channels.manuals.update, (_e, id: number, patch: ManualPatch) => updateManual(id, patch))
  handle(Channels.manuals.delete, (_e, id: number) => deleteManual(id))
}
