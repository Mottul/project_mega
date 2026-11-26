// Video-Generator (Diashow & Montage): Bilder und Videos zu EINEM Video – Reihenfolge,
// Standzeiten, Übergänge, Ken Burns, Zielgröße, Musik, nahtlose Schleife. Der Plan
// (shared/videoGenPlan) läuft hier für Gesamtdauer, Lineal und Hinweise genauso wie im main,
// wo gerechnet wird (Stücke mit Zwischenspeicher, gemeinsame Warteschlange mit dem Konverter).
//
// Die Felder Storyboard, Vorschau und Aufträge stehen in einer Arbeitsfläche
// (components/WorkArea.tsx, Raster in layout.ts): Wer im Storyboard ordnet, sieht die Vorschau –
// das Storyboard scrollt in sich, die Seite nicht. Hier stehen Zustand und Befehle, die Felder
// liegen daneben (StoryboardFeld, PreviewPane, JobList).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Play, XCircle } from 'lucide-react'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { WorkArea } from '@renderer/components/WorkArea'
import { FORMAT_OPTIONS } from './presets'
import { useKiosk } from '@renderer/launcher/kiosk'
import { api } from '@renderer/lib/api'
import { useHandoff } from '@renderer/lib/handoff'
import { toast } from '@renderer/lib/toast'
import { usePersistentState, type Codec } from '@renderer/lib/usePersistentState'
import { inDenPlayer } from '@renderer/lib/inDenPlayer'
import { rateText } from '@shared/convertPlan'
import type { ConvertCapabilities, VgenJob } from '@shared/types'
import { planVideoGen, type VgenCaps } from '@shared/videoGenPlan'
import { AudioPanel, DefaultsPanel, OutputPanel, SelectionPanel } from './Inspector'
import { AuftraegeFeld } from './JobList'
import { vgenRaster } from './layout'
import { useVgenMeta } from './meta'
import { moveMany, nudge, shuffle, sortItems, type SortKey } from './order'
import { MEDIA_FILTER_EXTENSIONS, fmtDuration, kindForPath } from './presets'
import { PreviewPane } from './PreviewPane'
import { StoryboardFeld } from './StoryboardFeld'
import { useVideoGen } from './store'

const viewCodec: Codec<'tiles' | 'list'> = {
  parse: (raw) => (raw === 'tiles' || raw === 'list' ? raw : null),
  format: (v) => v
}

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
  // Leeres Projekt: Die Ablagefläche sagt schon, was zu tun ist – kein roter Hinweis darunter.
  // Für die Sperre von „Video erzeugen“ zählt er weiter (errors).
  const shownHints = hints.filter((h) => h.id !== 'empty')
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

  function mischen(): void {
    useVideoGen.getState().setElements(shuffle(elements, Math.floor(Math.random() * 2 ** 31)))
  }

  async function alleEntfernen(): Promise<void> {
    const ok = await api.confirm({
      message: `Alle ${elements.length} Elemente entfernen?`,
      detail: 'Die Dateien selbst bleiben unverändert.',
      confirmLabel: 'Entfernen',
      danger: true
    })
    if (ok) useVideoGen.getState().clearElements()
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
    await inDenPlayer(job.outputPath)
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
  const runningJobs = jobList.filter(
    (j) => j.status === 'queued' || j.status === 'probing' || j.status === 'running'
  )

  return (
    <ToolShell
      id="video-generator"
      bar={
        <ToolBar
          label="Auftrag"
          kind="job"
          active={runningJobs.length > 0}
          status={
            runningJobs.length > 0 ? (
              <>
                <span className="max-w-[16rem] truncate font-medium">{runningJobs[0].title}</span>
                <span className="text-muted-foreground">
                  {Math.round(runningJobs[0].progress * 100)} %
                  {runningJobs.length > 1 ? ` · ${runningJobs.length - 1} weitere` : ''}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Ziel {project.output.width} × {project.output.height} ·{' '}
                {rateText(project.output.fps)} fps ·{' '}
                {FORMAT_OPTIONS.find((f) => f.value === project.output.format)?.label ??
                  project.output.format}
              </span>
            )
          }
        >
          <Button size="sm" onClick={() => void start()} disabled={!canStart}>
            {busy === 'starting' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Video erzeugen
          </Button>
        </ToolBar>
      }
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
        <div className="flex h-full min-h-0 flex-col">
          {ffmpegMissing && (
            <div className="shrink-0 px-3 pt-3">
              <Alert tone="danger" icon={XCircle} title="ffmpeg wurde nicht gefunden">
                Ohne ffmpeg lässt sich kein Video erzeugen.
                {caps?.error ? ` (${caps.error})` : ''}
              </Alert>
            </div>
          )}
          <div className="min-h-0 flex-1">
            {/* Reihenfolge der Felder immer gleich – wo sie stehen, sagt das Raster. „Aufträge“
            als letztes: Kommt das Feld dazu, bleiben Storyboard und Vorschau, wie sie sind. */}
            <WorkArea raster={vgenRaster(jobList.length > 0)}>
              <StoryboardFeld
                elements={elements}
                plan={plan}
                meta={meta}
                selected={selected}
                view={view}
                onView={setView}
                output={project.output}
                loading={loading.length}
                hinweise={shownHints}
                adding={busy === 'adding'}
                busy={busy !== null}
                onAddFiles={() => void addFiles()}
                onAddFolder={() => void addFolder()}
                onAddPaths={(paths, at) => void addPaths(paths, at)}
                onSort={sortBy}
                onShuffle={mischen}
                onClear={() => void alleEntfernen()}
                onSelect={(ids) => useVideoGen.getState().select(ids)}
                onMove={(ids, beforeId) =>
                  useVideoGen.getState().setElements(moveMany(elements, ids, beforeId))
                }
                onRemove={(ids) => useVideoGen.getState().remove(ids)}
                onNudge={onNudge}
              />
              <PreviewPane
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
              {jobList.length > 0 && (
                <AuftraegeFeld
                  jobs={jobList}
                  onCheck={locked ? null : (job) => showInMediaInfo(job.outputPath)}
                  onToPlayer={(job) => void toPlayer(job)}
                  onClearFinished={() => void clearFinished()}
                />
              )}
            </WorkArea>
          </div>
        </div>
      }
    />
  )
}
