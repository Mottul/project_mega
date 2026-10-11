// Knopf „Darstellung“ oben rechts in der Rechner-PWA: Design und Akzentfarbe wie im App-Menü
// der Mottulbox. Klappt als Feld unter dem Knopf auf; Tippen daneben oder Escape schließt.
import { useEffect, useRef, useState } from 'react'
import { Monitor, Moon, Palette, Sun } from 'lucide-react'
import type { ThemeMode } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Segmented } from '@renderer/components/ui/segmented'
import { ACCENTS, accentSwatch } from '@renderer/lib/accent'
import { cn } from '@renderer/lib/utils'
import type { PwaLook } from './useLook'

const THEMES: { value: ThemeMode; label: string; Icon: typeof Moon }[] = [
  { value: 'dark', label: 'Dunkel', Icon: Moon },
  { value: 'light', label: 'Hell', Icon: Sun },
  { value: 'system', label: 'Gerät', Icon: Monitor }
]

function Heading({ children }: { children: string }): JSX.Element {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </h2>
  )
}

export function LookMenu({ look }: { look: PwaLook }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // pointerdown statt mousedown: auf dem Handy schließt so schon das Antippen daneben
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Darstellung"
        aria-expanded={open}
        title="Darstellung: Design und Akzentfarbe"
        onClick={() => setOpen((o) => !o)}
        className={cn(open && 'bg-primary/10 text-primary')}
      >
        <Palette className="size-5" />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Darstellung"
          className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-1.5rem))] space-y-4 rounded-lg border border-border bg-card p-4 shadow-2xl shadow-black/40"
        >
          <section className="space-y-2">
            <Heading>Design</Heading>
            <Segmented
              label="Design"
              value={look.theme}
              onChange={look.setTheme}
              options={THEMES}
            />
          </section>
          <section className="space-y-2">
            <Heading>Akzentfarbe</Heading>
            <div className="grid grid-cols-7 gap-2" role="group" aria-label="Akzentfarbe">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => look.setAccent(a.id)}
                  title={a.label}
                  aria-label={a.label}
                  aria-pressed={look.accent === a.id}
                  className={cn(
                    'aspect-square w-full rounded-full ring-offset-2 ring-offset-card transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    look.accent === a.id ? 'ring-2 ring-foreground' : 'hover:scale-110'
                  )}
                  style={{ background: accentSwatch(a) }}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
