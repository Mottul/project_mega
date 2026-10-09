// App-Menü „Mottulbox ▾“: alles, was die GANZE App betrifft – Design, Akzentfarbe, Dichte und
// die mitgelieferten Programme (ffmpeg, yt-dlp). Steht links in der Kopfleiste jedes Werkzeugs
// und rechts auf dem Startbildschirm. Werkzeug-Einstellungen gehören nie hierher, sondern in
// die Schublade des Werkzeugs – so kann man beides nicht verwechseln.
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Monitor, Moon, Rows2, Rows4, Settings2, Sun } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Segmented } from '@renderer/components/ui/segmented'
import { MottulboxLogo } from '@renderer/components/MottulboxLogo'
import { ACCENTS, accentSwatch } from '@renderer/lib/accent'
import { updateSettings, useSettings } from '@renderer/lib/settings'
import { cn } from '@renderer/lib/utils'
import type { ThemeMode, UiDensity } from '@shared/types'
import { FfmpegSettings } from './FfmpegSettings'
import { useAppearance } from './useAppearance'

const THEMES: { value: ThemeMode; label: string; Icon: typeof Moon }[] = [
  { value: 'dark', label: 'Dunkel', Icon: Moon },
  { value: 'light', label: 'Hell', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor }
]
const DENSITIES: { value: UiDensity; label: string; Icon: typeof Rows2 }[] = [
  { value: 'normal', label: 'Normal', Icon: Rows2 },
  { value: 'compact', label: 'Kompakt', Icon: Rows4 }
]

function Heading({ children }: { children: string }): JSX.Element {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </h2>
  )
}

export function AppMenu({
  variant = 'brand',
  align = 'left'
}: {
  /** brand: Logo + „Mottulbox“ (Kopfleiste der Werkzeuge); plain: „App-Einstellungen“ */
  variant?: 'brand' | 'plain'
  align?: 'left' | 'right'
}): JSX.Element {
  const look = useAppearance()
  const ytdlpAuto = useSettings((s) => s.ytdlpAutoUpdate) ?? true
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Klick außerhalb / Escape schließt das Menü.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        title="Einstellungen der ganzen App: Design, Akzentfarbe, ffmpeg, yt-dlp"
        className="gap-2 px-2.5"
      >
        {variant === 'brand' ? (
          <>
            <MottulboxLogo height={20} className="shrink-0 text-foreground" title="" />
            Mottulbox
          </>
        ) : (
          <>
            <Settings2 className="size-4" /> App-Einstellungen
          </>
        )}
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Einstellungen der ganzen App"
          className={cn(
            'absolute top-full z-50 mt-1 max-h-[80vh] w-[340px] max-w-[calc(100vw-2rem)] space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          <p className="text-xs text-muted-foreground">
            Gilt für die ganze App. Die Einstellungen eines Werkzeugs stehen in seiner Schublade
            („Einstellungen“ neben dem Werkzeugnamen).
          </p>

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
                    'size-7 rounded-full ring-offset-2 ring-offset-card transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    look.accent === a.id ? 'ring-2 ring-foreground' : 'hover:scale-110'
                  )}
                  style={{ background: accentSwatch(a) }}
                />
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <Heading>Anzeige</Heading>
            <Segmented
              label="Anzeige"
              value={look.density}
              onChange={look.setDensity}
              options={DENSITIES}
            />
          </section>

          <div className="h-px bg-border" />

          <section className="space-y-2">
            <Heading>ffmpeg</Heading>
            <FfmpegSettings />
          </section>

          <section className="space-y-2">
            <Heading>yt-dlp</Heading>
            <Checkbox
              checked={ytdlpAuto}
              onChange={(on) => void updateSettings({ ytdlpAutoUpdate: on })}
              label="Beim Start auf neue Version prüfen"
              hint="Version und „Prüfen“ stehen im YouTube-Downloader."
            />
          </section>
        </div>
      )}
    </div>
  )
}
