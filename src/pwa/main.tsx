// Einstieg der Rechner-PWA (Browser, kein Electron). Theme SYNCHRON vor dem ersten Rendern
// setzen wie in der App (kein Hell/Dunkel-Flackern).
import React from 'react'
import { createRoot } from 'react-dom/client'
import { storedThemeMode } from '@renderer/lib/theme'
import '@renderer/assets/main.css'
import './pwa.css'
import { App } from './App'
import { applyPwaTheme } from './useThemeMode'

applyPwaTheme(storedThemeMode())

const container = document.getElementById('root')
if (!container) throw new Error('#root nicht gefunden')
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
