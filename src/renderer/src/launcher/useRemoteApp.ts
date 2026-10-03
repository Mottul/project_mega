import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import type { RemoteAppStatus, RemoteControlId } from '@shared/types'

// Live-Status der Fernsteuer-App für den Homescreen (QR-Knopf + Kachel-Hinweis
// „Fernsteuerung an“). main meldet jede Änderung an alle Fenster.

/** Fernsteuerung -> Werkzeug-ID der Kachel. */
export const REMOTE_TOOL_IDS: Record<RemoteControlId, string> = {
  player: 'video-player',
  jingle: 'jingle-player',
  osc: 'osc-control',
  timer: 'stage-timer'
}

export function useRemoteApp(): RemoteAppStatus | null {
  const [status, setStatus] = useState<RemoteAppStatus | null>(null)
  useEffect(() => {
    void api.remoteApp.status().then(setStatus)
    return api.remoteApp.onChanged(setStatus)
  }, [])
  return status
}

/** Werkzeug-IDs, deren Fernsteuerung gerade läuft. */
export function remoteToolIds(status: RemoteAppStatus | null): Set<string> {
  const out = new Set<string>()
  if (!status) return out
  for (const [id, running] of Object.entries(status.remotes)) {
    if (running) out.add(REMOTE_TOOL_IDS[id as RemoteControlId])
  }
  return out
}
