// Gemeinsame IPC-Logik der vier Handy-Fernsteuerungen (Player/Jingle/OSC/Timer):
// Status/Start/Stopp, Zustand merken (settings.json) samt Autostart beim App-
// Start, Abgleich der Fernsteuer-App und Benachrichtigung aller Fenster
// (Werkzeug-Panel + Homescreen-Kacheln/QR-Code).

import { webContents, type WebContents } from 'electron'
import { Channels, type Anfrage, type Ereignis } from '@shared/ipc-contracts'
import type { RemoteControlId, RemoteControlSetting, RemoteStatus } from '@shared/types'
import { broadcast, sendeAn } from '../services/broadcast'
import { logLine } from '../services/log'
import { getRemoteAppStatus, syncRemoteApp, withAppLink } from '../services/remote/remoteAppServer'
import { getSettings, setSettings } from '../services/store'
import { handle } from './kanal'

export interface RemoteControlDef {
  id: RemoteControlId
  /** Der Abschnitt des Werkzeugs im Vertrag – die vier Kanäle heißen überall gleich */
  channels: {
    remoteStatus: Anfrage<() => RemoteStatus>
    remoteStart: Anfrage<(port: number) => RemoteStatus>
    remoteStop: Anfrage<() => RemoteStatus>
    onRemoteChanged: Ereignis<(status: RemoteStatus) => void>
  }
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
    persist: (value) => setSettings({ remoteControls: { [id]: value } })
  }
}

export function registerRemoteControl(def: RemoteControlDef): void {
  if (!appStatusWired) {
    appStatusWired = true
    handle(Channels.remoteApp.status, () => getRemoteAppStatus())
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
    broadcast(def.channels.onRemoteChanged, status)
    broadcast(Channels.remoteApp.onChanged, getRemoteAppStatus())
    return status
  }

  handle(def.channels.remoteStatus, current)
  handle(def.channels.remoteStart, async (_e, port) => {
    const started = await def.start(port)
    store.persist({ enabled: true, port: started.port })
    return changed()
  })
  handle(def.channels.remoteStop, () => {
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
export function sendToSource<Cmd>(
  k: Ereignis<(cmd: Cmd) => void>,
  cmd: Cmd,
  source: number | null
): void {
  const wc = source != null ? webContents.fromId(source) : undefined
  if (wc && !wc.isDestroyed()) sendeAn(wc, k, cmd)
  else broadcast(k, cmd)
}
