// Service Worker der Rechner-PWA anmelden und eine wartende neue Version melden. Die Seite
// tauscht die Version nie von selbst: Ein Neuladen mitten in einer Eingabe wäre ärgerlich, also
// entscheidet der Knopf „Neu laden“ (sonst greift sie beim nächsten Start).
import { useEffect, useRef, useState } from 'react'
import { SKIP_WAITING, SW_FILE } from './build/serviceWorker'

export function useServiceWorker(): { updateReady: boolean; applyUpdate: () => void } {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  // Nur nach „Neu laden“ neu laden: controllerchange kommt auch beim allerersten Besuch, wenn
  // der frische Worker die Seite übernimmt (clients.claim) – da gibt es nichts zu tauschen.
  const updating = useRef(false)

  useEffect(() => {
    // Im Dev-Server gäbe es keinen Worker (er entsteht erst beim Build)
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    const sw = navigator.serviceWorker
    let reg: ServiceWorkerRegistration | null = null
    // Nur ein ERSATZ zählt als Update – beim allerersten Besuch steuert noch kein Worker
    const offer = (w: ServiceWorker | null): void => {
      if (w && sw.controller) setWaiting(w)
    }
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void reg?.update().catch(() => undefined)
    }

    sw.register(`./${SW_FILE}`)
      .then((r) => {
        reg = r
        offer(r.waiting)
        r.addEventListener('updatefound', () => {
          const w = r.installing
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed') offer(w)
          })
        })
      })
      .catch((err) => console.warn('[PWA] Service Worker nicht angemeldet:', err))

    // Die neue Version hat übernommen -> Seite passend dazu neu laden
    const onController = (): void => {
      if (!updating.current) return
      updating.current = false
      window.location.reload()
    }
    sw.addEventListener('controllerchange', onController)
    // Handy-Apps bleiben tagelang offen: beim Zurückholen nach einer neuen Version schauen
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      sw.removeEventListener('controllerchange', onController)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return {
    updateReady: waiting != null,
    applyUpdate: () => {
      if (!waiting) return
      updating.current = true
      waiting.postMessage(SKIP_WAITING)
    }
  }
}
