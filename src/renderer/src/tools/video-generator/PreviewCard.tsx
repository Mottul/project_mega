// Vorschau-Karte des Video-Generators: Live-Vorschau des ganzen Projekts (springt zur Auswahl),
// Ken-Burns-Rahmen auf dem gewählten Bild, Bereichsregler für das gewählte Video und „Vorschau
// rechnen“ – ein kleiner, exakter Probelauf um das gewählte Element (im main, mit Zwischen-
// speicher). Eine gerechnete Vorschau gilt nur für den Stand, aus dem sie entstand.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard, Frame, MonitorPlay, X, type LucideIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Progress } from '@renderer/components/ui/progress'
import { Segmented } from '@renderer/components/ui/segmented'
import { api } from '@renderer/lib/api'
import type { VgenElement, VgenKenBurns, VgenPreviewOutcome, VgenProject } from '@shared/types'
import type { VgenPlan } from '@shared/videoGenPlan'
import { KenBurnsEditor } from './KenBurnsEditor'
import { LivePreview } from './LivePreview'
import type { Meta } from './meta'
import { fmtDuration } from './presets'
import { RangeBar } from './RangeBar'
import { useVideoGen, type PreviewMode } from './store'

/** Ergebnis + Stand des Projekts, aus dem es entstand (ändert sich das Projekt: veraltet). */
type Rendered = Extract<VgenPreviewOutcome, { ok: true }> & { stamp: string }

export function PreviewCard({
  project,
  plan,
  meta,
  single,
  canRender,
  onKenBurns,
  onRange
}: {
  project: VgenProject
  plan: VgenPlan
  meta: Record<string, Meta>
  /** genau ein gewähltes Element */
  single: VgenElement | null
  /** Plan ohne Fehler, Analyse fertig, ffmpeg da */
  canRender: boolean
  onKenBurns: (id: string, kb: VgenKenBurns | null) => void
  onRange: (id: string, inSec: number | null, outSec: number | null) => void
}): JSX.Element {
  const mode = useVideoGen((s) => s.previewMode)
  const setMode = useVideoGen((s) => s.setPreviewMode)
  const [scrub, setScrub] = useState<number | null>(null)
  const [job, setJob] = useState<{ id: string; progress: number; text: string } | null>(null)
  const [rendered, setRendered] = useState<Rendered | null>(null)
  const [error, setError] = useState<string | null>(null)
  const jobRef = useRef<string | null>(null)
  const stamp = useMemo(() => JSON.stringify(project), [project])
  const ep = single ? plan.elements.find((e) => e.id === single.id) : undefined
  const isImage = single?.kind === 'image' && Boolean(ep)
  const m = single ? meta[single.path] : undefined
  const sourceSec = single?.kind === 'video' && m?.kind === 'ok' ? m.info.durationSec : null
  const stale = rendered !== null && rendered.stamp !== stamp

  useEffect(
    () =>
      api.videoGen.onPreviewProgress((p) => {
        if (p.requestId === jobRef.current) {
          setJob({ id: p.requestId, progress: p.progress, text: p.text })
        }
      }),
    []
  )
  // Werkzeug verlassen: laufende Vorschau abbrechen (sie rechnet sonst ins Leere weiter)
  useEffect(
    () => () => {
      if (jobRef.current) void api.videoGen.cancelPreview()
    },
    []
  )
  // Rahmen nur für Bilder, Gerechnet nur mit Ergebnis – sonst zurück zur Live-Vorschau
  useEffect(() => {
    if ((mode === 'frame' && !isImage) || (mode === 'rendered' && !rendered)) setMode('live')
  }, [mode, isImage, rendered, setMode])
  // neues Ergebnis zeigen – erst NACHDEM es im Zustand steht: der Store rendert sofort, das
  // Ergebnis käme sonst einen Durchlauf später, und die Zeile oben schaltete zurück auf Live
  useEffect(() => {
    if (rendered) setMode('rendered')
  }, [rendered, setMode])

  async function renderPreview(): Promise<void> {
    if (!single) return
    const id = crypto.randomUUID()
    jobRef.current = id
    setJob({ id, progress: 0, text: 'Startet' })
    setError(null)
    const res = await api.videoGen.preview({ requestId: id, project, elementId: single.id })
    if (jobRef.current !== id) return
    jobRef.current = null
    setJob(null)
    if (res.ok) setRendered({ ...res, stamp })
    else if (!res.canceled) setError(res.error)
  }

  const modes: { value: PreviewMode; label: string; Icon: LucideIcon }[] = [
    { value: 'live', label: 'Live', Icon: MonitorPlay },
    ...(isImage ? [{ value: 'frame' as const, label: 'Rahmen', Icon: Frame }] : []),
    ...(rendered ? [{ value: 'rendered' as const, label: 'Gerechnet', Icon: Clapperboard }] : [])
  ]

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Vorschau</p>
        <Segmented label="Vorschau-Art" value={mode} onChange={setMode} options={modes} />
        <div className="flex-1" />
        {job ? (
          <>
            <span className="text-xs text-muted-foreground">{job.text} …</span>
            <Progress value={job.progress} className="w-28" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Vorschau abbrechen"
              title="Vorschau abbrechen"
              onClick={() => {
                jobRef.current = null
                setJob(null)
                void api.videoGen.cancelPreview()
              }}
            >
              <X className="size-4" />
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={!single || !canRender}
            title={
              single
                ? 'Bereich um das gewählte Element klein (640 px) und exakt wie das Ergebnis rechnen'
                : 'Erst ein Element wählen'
            }
            onClick={() => void renderPreview()}
          >
            <Clapperboard className="size-4" />
            Vorschau rechnen
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">Vorschau fehlgeschlagen: {error}</p>}

      {mode === 'frame' && single && ep ? (
        <KenBurnsEditor
          el={single}
          ep={ep}
          plan={plan}
          onChange={(kb) => onKenBurns(single.id, kb)}
          onReset={() => onKenBurns(single.id, null)}
        />
      ) : mode === 'rendered' && rendered ? (
        <div className="space-y-2">
          <video
            key={rendered.url}
            src={rendered.url}
            controls
            autoPlay
            className="mx-auto w-full rounded border border-border bg-black"
            style={{
              aspectRatio: `${rendered.width} / ${rendered.height}`,
              maxWidth: `calc(45vh * ${rendered.width / rendered.height})`
            }}
            data-testid="vgen-rendered"
          />
          <p className="text-xs text-muted-foreground">
            Gerechnet in {rendered.width} × {rendered.height}
            {rendered.cached ? ' (aus dem Zwischenspeicher)' : ''} – das Element läuft von{' '}
            {fmtDuration(rendered.elementStartSec)} bis {fmtDuration(rendered.elementEndSec)}, ohne
            Lautheitsangleichung.
            {stale && (
              <span className="text-amber-400 light:text-amber-700">
                {' '}
                Das Projekt wurde seitdem geändert – neu rechnen für den aktuellen Stand.
              </span>
            )}
          </p>
        </div>
      ) : (
        <LivePreview
          plan={plan}
          elements={project.elements}
          selectedId={single?.id ?? null}
          sourceOverride={single && scrub !== null ? { id: single.id, time: scrub } : null}
        />
      )}

      {mode === 'live' && single?.kind === 'video' && sourceSec ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Ausschnitt des Videos</p>
          <RangeBar
            durationSec={sourceSec}
            inSec={single.inSec}
            outSec={single.outSec}
            minLenSec={1 / plan.fps}
            onScrub={setScrub}
            onCommit={(a, b) => onRange(single.id, a, b)}
          />
        </div>
      ) : null}
    </Card>
  )
}
