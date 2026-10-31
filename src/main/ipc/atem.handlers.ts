import { Channels } from '@shared/ipc-contracts'
import {
  atemBefehl,
  atemTrennen,
  atemVerbinden,
  getAtemStatus,
  getAtemView,
  setAtemSinks
} from '../services/atem/atemService'
import { broadcast } from '../services/broadcast'
import { getSettings } from '../services/store'
import { handle } from './kanal'

export function registerAtemHandlers(): void {
  setAtemSinks({
    status: (s) => broadcast(Channels.atem.onStatus, s),
    view: (v) => broadcast(Channels.atem.onView, v)
  })

  handle(Channels.atem.status, () => getAtemStatus())
  handle(Channels.atem.view, () => getAtemView())
  // Ziel und Befehl prüft der Dienst: Beides sind fremde Eingaben
  handle(Channels.atem.connect, (_e, ziel: unknown) => atemVerbinden(ziel))
  handle(Channels.atem.disconnect, () => atemTrennen())
  handle(Channels.atem.command, (_e, cmd: unknown) => atemBefehl(cmd))

  const { host, autoConnect } = getSettings().atem
  if (autoConnect && host) void atemVerbinden({ host })
}
