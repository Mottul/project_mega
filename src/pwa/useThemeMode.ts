// Hell/Dunkel in der Rechner-PWA. Es gibt hier keine settings.json: Der Modus liegt im selben
// Boot-Spiegel wie in der App (lib/theme), der im Browser die einzige Ablage ist.
import { useEffect, useState } from 'react'
import type { ThemeMode } from '@shared/types'
import { applyTheme, persistThemeMode, resolveTheme, storedThemeMode } from '@renderer/lib/theme'
import { PWA_BACKGROUND } from './colors'

const ORDER: ThemeMode[] = ['dark', 'light', 'system']

/** Theme anwenden + Statusleiste des Handys (theme-color) in derselben Farbe */
export function applyPwaTheme(mode: ThemeMode): void {
  applyTheme(mode)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', PWA_BACKGROUND[resolveTheme(mode)])
}

export function useThemeMode(): { mode: ThemeMode; cycle: () => void } {
  const [mode, setMode] = useState<ThemeMode>(storedThemeMode)

  useEffect(() => {
    applyPwaTheme(mode)
    if (mode !== 'system') return
    // „System“ folgt dem Handy auch während die App offen ist (Dunkelmodus am Abend)
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (): void => applyPwaTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  return {
    mode,
    cycle: () => {
      const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
      persistThemeMode(next)
      setMode(next)
    }
  }
}
