// Vorschau des gewählten Elements (Phase 1: Standbilder). Bilder zeigen Anfang und Ende der
// Ken-Burns-Bahn – berechnet mit DERSELBEN Funktion wie die Datei (kenBurnsRect), also genau
// der Ausschnitt, der gerechnet wird. Videos zeigen das Bild am Start- und am Endpunkt.

import { cn } from '@renderer/lib/utils'
import type { VgenElement } from '@shared/types'
import { baseWindow, kenBurnsRect, type VgenElementPlan, type VgenPlan } from '@shared/videoGenPlan'
import { useThumb } from './meta'
import { fmtDuration } from './presets'

export function Preview({
  el,
  ep,
  plan
}: {
  el: VgenElement
  ep: VgenElementPlan | undefined
  plan: VgenPlan
}): JSX.Element {
  const out = { width: plan.width, height: plan.height }
  if (el.kind === 'video') {
    const dur = ep ? ep.frames / plan.fps : null
    const start = el.inSec ?? 0
    const end = dur !== null ? Math.max(start, start + dur - 0.1) : null
    return (
      <div className="grid grid-cols-2 gap-3">
        <Frame
          label={`Start ${fmtDuration(start)}`}
          path={el.path}
          time={start}
          out={out}
          ep={ep}
          plan={plan}
        />
        {end !== null ? (
          <Frame
            label={`Ende ${fmtDuration(end)}`}
            path={el.path}
            time={end}
            out={out}
            ep={ep}
            plan={plan}
          />
        ) : (
          <div />
        )}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <Frame label="Anfang" path={el.path} time={null} t={0} out={out} ep={ep} plan={plan} />
      <Frame label="Ende" path={el.path} time={null} t={1} out={out} ep={ep} plan={plan} />
    </div>
  )
}

/**
 * Ein Bild der Ausgabe: Rahmen im Seitenverhältnis der Ausgabe, darin die Zeichenfläche so
 * verschoben und vergrößert, dass genau der Ausschnitt `rect` den Rahmen füllt.
 */
function Frame({
  label,
  path,
  time,
  t = 0,
  out,
  ep,
  plan
}: {
  label: string
  path: string
  time: number | null
  t?: number
  out: { width: number; height: number }
  ep: VgenElementPlan | undefined
  plan: VgenPlan
}): JSX.Element {
  const { ref, url } = useThumb(path, time, 960)
  const fit = ep?.fit ?? 'crop'
  const canvas = ep?.canvas ?? out
  const rect = ep?.kenBurns ? kenBurnsRect(ep.kenBurns, t) : baseWindow(canvas, out)
  // Zeichenfläche: beim Füllen eines Bildes die Deckfläche (= das Bild), sonst die Ausgabe mit
  // dem eingepassten Bild darin
  const imageIsCanvas = fit === 'crop' && ep?.kind === 'image'
  const style = {
    width: `${100 / rect.w}%`,
    height: `${100 / rect.h}%`,
    left: `${(-rect.x / rect.w) * 100}%`,
    top: `${(-rect.y / rect.h) * 100}%`
  }
  const bg = plan.background.replace(/^0x/, '#')
  return (
    <figure className="space-y-1">
      <div
        ref={ref}
        className="relative w-full overflow-hidden rounded border border-border"
        style={{ aspectRatio: `${out.width} / ${out.height}`, background: bg }}
      >
        {url && (
          <div className="absolute" style={style}>
            {imageIsCanvas ? (
              <img src={url} alt="" className="size-full" />
            ) : (
              <>
                {fit === 'blur' && (
                  <img
                    src={url}
                    alt=""
                    className="absolute inset-0 size-full scale-110 object-cover blur-md"
                  />
                )}
                <img
                  src={url}
                  alt=""
                  className={cn(
                    'absolute inset-0 size-full',
                    fit === 'crop' ? 'object-cover' : 'object-contain'
                  )}
                />
              </>
            )}
          </div>
        )}
      </div>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  )
}
