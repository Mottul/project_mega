import { Channels } from '@shared/ipc-contracts'
import { broadcast } from '../services/broadcast'
import { listInterfaces } from '../services/netscan/netUtil'
import { setNetscanSinks, startScan, stopScan } from '../services/netscan/netscanService'
import { handle } from './kanal'

let wired = false

export function registerNetscanHandlers(): void {
  if (!wired) {
    wired = true
    setNetscanSinks(
      (p) => broadcast(Channels.netscan.onProgress, p),
      (d) => broadcast(Channels.netscan.onDevice, d)
    )
  }

  handle(Channels.netscan.interfaces, () => listInterfaces())
  handle(Channels.netscan.start, (_e, address: string) => startScan(address))
  handle(Channels.netscan.stop, () => stopScan())
}
