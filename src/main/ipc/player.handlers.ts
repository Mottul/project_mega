import { copyFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { dialog, ipcMain } from 'electron'
import { Channels, MEDIA_PROTOCOL } from '@shared/ipc-contracts'
import type { PlayerCommand, PlayerImportRequest } from '@shared/types'
import { broadcast } from '../services/broadcast'
import { convertManager } from '../services/player/convertManager'
import { detectEncoders } from '../services/player/encoder'
import {
  clearLibrary,
  deleteMedia,
  getMedia,
  listMedia,
  mediaDir
} from '../services/player/mediaLibrary'
import {
  applyCommand,
  dropMediaFromPlaylist,
  getPlayerState,
  refreshPlaylist,
  reportPlayback,
  setStateSink,
  setTickSink
} from '../services/player/playerState'
import { closePlayerOutput, openPlayerOutput } from '../services/player/playerWindow'
import { getPlayerNdiStatus, startPlayerNdi, stopPlayerNdi } from '../services/playerNdi'
import {
  getRemoteStatus,
  pushRemoteLibrary,
  pushRemoteState,
  pushRemoteTick,
  startRemote,
  stopRemote
} from '../services/player/remoteServer'
import { getSettings, setSettings } from '../services/store'

let wired = false

// Live-Updates (Konvertierung, Bibliothek, Zustand) an alle Fenster UND – falls
// aktiv – an die Tablet-Clients (SSE) spiegeln.
function wireSinks(): void {
  if (wired) return
  wired = true
  convertManager.setSink((job) => broadcast(Channels.playerConvertUpdate, job))
  convertManager.setLibrarySink(() => {
    refreshPlaylist() // Playlist-Snapshots nach Reconvert/Änderung auffrischen
    broadcast(Channels.playerLibraryChanged)
    pushRemoteLibrary()
  })
  setStateSink((state) => {
    broadcast(Channels.playerState, state)
    pushRemoteState(state)
  })
  setTickSink((tick) => {
    broadcast(Channels.playerTick, tick)
    pushRemoteTick(tick)
  })
}

export function registerPlayerHandlers(): void {
  wireSinks()

  // Bibliothek & Konvertierung
  ipcMain.handle(Channels.playerEncoders, () => detectEncoders())
  ipcMain.handle(Channels.playerImport, (_e, req: PlayerImportRequest) =>
    convertManager.enqueue(req)
  )
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
  ipcMain.handle(Channels.playerPickIdleMedia, async () => {
    const res = await dialog.showOpenDialog({
      title: 'Idle-Bild/-Video wählen',
      properties: ['openFile'],
      filters: [
        {
          name: 'Bilder & Videos',
          extensions: [
            'jpg',
            'jpeg',
            'png',
            'webp',
            'bmp',
            'gif',
            'mp4',
            'mov',
            'mkv',
            'webm',
            'avi',
            'm4v'
          ]
        }
      ]
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const src = res.filePaths[0]
    // Auf die Wand-Auflösung backen (Fit) und nach H.264/MP4 bzw. JPG konvertieren –
    // sonst spielt z.B. ein inkompatibler Codec auf der Ausgabe gar nicht. Der
    // eindeutige Dateiname verhindert EPERM auf eine evtl. noch gehaltene Idle-Datei.
    const { storedName, kind } = await convertManager.convertIdle(src)
    // Alte Idle-Dateien best effort aufräumen (die gerade aktive ist evtl. noch
    // gesperrt -> wird beim nächsten Wechsel mitgenommen).
    for (const f of readdirSync(mediaDir())) {
      if (f.startsWith('__idle') && f !== storedName) {
        try {
          rmSync(join(mediaDir(), f))
        } catch {
          // gesperrt/in Benutzung -> ignorieren
        }
      }
    }
    return { url: `${MEDIA_PROTOCOL}://library/${storedName}?v=${Date.now()}`, kind }
  })

  // Laufschrift-Logo (LED-Trailer): Bild unverändert in den Medienordner kopieren
  // (kein Einbacken -- das Logo wird zur Laufzeit auf Streifenhöhe skaliert).
  ipcMain.handle(Channels.playerPickTickerLogo, async () => {
    const res = await dialog.showOpenDialog({
      title: 'Logo für die Laufschrift wählen',
      properties: ['openFile'],
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const src = res.filePaths[0]
    const ext = (src.split('.').pop() || 'png').toLowerCase()
    const storedName = `__ticker-logo-${Date.now()}.${ext}`
    copyFileSync(src, join(mediaDir(), storedName))
    // Alte Logos best effort aufräumen (das aktive kann noch geladen sein).
    for (const f of readdirSync(mediaDir())) {
      if (f.startsWith('__ticker-logo') && f !== storedName) {
        try {
          rmSync(join(mediaDir(), f))
        } catch {
          // in Benutzung -> beim nächsten Wechsel
        }
      }
    }
    return { url: `${MEDIA_PROTOCOL}://library/${storedName}` }
  })

  ipcMain.handle(Channels.playerMediaDir, () => mediaDir())
  ipcMain.handle(
    Channels.playerReconvert,
    (
      _e,
      mediaIds: string[],
      wall: { width: number; height: number },
      fit?: 'blur' | 'bars' | 'stretch'
    ) => {
      const items: {
        sourcePath: string
        title: string
        fit: 'blur' | 'bars' | 'stretch'
        width: number
        height: number
        reconvertId: string
      }[] = []
      let skipped = 0
      for (const id of mediaIds) {
        const m = getMedia(id)
        if (!m || !m.sourcePath) {
          skipped++
          continue
        }
        items.push({
          sourcePath: m.sourcePath, // immer aus dem Original neu aufbereiten
          title: m.title,
          fit: fit ?? m.fitMode, // optionaler Override -> andere Aufbereitung anwenden
          width: wall.width,
          height: wall.height,
          reconvertId: id
        })
      }
      const { jobIds } = items.length ? convertManager.enqueueReconvert(items) : { jobIds: [] }
      return { jobIds, skipped }
    }
  )

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

  // Fernsteuerung (Tablet)
  ipcMain.handle(Channels.playerRemoteStatus, () => getRemoteStatus())
  ipcMain.handle(Channels.playerRemoteStart, async (_e, port: number) => {
    const status = await startRemote(port)
    setSettings({
      player: { ...getSettings().player, remoteEnabled: true, remotePort: status.port }
    })
    broadcast(Channels.playerRemoteChanged, status)
    return status
  })
  ipcMain.handle(Channels.playerRemoteStop, () => {
    stopRemote()
    setSettings({ player: { ...getSettings().player, remoteEnabled: false } })
    const status = getRemoteStatus()
    broadcast(Channels.playerRemoteChanged, status)
    return status
  })

  // NDI-Ausgabe (experimentell; ohne optionales Binding meldet Status "nicht verfügbar").
  // Der Audio-Kanal (playerNdiAudio) wird im Service selbst verdrahtet.
  ipcMain.handle(Channels.playerNdiStart, (_e, cfg) => startPlayerNdi(cfg))
  ipcMain.handle(Channels.playerNdiStop, () => stopPlayerNdi())
  ipcMain.handle(Channels.playerNdiStatus, () => getPlayerNdiStatus())

  // Bei aktivierter Einstellung automatisch starten (best effort).
  const ps = getSettings().player
  if (ps.remoteEnabled) {
    startRemote(ps.remotePort)
      .then((s) => broadcast(Channels.playerRemoteChanged, s))
      .catch(() => setSettings({ player: { ...getSettings().player, remoteEnabled: false } }))
  }
}
