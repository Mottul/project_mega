// Gemeinsame IPC-Logik der vier Handy-Fernsteuerungen (Player/Jingle/OSC/Timer):
// Status/Start/Stopp, Zustand merken (settings.json) samt Autostart beim App-
// Start, Abgleich der Fernsteuer-App und Benachrichtigung aller Fenster
// (Werkzeug-Panel + Homescreen-Kacheln/QR-Code).

import { ipcMain, webContents, type WebContents } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { RemoteControlId, RemoteControlSetting, RemoteStatus } from '@shared/types'
import { broadcast } from '../services/broadcast'
import { logLine } from '../services/log'
import { getRemoteAppStatus, syncRemoteApp, withAppLink } from '../services/remoteAppServer'
import { getSettings, setSettings } from '../services/store'

export interface RemoteControlDef {
  id: RemoteControlId
  channels: { status: string; start: string; stop: string; changed: string }
  start(port: number): Promise<RemoteStatus>
  stop(): void
  status(): RemoteStatus
  /** Gemerkter Zustand; Standard: settings.remoteControls[id]. */
  persisted?: () => RemoteControlSetting
  persist?: (value: RemoteControlSetting) => void
}

let appStatusWired = false

/** Zustand der übrigen Fernsteuerungen (alles außer dem Player). */
function settingsStore(id: Exclude<RemoteControlId, 'player'>): {
  persisted: () => RemoteControlSetting
  persist: (value: RemoteControlSetting) => void
} {
  return {
    persisted: () => getSettings().remoteControls[id],
    persist: (value) =>
      setSettings({ remoteControls: { ...getSettings().remoteControls, [id]: value } })
  }
}

export function registerRemoteControl(def: RemoteControlDef): void {
  if (!appStatusWired) {
    appStatusWired = true
    ipcMain.handle(Channels.remoteAppStatus, () => getRemoteAppStatus())
  }
  const store =
    def.persisted && def.persist
      ? { persisted: def.persisted, persist: def.persist }
      : settingsStore(def.id as Exclude<RemoteControlId, 'player'>)

  // Ausgeschaltet zeigt das Panel den gemerkten Port (nicht den Standard).
  const current = (): RemoteStatus => {
    const s = def.status()
    return withAppLink(def.id, s.running ? s : { ...s, port: store.persisted().port })
  }
  const changed = async (): Promise<RemoteStatus> => {
    await syncRemoteApp()
    const status = current()
    broadcast(def.channels.changed, status)
    broadcast(Channels.remoteAppChanged, getRemoteAppStatus())
    return status
  }

  ipcMain.handle(def.channels.status, current)
  ipcMain.handle(def.channels.start, async (_e, port: number) => {
    const started = await def.start(port)
    store.persist({ enabled: true, port: started.port })
    return changed()
  })
  ipcMain.handle(def.channels.stop, () => {
    def.stop()
    store.persist({ ...store.persisted(), enabled: false })
    return changed()
  })

  // War sie beim letzten Beenden an -> wieder starten (best effort).
  const saved = store.persisted()
  if (saved.enabled) {
    def.start(saved.port).then(changed, (e: unknown) => {
      logLine(
        `[remote:${def.id}] Autostart auf Port ${saved.port} fehlgeschlagen:`,
        e instanceof Error ? e.message : String(e)
      )
      store.persist({ ...saved, enabled: false })
    })
  }
}

/* ------- Snapshot-Fernsteuerungen (Jingle/OSC): Stand je Fenster ------- */

const tracked = new Map<(source: number) => void, Set<number>>()

/** Stand eines Fensters veröffentlichen und beim Schließen des Fensters wieder
 *  vergessen (sonst bliebe ein „verbunden" eines toten Fensters stehen). */
export function publishFrom<Snap>(
  sender: WebContents,
  snap: Snap,
  publish: (snap: Snap, source: number) => void,
  forget: (source: number) => void
): void {
  let ids = tracked.get(forget)
  if (!ids) tracked.set(forget, (ids = new Set()))
  const id = sender.id
  if (!ids.has(id)) {
    ids.add(id)
    sender.once('destroyed', () => {
      ids.delete(id)
      forget(id)
    })
  }
  publish(snap, id)
}

/** Befehl vom Handy NUR an das Fenster, dessen Stand das Handy sieht – sonst
 *  spielte ein in zwei Fenstern offener Jingle-Player das Pad doppelt ab. */
export function sendToSource(channel: string, cmd: unknown, source: number | null): void {
  const wc = source != null ? webContents.fromId(source) : undefined
  if (wc && !wc.isDestroyed()) wc.send(channel, cmd)
  else broadcast(channel, cmd)
}
