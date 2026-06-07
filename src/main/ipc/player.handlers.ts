import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { PlayerCommand, PlayerImportRequest } from '@shared/types'
import { broadcast } from '../services/broadcast'
import { convertManager } from '../services/player/convertManager'
import { detectEncoders } from '../services/player/encoder'
import { clearLibrary, deleteMedia, listMedia, mediaDir } from '../services/player/mediaLibrary'
import {
  applyCommand,
  dropMediaFromPlaylist,
  getPlayerState,
  reportPlayback,
  setStateSink,
  setTickSink
} from '../services/player/playerState'
import { closePlayerOutput, openPlayerOutput } from '../services/player/playerWindow'
import { getSettings, setSettings } from '../services/store'

let wired = false

// Live-Updates (Konvertierung, Bibliothek, Zustand) an alle Fenster spiegeln.
function wireSinks(): void {
  if (wired) return
  wired = true
  convertManager.setSink((job) => broadcast(Channels.playerConvertUpdate, job))
  convertManager.setLibrarySink(() => broadcast(Channels.playerLibraryChanged))
  setStateSink((state) => broadcast(Channels.playerState, state))
  setTickSink((tick) => broadcast(Channels.playerTick, tick))
}

export function registerPlayerHandlers(): void {
  wireSinks()

  // Bibliothek & Konvertierung
  ipcMain.handle(Channels.playerEncoders, () => detectEncoders())
  ipcMain.handle(Channels.playerImport, (_e, req: PlayerImportRequest) => convertManager.enqueue(req))
  ipcMain.handle(Channels.playerConvertList, () => convertManager.list())
  ipcMain.handle(Channels.playerConvertCancel, (_e, id: string) => convertManager.cancel(id))
  ipcMain.handle(Channels.playerConvertClear, () => convertManager.clearFinished())
  ipcMain.handle(Channels.playerLibraryList, () => listMedia())
  ipcMain.handle(Channels.playerLibraryDelete, (_e, id: string) => {
    deleteMedia(id)
    dropMediaFromPlaylist(id)
    broadcast(Channels.playerLibraryChanged)
  })
  ipcMain.handle(Channels.playerLibraryClear, () => {
    clearLibrary()
    applyCommand({ type: 'clear' })
    broadcast(Channels.playerLibraryChanged)
  })
  ipcMain.handle(Channels.playerMediaDir, () => mediaDir())

  // Wiedergabe & Ausgabe
  ipcMain.handle(Channels.playerGetState, () => getPlayerState())
  ipcMain.handle(Channels.playerCommand, (_e, cmd: PlayerCommand) => applyCommand(cmd))
  ipcMain.handle(Channels.playerReport, (_e, positionSec: number, durationSec: number) =>
    reportPlayback(positionSec, durationSec)
  )
  ipcMain.handle(Channels.playerOpenOutput, (_e, displayId: number) => {
    setSettings({ player: { ...getSettings().player, outputDisplayId: displayId } })
    openPlayerOutput(displayId)
  })
  ipcMain.handle(Channels.playerCloseOutput, () => closePlayerOutput())
}
