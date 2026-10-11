// Installieren der Rechner-PWA. Chrome/Edge (Android, Desktop) bieten einen eigenen Dialog an,
// den die Seite per „beforeinstallprompt“ auslösen darf; Safari (iPhone/iPad) kennt das nicht,
// dort geht es nur über „Teilen“ -> „Zum Home-Bildschirm“ (Hinweistext).
import { useEffect, useState } from 'react'

/** Nicht in den DOM-Typen (nur Chromium) */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS-Safari meldet die installierte Web-App nur hierüber
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function useInstallPrompt(): {
  standalone: boolean
  canPrompt: boolean
  ios: boolean
  prompt: () => void
} {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState(isStandalone)

  useEffect(() => {
    const onPrompt = (e: Event): void => {
      // Browser-eigenes Mini-Banner unterdrücken, stattdessen unser Knopf
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = (): void => {
      setEvent(null)
      setStandalone(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return {
    standalone,
    canPrompt: event != null,
    // iPadOS gibt sich als Mac aus – erkennbar an Touch
    ios:
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1),
    prompt: () => {
      if (!event) return
      // Ein Ereignis lässt sich nur einmal zeigen
      setEvent(null)
      void event.prompt().catch(() => undefined)
    }
  }
}
