// Darstellung der ganzen App (Design, Akzentfarbe, Dichte): Quelle der Wahrheit ist
// settings.json; localStorage spiegelt die Wahl nur für ein flackerfreies Booten (lib/theme,
// lib/accent, lib/density). Die Hooks hängen am immer sichtbaren App-Menü-Knopf – so folgt
// „System“ dem Betriebssystem auch, solange das Menü zu ist.
import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { applyAccent, persistAccent, storedAccent } from '@renderer/lib/accent'
import { applyDensity, persistDensity, storedDensity } from '@renderer/lib/density'
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

export function useAppearance(): Appearance {
  const [theme, setThemeState] = useState<ThemeMode>(() => storedThemeMode())
  const [accent, setAccentState] = useState<AccentId>(() => storedAccent())
  const [density, setDensityState] = useState<UiDensity>(() => storedDensity())

  // Gespeicherte Werte laden (können aus einem anderen Fenster stammen).
  useEffect(() => {
    void api.getSettings().then((s) => {
      const t = s.theme ?? 'dark'
      const a = s.accent ?? 'gold'
      const d = s.uiDensity ?? 'normal'
      setThemeState(t)
      applyTheme(t)
      persistThemeMode(t)
      setAccentState(a)
      applyAccent(a)
      persistAccent(a)
      setDensityState(d)
      applyDensity(d)
      persistDensity(d)
    })
  }, [])

  // Bei „System“ dem Betriebssystem folgen.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (): void => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  return {
    theme,
    accent,
    density,
    setTheme: (m) => {
      setThemeState(m)
      applyTheme(m)
      persistThemeMode(m)
      void api.setSettings({ theme: m })
    },
    setAccent: (a) => {
      setAccentState(a)
      applyAccent(a)
      persistAccent(a)
      void api.setSettings({ accent: a })
    },
    setDensity: (d) => {
      setDensityState(d)
      applyDensity(d)
      persistDensity(d)
      void api.setSettings({ uiDensity: d })
    }
  }
}
