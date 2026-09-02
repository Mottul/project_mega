import './style.css'
import { Game } from './app'

const canvas = document.getElementById('screen') as HTMLCanvasElement | null
if (!canvas) throw new Error('Canvas #screen fehlt')

const game = new Game(canvas)
game.start()

// Der Service Worker existiert nur im Build (siehe vite.config.ts).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', location.href).href).catch(() => {
      // Offline-Betrieb ist eine Zugabe - ohne SW läuft das Spiel trotzdem.
    })
  })
}

// Vollbild auf Wunsch: Doppeltipp/-klick auf den Rand schaltet um.
document.addEventListener('dblclick', () => {
  if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {})
  else void document.exitFullscreen?.()
})
