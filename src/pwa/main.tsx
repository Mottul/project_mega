// Einstieg der Rechner-PWA (Browser, kein Electron). Design und Akzentfarbe SYNCHRON vor dem
// ersten Rendern setzen wie in der App (kein Flackern).
import React from 'react'
import { createRoot } from 'react-dom/client'
import { applyAccent, storedAccent } from '@renderer/lib/accent'
import { storedThemeMode } from '@renderer/lib/theme'
import '@renderer/assets/main.css'
import './pwa.css'
import { App } from './App'
import { applyPwaTheme } from './useLook'

applyPwaTheme(storedThemeMode())
applyAccent(storedAccent())

const container = document.getElementById('root')
if (!container) throw new Error('#root nicht gefunden')
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
