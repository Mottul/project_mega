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
import { handle } from './kanal'

let wired = false

export function registerNovastarHandlers(): void {
  if (!wired) {
    wired = true
    setNovastarStatusSink((s) => broadcast(Channels.novastar.onStatus, s))
  }

  handle(Channels.novastar.connect, (_e, host: string, port: number) => novastarConnect(host, port))
  handle(Channels.novastar.disconnect, () => novastarDisconnect())
  handle(Channels.novastar.status, () => getNovastarStatus())
  handle(Channels.novastar.brightness, (_e, pct: number) => novastarSend(brightnessPacket(pct)))
  handle(Channels.novastar.blackout, (_e, on: boolean) => novastarSend(blackoutPacket(on)))
  handle(Channels.novastar.freeze, (_e, on: boolean) => novastarSend(freezePacket(on)))
  handle(Channels.novastar.preset, (_e, n: number) => novastarSend(presetPacket(n)))
  // Roh-Befehl: Hex-String; optional Header/Prüfsumme automatisch ergänzen.
  handle(Channels.novastar.raw, (_e, hex: string, addChecksum: boolean) => {
    const bytes = parseHex(hex)
    if (!bytes) return
    novastarSend(addChecksum ? withChecksum(bytes) : Buffer.from(bytes))
  })
}
