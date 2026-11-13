// Bildschirm wach halten, solange etwas läuft (RTA misst, Testton spielt): Am Handy ginge sonst
// nach der Sperrzeit das Display aus – und iOS hielte den Ton an. Der Browser gibt die Sperre
// selbst frei, wenn die Seite verdeckt wird; beim Zurückkommen wird sie neu angefordert. Geht nur
// über HTTPS und nicht in jedem Browser (dann geschieht nichts).

import { useEffect } from 'react'

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let asking = false
    let ended = false
    const take = (): void => {
      if (ended || lock || asking || document.visibilityState !== 'visible') return
      asking = true
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          // inzwischen beendet: gleich wieder freigeben, sonst bliebe der Bildschirm an
          if (ended) {
            void l.release().catch(() => {})
            return
          }
          lock = l
          l.addEventListener('release', () => {
            if (lock === l) lock = null
          })
        })
        .catch(() => {})
        .finally(() => {
          asking = false
        })
    }
    take()
    document.addEventListener('visibilitychange', take)
    return () => {
      ended = true
      document.removeEventListener('visibilitychange', take)
      void lock?.release().catch(() => {})
      lock = null
    }
  }, [active])
}
