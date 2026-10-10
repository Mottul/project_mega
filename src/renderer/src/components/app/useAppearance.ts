// Darstellung der ganzen App (Design, Akzentfarbe, Dichte): Quelle der Wahrheit ist
// settings.json; localStorage spiegelt die Wahl nur für ein flackerfreies Booten (lib/theme,
// lib/accent, lib/density).
// - useAppearanceSync hängt an der App-Wurzel JEDES Fensters (außer den Vollbild-Ausgaben):
//   So folgen auch Fenster ohne App-Menü (kleine Werkzeuge) einer Änderung in einem anderen
//   Fenster, und „System“ folgt dem Betriebssystem.
// - useAppearance ist die Bedienung im App-Menü (lesen + ändern).
import { useEffect } from 'react'
import { applyAccent, persistAccent, storedAccent } from '@renderer/lib/accent'
import { applyDensity, persistDensity, storedDensity } from '@renderer/lib/density'
import { updateSettings, useSettings } from '@renderer/lib/settings'
import { applyTheme, persistThemeMode, storedThemeMode } from '@renderer/lib/theme'
import type { AccentId, ThemeMode, UiDensity } from '@shared/types'

export interface Appearance {
  theme: ThemeMode
  accent: AccentId
  density: UiDensity
  setTheme: (m: ThemeMode) => void
  setAccent: (a: AccentId) => void
  setDensity: (d: UiDensity) => void
}

/** Gespeicherte Darstellung anwenden und ihr folgen (auch Änderungen aus anderen Fenstern). */
export function useAppearanceSync(enabled: boolean): void {
  const theme = useSettings((s) => s.theme ?? 'dark')
  const accent = useSettings((s) => s.accent ?? 'gold')
  const density = useSettings((s) => s.uiDensity ?? 'normal')

  useEffect(() => {
    if (!enabled || theme == null) return
    applyTheme(theme)
    persistThemeMode(theme)
    if (theme !== 'system') return
    // „System“: dem Betriebssystem folgen
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (): void => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [enabled, theme])

  useEffect(() => {
    if (!enabled || accent == null) return
    applyAccent(accent)
    persistAccent(accent)
  }, [enabled, accent])

  useEffect(() => {
    if (!enabled || density == null) return
    applyDensity(density)
    persistDensity(density)
  }, [enabled, density])
}

/** Bedienung im App-Menü: Werte lesen und ändern (angewendet wird über useAppearanceSync). */
export function useAppearance(): Appearance {
  // bis settings.json geladen ist, der Boot-Spiegel – so springt die Auswahl nicht
  const theme = useSettings((s) => s.theme ?? 'dark') ?? storedThemeMode()
  const accent = useSettings((s) => s.accent ?? 'gold') ?? storedAccent()
  const density = useSettings((s) => s.uiDensity ?? 'normal') ?? storedDensity()
  return {
    theme,
    accent,
    density,
    setTheme: (m) => updateSettings({ theme: m }),
    setAccent: (a) => updateSettings({ accent: a }),
    setDensity: (d) => updateSettings({ uiDensity: d })
  }
}
