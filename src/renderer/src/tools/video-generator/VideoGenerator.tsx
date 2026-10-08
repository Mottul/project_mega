// Video-Generator (Diashow & Montage): Bilder und Videos zu EINEM Video – Reihenfolge,
// Standzeiten, Übergänge, Ken Burns, Zielgröße, Musik, nahtlose Schleife. Der Plan
// (shared/videoGenPlan) läuft hier für Gesamtdauer, Lineal und Hinweise genauso wie im main,
// wo gerechnet wird (Stücke mit Zwischenspeicher, gemeinsame Warteschlange mit dem Konverter).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  FolderOpen,
  FolderSearch,
  Info,
  LayoutGrid,
  List,
  Loader2,
  Play,
  Shuffle,
  Trash2,
  XCircle
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Segmented } from '@renderer/components/ui/segmented'
import { selectClass } from '@renderer/components/ui/select'
import { ToolShell } from '@renderer/components/ToolShell'
import { useKiosk } from '@renderer/launcher/kiosk'
import { api } from '@renderer/lib/api'
import { useHandoff } from '@renderer/lib/handoff'
import { toast } from '@renderer/lib/toast'
import { usePersistentState, type Codec } from '@renderer/lib/usePersistentState'
import { cn } from '@renderer/lib/utils'
import { rateText } from '@shared/convertPlan'
import type { ConvertCapabilities, VgenJob } from '@shared/types'
import { planVideoGen, type VgenCaps } from '@shared/videoGenPlan'
import { AudioPanel, DefaultsPanel, OutputPanel, SelectionPanel } from './Inspector'
import { JobRow } from './JobList'
import { useVgenMeta } from './meta'
import { moveMany, nudge, shuffle, sortItems, type SortKey } from './order'
import { MEDIA_FILTER_EXTENSIONS, fmtDuration, kindForPath } from './presets'
import { PreviewCard } from './PreviewCard'
import { Storyboard } from './Storyboard'
import { useVideoGen } from './store'

const viewCodec: Codec<'tiles' | 'list'> = {
  parse: (raw) => (raw === 'tiles' || raw === 'list' ? raw : null),
  format: (v) => v
}

const LEVEL_STYLE = {
  error: { Icon: XCircle, cls: 'text-destructive' },
  warning: { Icon: AlertTriangle, cls: 'text-amber-400 light:text-amber-700' },
  info: { Icon: Info, cls: 'text-muted-foreground' }
} as const

