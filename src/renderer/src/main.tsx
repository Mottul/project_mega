import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyTheme, storedThemeMode } from './lib/theme'
import { applyAccent, storedAccent } from './lib/accent'
import { applyDensity, storedDensity } from './lib/density'
import './assets/main.css'

// Gespeichertes Theme SYNCHRON vor dem ersten Rendern setzen -> kein Flackern.
// (settings.json bleibt die Quelle der Wahrheit; der Hook gleicht später ab.)
// Die rahmenlosen Ausgabefenster (#/output, #/player-output) bleiben IMMER dunkel,
// damit auf der Projektion kein heller Hintergrund aufblitzt.
const hash = window.location.hash
const isOutputWindow = hash.startsWith('#/output') || hash.startsWith('#/player-output')
applyTheme(isOutputWindow ? 'dark' : storedThemeMode())
applyAccent(storedAccent())
// Vollbild-Ausgaben bleiben in Normaldichte -- ihre Größen kommen aus px/vw und
// die Kompakt-Schriftgröße würde dort nichts bringen.
applyDensity(isOutputWindow ? 'normal' : storedDensity())

const container = document.getElementById('root')
if (!container) throw new Error('#root nicht gefunden')

// Unbehandelte Renderer-Fehler ins main-Debug-Log spiegeln (Feld-Diagnose ohne
// offene DevTools). Best effort – darf selbst nie werfen.
function toMainLog(prefix: string, value: unknown): void {
  try {
    const msg = value instanceof Error ? `${value.message}\n${value.stack ?? ''}` : String(value)
    window.api?.util?.log?.(`[renderer] ${prefix}: ${msg}`)
  } catch {
    /* ignore */
  }
}
window.addEventListener('error', (e) => toMainLog('error', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => toMainLog('unhandledrejection', e.reason))

// Fehlt die Preload-Brücke, kann keine Funktion arbeiten -> klare Meldung statt
// weißem Fenster / kryptischer Fehler bei der ersten api-Nutzung.
if (!window.api) {
  container.innerHTML =
    '<div style="height:100%;display:flex;align-items:center;justify-content:center;' +
    'font-family:system-ui;color:#e5e5e5;background:#0a0a0a;text-align:center;padding:2rem">' +
    '<div><h1 style="font-size:1.1rem;margin:0 0 .5rem">Programmbrücke nicht geladen</h1>' +
    '<p style="opacity:.7;font-size:.9rem;margin:0">Der Preload-Prozess ist nicht verfügbar. ' +
    'Bitte die App neu starten.</p></div></div>'
} else {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
