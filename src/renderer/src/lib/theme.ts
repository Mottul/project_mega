// Theme-Anwendung ohne React/IPC, damit der Einstieg (main.tsx) das gespeicherte
// Theme SYNCHRON vor dem ersten Rendern setzen kann (kein Hell/Dunkel-Flackern).
// Dunkel = Standard (keine Klasse), Hell = Klasse .light am <html>.

import type { ThemeMode } from '@shared/types'

const STORAGE_KEY = 'av-theme'

/** Konkretes Schema aus dem Modus ableiten ('system' -> OS-Einstellung). */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return mode
}

/** Theme am <html> setzen (light -> Klasse .light, dark -> ohne Klasse). */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.classList.toggle('light', resolveTheme(mode) === 'light')
}

/** Schneller Boot-Spiegel des Modus (localStorage) – Quelle der Wahrheit bleibt settings.json. */
export function persistThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // localStorage nicht verfügbar -> nur für diese Sitzung
  }
}

export function storedThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // ignorieren
  }
  return 'dark'
}
