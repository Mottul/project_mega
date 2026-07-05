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

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
