// Darstellung der Rechner-PWA: Design (Dunkel/Hell/wie das Gerät) und Akzentfarbe. Es gibt hier
// keine settings.json – beides liegt im selben Boot-Spiegel wie in der App (lib/theme,
// lib/accent), der im Browser die einzige Ablage ist.
import { useEffect, useState } from 'react'
import type { AccentId, ThemeMode } from '@shared/types'
import { applyAccent, persistAccent, storedAccent } from '@renderer/lib/accent'
import { applyTheme, persistThemeMode, resolveTheme, storedThemeMode } from '@renderer/lib/theme'
import { PWA_BACKGROUND } from './colors'

/** Theme anwenden + Statusleiste des Handys (theme-color) in derselben Farbe */
export function applyPwaTheme(mode: ThemeMode): void {
  applyTheme(mode)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', PWA_BACKGROUND[resolveTheme(mode)])
}

export interface PwaLook {
  theme: ThemeMode
  accent: AccentId
  setTheme: (mode: ThemeMode) => void
  setAccent: (id: AccentId) => void
}

export function usePwaLook(): PwaLook {
  const [theme, setTheme] = useState<ThemeMode>(storedThemeMode)
  const [accent, setAccent] = useState<AccentId>(storedAccent)

  useEffect(() => {
    applyPwaTheme(theme)
    if (theme !== 'system') return
    // „wie das Gerät“ folgt dem Handy auch, während die App offen ist (Dunkelmodus am Abend)
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (): void => applyPwaTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => applyAccent(accent), [accent])

  return {
    theme,
    accent,
    setTheme: (mode) => {
      persistThemeMode(mode)
      setTheme(mode)
    },
    setAccent: (id) => {
      persistAccent(id)
      setAccent(id)
    }
  }
}
