import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import { broadcast } from '../services/broadcast'
import {
  blackoutPacket,
  brightnessPacket,
  freezePacket,
  parseHex,
  presetPacket,
  withChecksum
} from '../services/novastar/novastarCodec'
import {
  getNovastarStatus,
  novastarConnect,
  novastarDisconnect,
  novastarSend,
  setNovastarStatusSink
} from '../services/novastar/novastarService'

let wired = false

export function registerNovastarHandlers(): void {
  if (!wired) {
    wired = true
    setNovastarStatusSink((s) => broadcast(Channels.novastarStatusChanged, s))
  }

  ipcMain.handle(Channels.novastarConnect, (_e, host: string, port: number) => novastarConnect(host, port))
  ipcMain.handle(Channels.novastarDisconnect, () => novastarDisconnect())
  ipcMain.handle(Channels.novastarStatus, () => getNovastarStatus())
  ipcMain.handle(Channels.novastarBrightness, (_e, pct: number) => novastarSend(brightnessPacket(pct)))
  ipcMain.handle(Channels.novastarBlackout, (_e, on: boolean) => novastarSend(blackoutPacket(on)))
  ipcMain.handle(Channels.novastarFreeze, (_e, on: boolean) => novastarSend(freezePacket(on)))
  ipcMain.handle(Channels.novastarPreset, (_e, n: number) => novastarSend(presetPacket(n)))
  // Roh-Befehl: Hex-String; optional Header/Prüfsumme automatisch ergänzen.
  ipcMain.handle(Channels.novastarRaw, (_e, hex: string, addChecksum: boolean) => {
    const bytes = parseHex(hex)
    if (!bytes) return
    novastarSend(addChecksum ? withChecksum(bytes) : Buffer.from(bytes))
  })
}
