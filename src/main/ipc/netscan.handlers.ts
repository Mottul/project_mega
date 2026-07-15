import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import { broadcast } from '../services/broadcast'
import { listInterfaces } from '../services/netscan/netUtil'
import { setNetscanSinks, startScan, stopScan } from '../services/netscan/netscanService'

let wired = false

export function registerNetscanHandlers(): void {
  if (!wired) {
    wired = true
    setNetscanSinks(
      (p) => broadcast(Channels.netscanProgress, p),
      (d) => broadcast(Channels.netscanDevice, d)
    )
  }

  ipcMain.handle(Channels.netscanInterfaces, () => listInterfaces())
  ipcMain.handle(Channels.netscanStart, (_e, address: string) => startScan(address))
  ipcMain.handle(Channels.netscanStop, () => stopScan())
}
