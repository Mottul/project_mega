// Kompakter Design-Umschalter für die Kopfzeilen. Klick wechselt zyklisch
// Dunkel -> Hell -> System. Quelle der Wahrheit ist settings.json; localStorage
// spiegelt den Modus nur für ein flackerfreies Booten (siehe lib/theme).
import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from './ui/button'
import { api } from '@renderer/lib/api'
import { applyTheme, persistThemeMode, storedThemeMode } from '@renderer/lib/theme'
import type { ThemeMode } from '@shared/types'

const NEXT: Record<ThemeMode, ThemeMode> = { dark: 'light', light: 'system', system: 'dark' }
const LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Hell', dark: 'Dunkel' }
const ICON: Record<ThemeMode, typeof Monitor> = { system: Monitor, light: Sun, dark: Moon }

function useTheme(): { mode: ThemeMode; setMode: (m: ThemeMode) => void } {
  const [mode, setModeState] = useState<ThemeMode>(() => storedThemeMode())

  // Persistierte Einstellung laden (kann von einem anderen Fenster stammen).
  useEffect(() => {
    void api.getSettings().then((s) => {
      const m = s.theme ?? 'dark'
      setModeState(m)
      applyTheme(m)
      persistThemeMode(m)
    })
  }, [])

  // Bei 'system' auf OS-Wechsel reagieren.
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (): void => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  function setMode(m: ThemeMode): void {
    setModeState(m)
    applyTheme(m)
    persistThemeMode(m)
    void api.setSettings({ theme: m })
  }

  return { mode, setMode }
}

export function ThemeToggle(): JSX.Element {
  const { mode, setMode } = useTheme()
  const Icon = ICON[mode]
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setMode(NEXT[mode])}
      title={`Design: ${LABEL[mode]} – klicken für ${LABEL[NEXT[mode]]}`}
      aria-label={`Design: ${LABEL[mode]}`}
    >
      <Icon className="size-4" />
    </Button>
  )
}