export function VideoGenerator(): JSX.Element {
  const navigate = useNavigate()
  // Kundenansicht: keine Sprünge in andere Werkzeuge
  const locked = useKiosk()
  const project = useVideoGen((s) => s.project)
  const selected = useVideoGen((s) => s.selected)
  const meta = useVgenMeta((s) => s.meta)
  const [caps, setCaps] = useState<ConvertCapabilities | null>(null)
  const [jobs, setJobs] = useState<Record<string, VgenJob>>({})
  const [view, setView] = usePersistentState<'tiles' | 'list'>('vgen:view', 'tiles', viewCodec)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState<'adding' | 'starting' | null>(null)
  const elements = project.elements

  // Analyse aller Dateien (Cache im main; Tiefenanalyse liest die EXIF-Drehung) – auch der
  // Musik: Ihre Länge braucht der Plan für die Titelfolge
  const tracks = project.music?.tracks
  useEffect(() => {
    for (const e of elements) useVgenMeta.getState().load(e.path)
    for (const t of tracks ?? []) useVgenMeta.getState().load(t)
  }, [elements, tracks])

  useEffect(() => {
    // Übergabe aus Video-Konverter oder Medien-Info
    const handed = useHandoff.getState().takePaths('video-generator')
    if (handed.length) void addPaths(handed, null)
    void api.converter.capabilities().then(setCaps)
    void api.videoGen.list().then((list) => setJobs(Object.fromEntries(list.map((j) => [j.id, j]))))
    return api.videoGen.onUpdate((job) => setJobs((prev) => ({ ...prev, [job.id]: job })))
  }, [])

  const vcaps = useMemo<VgenCaps>(
    () => ({
      tonemap: caps?.tonemap ?? true,
      vpxAlpha: caps?.vpxAlpha ?? true,
      xfade: caps?.xfade ?? true,
      perspective: caps?.perspective ?? true
    }),
    [caps]
  )
  const plan = useMemo(
    () =>
      planVideoGen(
        project,
        (p) => {
          const m = meta[p]
          return m?.kind === 'ok' ? m.info : null
        },
        vcaps
      ),
    [project, meta, vcaps]
  )

  const loading = elements.filter((e) => !meta[e.path] || meta[e.path].kind === 'loading')
  const loadingIds = new Set(loading.map((e) => e.id))
  const musicLoading = (tracks ?? []).some((t) => !meta[t] || meta[t].kind === 'loading')
  // „nicht analysiert“ gilt erst, wenn die Analyse fertig ist
  const hints = plan.hints.filter(
    (h) =>
      !(h.elementId && loadingIds.has(h.elementId)) &&
      !(musicLoading && (h.id === 'music-unreadable' || h.id === 'music-short'))
  )
  const errors = hints.filter((h) => h.level === 'error')
  const ffmpegMissing = caps !== null && !caps.ffmpegFound
  const ready = !loading.length && !musicLoading && !errors.length && !ffmpegMissing
  const canStart = elements.length > 0 && ready && busy === null

  async function addPaths(paths: string[], at: number | null): Promise<void> {
    setBusy('adding')
    try {
      // Ordner rekursiv (natürlich sortiert); direkt gewählte Dateien zählen immer
      const col = await api.mediaInfo.collect(paths)
      const files = col.files.filter((f) => kindForPath(f) !== null)
      useVideoGen.getState().insertFiles(files, at)
      const skipped = col.files.length - files.length
      if (skipped) toast.info(`${skipped} Datei(en) übersprungen – keine Bilder oder Videos.`)
      if (col.unreadable.length) toast.warning(`${col.unreadable.length} Pfad(e) nicht lesbar.`)
      if (col.limited) toast.warning('Sehr viele Dateien – nur die ersten 5000 übernommen.')
    } finally {
      setBusy(null)
    }
  }

  async function addFiles(): Promise<void> {
    const paths = await api.selectPaths({
      title: 'Bilder und Videos auswählen',
      multi: true,
      filters: [
        { name: 'Bilder und Videos', extensions: MEDIA_FILTER_EXTENSIONS },
        { name: 'Alle Dateien', extensions: ['*'] }
      ]
    })
    if (paths.length) await addPaths(paths, null)
  }

  async function addFolder(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Ordner auswählen', directories: true })
    if (paths.length) await addPaths(paths, null)
  }

  function sortBy(key: SortKey): void {
    const dateOf = (e: { path: string }): number | null => {
      const m = meta[e.path]
      const t = m?.kind === 'ok' && m.info.creationTime ? Date.parse(m.info.creationTime) : NaN
      return Number.isFinite(t) ? t : null
    }
    useVideoGen.getState().setElements(sortItems(elements, key, dateOf))
  }

  function onNudge(dir: -1 | 1): void {
    useVideoGen.getState().setElements(nudge(elements, selected, dir))
  }

  async function start(): Promise<void> {
    setBusy('starting')
    try {
      const out = await api.videoGen.pickOutput(project.output.format, 'Diashow')
      if (!out) return
      await api.videoGen.enqueue({ project, outputPath: out })
    } catch (e) {
      toast.error(
        'Video konnte nicht gestartet werden',
        e instanceof Error
          ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : String(e)
      )
    } finally {
      setBusy(null)
    }
  }

  async function toPlayer(job: VgenJob): Promise<void> {
    const s = await api.getSettings()
    try {
      await api.player.import({
        sources: [job.outputPath],
        fitMode: s.player.defaultFit,
        wall: { width: s.player.wallWidth, height: s.player.wallHeight }
      })
      toast.success('An den Video-Player übergeben – der Import läuft dort.')
    } catch (e) {
      toast.error(
        'Übernahme in den Player fehlgeschlagen',
        e instanceof Error ? e.message : String(e)
      )
    }
  }

  function showInMediaInfo(path: string): void {
    useHandoff.getState().givePaths('media-info', [path])
    navigate('/tool/media-info')
  }

  async function clearFinished(): Promise<void> {
    await api.videoGen.clearFinished()
    const list = await api.videoGen.list()
    setJobs(Object.fromEntries(list.map((j) => [j.id, j])))
  }

  const single = selected.length === 1 ? elements.find((e) => e.id === selected[0]) : undefined
  const singleInfo = (() => {
    if (!single) return null
    const m = meta[single.path]
    if (m?.kind === 'error') return m.message
    if (m?.kind !== 'ok') return 'analysiere …'
    const v = m.info.video[0]
    const parts = [
      v ? `${v.displayWidth}×${v.displayHeight}` : null,
      m.info.isStill ? 'Foto' : v?.fps ? `${rateText(v.fps)} fps` : null,
      m.info.durationSec ? fmtDuration(m.info.durationSec) : null,
      m.info.audio.length ? 'mit Ton' : m.info.isStill ? null : 'ohne Ton'
    ]
    return parts.filter(Boolean).join(' · ')
  })()

  const jobList = Object.values(jobs).sort((a, b) => b.createdAt - a.createdAt)

  return (
    <ToolShell
      id="video-generator"
      aside={
        <>
          {/* Auswahl zuerst: beim Bearbeiten das meistgebrauchte Panel */}
          <SelectionPanel infoText={singleInfo} plan={plan} onNudge={onNudge} />
          <OutputPanel caps={caps} />
          <DefaultsPanel />
          <AudioPanel meta={meta} caps={vcaps} plan={plan} />
        </>
      }
      main={
        <div className="space-y-4 p-6">
          {ffmpegMissing && (
            <Card className="flex items-start gap-3 border-destructive/50 p-4">
              <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <p className="text-sm">
                ffmpeg wurde nicht gefunden – ohne ffmpeg lässt sich kein Video erzeugen.
                {caps?.error ? ` (${caps.error})` : ''}
              </p>
            </Card>
          )}

          <Card
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const paths = Array.from(e.dataTransfer.files)
                .map((f) => api.pathForFile(f))
                .filter(Boolean)
              if (paths.length) void addPaths(paths, null)
            }}
            className={cn(
              'space-y-4 p-5 transition-colors',
              dragOver && 'border-primary bg-primary/5'
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => void addFiles()} disabled={busy !== null}>
                <FolderSearch className="size-4" /> Bilder & Videos
              </Button>
              <Button variant="secondary" onClick={() => void addFolder()} disabled={busy !== null}>
                <FolderOpen className="size-4" /> Ordner
              </Button>
              {elements.length > 1 && (
                <>
                  <select
                    aria-label="Sortieren"
                    className={selectClass}
                    value=""
                    onChange={(e) => e.target.value && sortBy(e.target.value as SortKey)}
                  >
                    <option value="">Sortieren …</option>
                    <option value="name">nach Name</option>
                    <option value="date">nach Aufnahmedatum</option>
                    <option value="type">nach Typ</option>
                  </select>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Mischen"
                    title="Mischen (würfelt die Liste einmal sichtbar um)"
                    onClick={() =>
                      useVideoGen
                        .getState()
                        .setElements(shuffle(elements, Math.floor(Math.random() * 2 ** 31)))
                    }
                  >
                    <Shuffle className="size-4" />
                  </Button>
                </>
              )}
              {elements.length > 0 && (
                <>
                  <Segmented
                    label="Ansicht"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: 'tiles', label: 'Kacheln', Icon: LayoutGrid, iconOnly: true },
                      { value: 'list', label: 'Liste', Icon: List, iconOnly: true }
                    ]}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Alle entfernen"
                    title="Alle entfernen"
                    onClick={() =>
                      void api
                        .confirm({
                          message: `Alle ${elements.length} Elemente entfernen?`,
                          detail: 'Die Dateien selbst bleiben unverändert.',
                          confirmLabel: 'Entfernen',
                          danger: true
                        })
                        .then((ok) => ok && useVideoGen.getState().clearElements())
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
              <div className="flex-1" />
              {elements.length > 0 && (
                <span className="text-sm tabular-nums text-muted-foreground">
                  {elements.length} {elements.length === 1 ? 'Element' : 'Elemente'}
                  {!loading.length && plan.totalFrames > 0
                    ? ` · ${fmtDuration(plan.durationSec)}`
                    : ''}
                </span>
              )}
              <Button onClick={() => void start()} disabled={!canStart}>
                {busy === 'starting' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Video erzeugen
              </Button>
            </div>

            {busy === 'adding' && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Dateien werden eingelesen …
              </p>
            )}

            {elements.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                Bilder, Videos oder Ordner hierher ziehen – oder oben hinzufügen.
                <br />
                Ziel: {project.output.width} × {project.output.height},{' '}
                {rateText(project.output.fps)} fps
              </p>
            ) : (
              <Storyboard
                elements={elements}
                plan={plan}
                meta={meta}
                selected={selected}
                view={view}
                loop={plan.loop}
                onSelect={(ids) => useVideoGen.getState().select(ids)}
                onMove={(ids, beforeId) =>
                  useVideoGen.getState().setElements(moveMany(elements, ids, beforeId))
                }
                onInsertFiles={(paths, at) => void addPaths(paths, at)}
                onRemove={(ids) => useVideoGen.getState().remove(ids)}
                onNudge={onNudge}
              />
            )}

            {loading.length > 0 && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Analyse läuft ({loading.length} offen) …
              </p>
            )}
            {hints.length > 0 && (
              <ul className="space-y-1">
                {hints.map((h, i) => {
                  const st = LEVEL_STYLE[h.level]
                  return (
                    <li
                      key={`${h.id}-${i}`}
                      className={cn('flex items-start gap-2 text-xs', st.cls)}
                    >
                      <st.Icon className="mt-0.5 size-3.5 shrink-0" />
                      <button
                        type="button"
                        className="text-left hover:underline disabled:no-underline"
                        disabled={!h.elementId}
                        onClick={() => h.elementId && useVideoGen.getState().select([h.elementId])}
                      >
                        {h.text}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {plan.totalFrames > 0 && (
            <PreviewCard
              project={project}
              plan={plan}
              meta={meta}
              single={single ?? null}
              canRender={ready}
              onKenBurns={(id, kenBurns) =>
                useVideoGen.getState().updateElements([id], { kenBurns })
              }
              onRange={(id, inSec, outSec) =>
                useVideoGen.getState().updateElements([id], { inSec, outSec })
              }
            />
          )}

          {jobList.length > 0 && (
            <Card className="space-y-3 p-5">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm font-medium">Aufträge</p>
                {jobList.some((j) => ['done', 'error', 'canceled'].includes(j.status)) && (
                  <Button variant="ghost" size="sm" onClick={() => void clearFinished()}>
                    Fertige entfernen
                  </Button>
                )}
              </div>
              {jobList.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  onCheck={locked ? null : () => showInMediaInfo(job.outputPath)}
                  onToPlayer={() => void toPlayer(job)}
                />
              ))}
            </Card>
          )}
        </div>
      }
    />
  )
}
