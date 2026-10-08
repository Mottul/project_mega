// Einstellungen des Video-Generators (rechtes Panel): Ausgabe, Vorgaben, Ton & Musik und die
// Auswahl (ein oder mehrere Elemente zugleich; leer = Vorgabe).

import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Monitor,
  Music,
  SlidersHorizontal,
  Trash2,
  Wand2
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { DecimalField } from '@renderer/components/ui/decimal-field'
import { NumberField } from '@renderer/components/ui/number-field'
import { selectClass } from '@renderer/components/ui/select'
import { PanelSection } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import { useSettings } from '@renderer/lib/settings'
import { toast } from '@renderer/lib/toast'
import { DEFAULT_LOUDNESS, LOUDNESS_CHOICES } from '@shared/loudness'
import { AUDIO_EXTENSIONS } from '@shared/mediaExtensions'
import type {
  ConvertCapabilities,
  VgenElement,
  VgenFit,
  VgenKenBurns,
  VgenKenBurnsMode,
  VgenKenBurnsStrength,
  VgenProject,
  VgenTransition,
  VgenTransitionKind
} from '@shared/types'
import { VGEN_TRANSITIONS } from '@shared/videoGenPlan'
import {
  VGEN_FITS,
  VGEN_FPS,
  VGEN_KEN_BURNS_MODES,
  VGEN_KEN_BURNS_STRENGTHS
} from '@shared/videoGenProject'
import { FORMAT_OPTIONS, QUALITY_OPTIONS, SIZE_PRESETS, basename, sizePresetId } from './presets'
import { useVideoGen } from './store'

const label = 'block text-xs font-medium text-muted-foreground'
const fitLabel = (f: VgenFit): string => VGEN_FITS.find((x) => x.id === f)?.label ?? f
const kbLabel = (m: VgenKenBurnsMode): string =>
  VGEN_KEN_BURNS_MODES.find((x) => x.id === m)?.label ?? m
const trLabel = (k: VgenTransitionKind): string =>
  VGEN_TRANSITIONS.find((x) => x.kind === k)?.label ?? k
const sec = (n: number): string => `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })} s`

/** Gemeinsamer Wert mehrerer Elemente – oder undefined, wenn sie sich unterscheiden. */
function common<T>(els: VgenElement[], pick: (e: VgenElement) => T): T | undefined {
  if (!els.length) return undefined
  const first = JSON.stringify(pick(els[0]))
  return els.every((e) => JSON.stringify(pick(e)) === first) ? pick(els[0]) : undefined
}

/* --------------------------------- Ausgabe --------------------------------- */

export function OutputPanel({ caps }: { caps: ConvertCapabilities | null }): JSX.Element {
  const output = useVideoGen((s) => s.project.output)
  const setOutput = useVideoGen((s) => s.setOutput)
  const wallW = useSettings((s) => s.player.wallWidth)
  const wallH = useSettings((s) => s.player.wallHeight)
  const [note, setNote] = useState<string | null>(null)
  const preset = sizePresetId(output.width, output.height)
  const fpsValue = VGEN_FPS.findIndex((f) => Math.abs(f.value - output.fps) < 1e-6)
  const family = FORMAT_OPTIONS.find((f) => f.value === output.format)
  const longGop = output.format === 'h264' || output.format === 'hevc'

  async function fromLedWall(): Promise<void> {
    const [{ useLedWall }, { computeWall }] = await Promise.all([
      import('../led-wall/store'),
      import('../led-wall/compute')
    ])
    const wall = computeWall(useLedWall.getState())
    setOutput({ width: Math.floor(wall.resX / 2) * 2, height: Math.floor(wall.resY / 2) * 2 })
    setNote(`LED-Wand: ${wall.cols} × ${wall.rows} Module = ${wall.resX} × ${wall.resY} px.`)
  }

  return (
    <PanelSection id="output" title="Ausgabe" icon={Monitor}>
      <label className="block space-y-1">
        <span className={label}>Größe</span>
        <select
          className={`${selectClass} w-full`}
          value={preset}
          onChange={(e) => {
            const p = SIZE_PRESETS.find((x) => x.id === e.target.value)
            if (p) setOutput({ width: p.width, height: p.height })
          }}
        >
          {SIZE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Eigene Größe</option>
        </select>
      </label>
      <div className="flex items-center gap-2">
        <NumberField
          aria-label="Breite"
          value={output.width}
          min={16}
          max={8192}
          onCommit={(v) => setOutput({ width: Math.floor(v / 2) * 2 })}
        />
        <span className="text-muted-foreground">×</span>
        <NumberField
          aria-label="Höhe"
          value={output.height}
          min={16}
          max={8192}
          onCommit={(v) => setOutput({ height: Math.floor(v / 2) * 2 })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!wallW || !wallH}
          onClick={() => {
            if (wallW && wallH) {
              setOutput({ width: Math.floor(wallW / 2) * 2, height: Math.floor(wallH / 2) * 2 })
              setNote(`Wie die Player-Wand: ${wallW} × ${wallH} px.`)
            }
          }}
        >
          Wie Player-Wand
        </Button>
        <Button variant="outline" size="sm" onClick={() => void fromLedWall()}>
          Aus LED-Wall-Konfigurator
        </Button>
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className={label}>Bildrate</span>
          <select
            className={`${selectClass} w-full`}
            value={fpsValue}
            onChange={(e) => setOutput({ fps: VGEN_FPS[Number(e.target.value)].value })}
          >
            {VGEN_FPS.map((f, i) => (
              <option key={f.label} value={i}>
                {f.label} fps
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={label}>Format</span>
          <select
            className={`${selectClass} w-full`}
            value={output.format}
            onChange={(e) =>
              setOutput({ format: e.target.value as VgenProject['output']['format'] })
            }
          >
            {FORMAT_OPTIONS.map((f) => (
              <option
                key={f.value}
                value={f.value}
                disabled={caps ? !caps.formats[f.value] : false}
              >
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {longGop && (
        <label className="block space-y-1">
          <span className={label}>Qualität</span>
          <select
            className={`${selectClass} w-full`}
            value={output.quality}
            onChange={(e) =>
              setOutput({ quality: e.target.value as VgenProject['output']['quality'] })
            }
          >
            {QUALITY_OPTIONS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {caps && family && !caps.formats[output.format] && (
        <p className="text-xs text-destructive">
          {family.label} kann das gebündelte ffmpeg nicht schreiben – anderes Format wählen.
        </p>
      )}
      <Checkbox
        checked={output.loop}
        onChange={(loop) => setOutput({ loop })}
        label="Nahtlose Schleife"
        hint="Das Ende blendet in den Anfang – für Sponsor-Loops im Player."
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="color"
          value={output.background}
          onChange={(e) => setOutput({ background: e.target.value })}
          className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
          aria-label="Hintergrundfarbe"
        />
        Hintergrund für Ränder und Transparenz
      </label>
      <p className="text-xs text-muted-foreground">Die Zieldatei wählst du beim Erzeugen.</p>
      <Button
        variant="ghost"
        size="sm"
        title="Gerechnete Stücke löschen – der nächste Lauf rechnet alles neu"
        onClick={() =>
          void api
            .confirm({
              message: 'Zwischenspeicher leeren?',
              detail:
                'Gerechnete Stücke werden gelöscht; der nächste Lauf rechnet alles neu. Laufende Aufträge vorher abwarten.',
              confirmLabel: 'Leeren',
              danger: true
            })
            .then(async (ok) => {
              if (!ok) return
              await api.videoGen.clearCache()
              toast.success('Zwischenspeicher geleert.')
            })
        }
      >
        Zwischenspeicher leeren
      </Button>
    </PanelSection>
  )
}

/* --------------------------------- Vorgaben -------------------------------- */

function TransitionFields({
  value,
  onChange
}: {
  value: VgenTransition
  onChange: (t: VgenTransition) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Übergang"
        className={`${selectClass} min-w-0 flex-1`}
        value={value.kind}
        onChange={(e) => onChange({ ...value, kind: e.target.value as VgenTransitionKind })}
      >
        {VGEN_TRANSITIONS.map((t) => (
          <option key={t.kind} value={t.kind}>
            {t.label}
          </option>
        ))}
      </select>
      {value.kind !== 'cut' && (
        <DecimalField
          aria-label="Übergangsdauer"
          className="w-24"
          value={value.durationSec}
          min={0.04}
          max={10}
          suffix="s"
          onCommit={(v) => v !== null && onChange({ ...value, durationSec: v })}
        />
      )}
    </div>
  )
}

function KenBurnsFields({
  value,
  onChange
}: {
  value: VgenKenBurns
  onChange: (k: VgenKenBurns) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Ken Burns"
        className={`${selectClass} min-w-0 flex-1`}
        value={value.mode}
        onChange={(e) => onChange({ ...value, mode: e.target.value as VgenKenBurnsMode })}
      >
        {VGEN_KEN_BURNS_MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {value.mode !== 'off' && (
        <select
          aria-label="Stärke"
          className={`${selectClass} w-24`}
          value={value.strength}
          onChange={(e) => onChange({ ...value, strength: e.target.value as VgenKenBurnsStrength })}
        >
          {VGEN_KEN_BURNS_STRENGTHS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export function DefaultsPanel(): JSX.Element {
  const d = useVideoGen((s) => s.project.defaults)
  const setDefaults = useVideoGen((s) => s.setDefaults)
  return (
    <PanelSection id="defaults" title="Vorgaben" icon={SlidersHorizontal}>
      <p className="text-xs text-muted-foreground">
        Gelten für alle Elemente, die nichts Eigenes eingestellt haben.
      </p>
      <label className="block space-y-1">
        <span className={label}>Standzeit der Bilder</span>
        <DecimalField
          value={d.imageSec}
          min={0.1}
          max={3600}
          suffix="s"
          onCommit={(v) => v !== null && setDefaults({ imageSec: v })}
        />
      </label>
      <div className="space-y-1">
        <span className={label}>Übergang</span>
        <TransitionFields
          value={d.transition}
          onChange={(transition) => setDefaults({ transition })}
        />
      </div>
      <div className="space-y-1">
        <span className={label}>Ken Burns (Bilder)</span>
        <KenBurnsFields value={d.kenBurns} onChange={(kenBurns) => setDefaults({ kenBurns })} />
      </div>
      <label className="block space-y-1">
        <span className={label}>Einpassen</span>
        <select
          className={`${selectClass} w-full`}
          value={d.fit}
          onChange={(e) => setDefaults({ fit: e.target.value as VgenFit })}
        >
          {VGEN_FITS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
    </PanelSection>
  )
}

/* ------------------------------- Ton & Musik ------------------------------- */

export function AudioPanel(): JSX.Element {
  const music = useVideoGen((s) => s.project.music)
  const loudnorm = useVideoGen((s) => s.project.loudnorm)
  const loop = useVideoGen((s) => s.project.output.loop)
  const setProject = useVideoGen((s) => s.setProject)

  async function chooseMusic(): Promise<void> {
    const paths = await api.selectPaths({
      title: 'Musik auswählen',
      filters: [
        { name: 'Ton', extensions: AUDIO_EXTENSIONS },
        { name: 'Alle Dateien', extensions: ['*'] }
      ]
    })
    if (paths.length) {
      setProject({
        music: {
          path: paths[0],
          gainDb: music?.gainDb ?? -6,
          fadeInSec: music?.fadeInSec ?? 2,
          fadeOutSec: music?.fadeOutSec ?? 3
        }
      })
    }
  }

  return (
    <PanelSection id="audio" title="Ton & Musik" icon={Music}>
      <p className="text-xs text-muted-foreground">
        Originalton je Video in der Auswahl; in Übergängen wird er weich verblendet.
      </p>
      <div className="space-y-1">
        <span className={label}>Musik</span>
        {music ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm" title={music.path}>
                {basename(music.path)}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void chooseMusic()}>
                Ändern
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Musik entfernen"
                title="Musik entfernen"
                onClick={() => setProject({ music: null })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className={label}>Pegel</span>
                <DecimalField
                  value={music.gainDb}
                  min={-40}
                  max={12}
                  decimals={1}
                  suffix="dB"
                  onCommit={(v) => v !== null && setProject({ music: { ...music, gainDb: v } })}
                />
              </label>
              <label className="space-y-1">
                <span className={label}>Einblenden</span>
                <DecimalField
                  value={music.fadeInSec}
                  min={0}
                  max={30}
                  decimals={1}
                  suffix="s"
                  onCommit={(v) => v !== null && setProject({ music: { ...music, fadeInSec: v } })}
                />
              </label>
              <label className="space-y-1">
                <span className={label}>Ausblenden</span>
                <DecimalField
                  value={music.fadeOutSec}
                  min={0}
                  max={30}
                  decimals={1}
                  suffix="s"
                  onCommit={(v) => v !== null && setProject({ music: { ...music, fadeOutSec: v } })}
                />
              </label>
            </div>
            {loop && (
              <p className="text-xs text-muted-foreground">
                Mit Schleife blendet das Musikende in den Anfang (statt Ein-/Ausblenden).
              </p>
            )}
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => void chooseMusic()}>
            <Music className="size-4" /> Musik wählen …
          </Button>
        )}
      </div>
      <label className="block space-y-1">
        <span className={label}>Lautheit (EBU R128, am fertigen Mix)</span>
        <select
          className={`${selectClass} w-full`}
          value={loudnorm ? String(loudnorm.i) : ''}
          onChange={(e) =>
            setProject({
              loudnorm: e.target.value ? { ...DEFAULT_LOUDNESS, i: Number(e.target.value) } : null
            })
          }
        >
          <option value="">Unverändert</option>
          {LOUDNESS_CHOICES.map((c) => (
            <option key={c.i} value={String(c.i)}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
    </PanelSection>
  )
}

/* --------------------------------- Auswahl --------------------------------- */

export function SelectionPanel({
  infoText,
  onNudge
}: {
  infoText: string | null
  onNudge: (dir: -1 | 1) => void
}): JSX.Element {
  const elements = useVideoGen((s) => s.project.elements)
  const selectedIds = useVideoGen((s) => s.selected)
  const defaults = useVideoGen((s) => s.project.defaults)
  const loop = useVideoGen((s) => s.project.output.loop)
  const update = useVideoGen((s) => s.updateElements)
  const remove = useVideoGen((s) => s.remove)
  const sel = elements.filter((e) => selectedIds.includes(e.id))
  const ids = sel.map((e) => e.id)
  const images = sel.filter((e) => e.kind === 'image')
  const videos = sel.filter((e) => e.kind === 'video')
  const timed = sel.filter((e) => e.kind !== 'video')
  const lastSelected = sel.some((e) => e.id === elements[elements.length - 1]?.id)

  if (!sel.length) {
    return (
      <PanelSection id="selection" title="Auswahl" icon={Wand2}>
        <p className="text-sm text-muted-foreground">
          Ein Element im Storyboard anklicken (Strg/Umschalt für mehrere), um Standzeit, Ausschnitt,
          Ken Burns, Einpassen und den Übergang danach einzustellen.
        </p>
      </PanelSection>
    )
  }

  const fit = common(sel, (e) => e.fit)
  const tr = common(sel, (e) => e.transition)
  const kb = common(images, (e) => e.kenBurns)
  const dur = common(timed, (e) => e.durationSec)
  const audio = common(videos, (e) => e.audio)

  return (
    <PanelSection
      id="selection"
      title={sel.length === 1 ? 'Auswahl' : `Auswahl (${sel.length})`}
      icon={Wand2}
    >
      <div className="space-y-0.5">
        <p
          className="truncate text-sm font-medium"
          title={sel.length === 1 ? sel[0].path : undefined}
        >
          {sel.length === 1 ? basename(sel[0].path) : `${sel.length} Elemente`}
        </p>
        {infoText && <p className="text-xs text-muted-foreground">{infoText}</p>}
      </div>

      {timed.length > 0 && (
        <label className="block space-y-1">
          <span className={label}>
            Standzeit{timed.length < sel.length ? ' (Bilder/GIFs)' : ''}
          </span>
          <DecimalField
            value={dur === undefined ? null : dur}
            allowEmpty
            min={0.1}
            max={3600}
            suffix="s"
            placeholder={dur === undefined ? 'gemischt' : `Vorgabe ${sec(defaults.imageSec)}`}
            onCommit={(v) =>
              update(
                timed.map((e) => e.id),
                { durationSec: v }
              )
            }
          />
        </label>
      )}

      {videos.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className={label}>Start</span>
              <DecimalField
                value={videos.length === 1 ? videos[0].inSec : null}
                allowEmpty
                min={0}
                max={86400}
                suffix="s"
                placeholder="Anfang"
                onCommit={(v) =>
                  update(
                    videos.map((e) => e.id),
                    { inSec: v }
                  )
                }
              />
            </label>
            <label className="space-y-1">
              <span className={label}>Ende</span>
              <DecimalField
                value={videos.length === 1 ? videos[0].outSec : null}
                allowEmpty
                min={0}
                max={86400}
                suffix="s"
                placeholder="bis Ende"
                onCommit={(v) =>
                  update(
                    videos.map((e) => e.id),
                    { outSec: v }
                  )
                }
              />
            </label>
          </div>
          <Checkbox
            checked={audio ?? true}
            onChange={(v) =>
              update(
                videos.map((e) => e.id),
                { audio: v }
              )
            }
            label="Originalton"
          />
        </div>
      )}

      <label className="block space-y-1">
        <span className={label}>Einpassen</span>
        <select
          className={`${selectClass} w-full`}
          value={fit === undefined ? 'mixed' : (fit ?? '')}
          onChange={(e) =>
            update(ids, { fit: e.target.value ? (e.target.value as VgenFit) : null })
          }
        >
          {fit === undefined && <option value="mixed">gemischt</option>}
          <option value="">Vorgabe ({fitLabel(defaults.fit)})</option>
          {VGEN_FITS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      {images.length > 0 && (
        <div className="space-y-1">
          <span className={label}>Ken Burns</span>
          <select
            className={`${selectClass} w-full`}
            value={kb === undefined ? 'mixed' : kb ? 'own' : ''}
            onChange={(e) =>
              update(
                images.map((x) => x.id),
                {
                  kenBurns: e.target.value === 'own' ? { ...defaults.kenBurns } : null
                }
              )
            }
          >
            {kb === undefined && <option value="mixed">gemischt</option>}
            <option value="">Vorgabe ({kbLabel(defaults.kenBurns.mode)})</option>
            <option value="own">Eigene Einstellung</option>
          </select>
          {kb && (
            <KenBurnsFields
              value={kb}
              onChange={(k) =>
                update(
                  images.map((x) => x.id),
                  { kenBurns: k }
                )
              }
            />
          )}
        </div>
      )}

      <div className="space-y-1">
        <span className={label}>Übergang danach</span>
        <select
          className={`${selectClass} w-full`}
          value={tr === undefined ? 'mixed' : tr ? 'own' : ''}
          onChange={(e) =>
            update(ids, {
              transition: e.target.value === 'own' ? { ...defaults.transition } : null
            })
          }
        >
          {tr === undefined && <option value="mixed">gemischt</option>}
          <option value="">
            Vorgabe ({trLabel(defaults.transition.kind)}
            {defaults.transition.kind !== 'cut' ? ` ${sec(defaults.transition.durationSec)}` : ''})
          </option>
          <option value="own">Eigener Übergang</option>
        </select>
        {tr && <TransitionFields value={tr} onChange={(t) => update(ids, { transition: t })} />}
        {lastSelected && !loop && (
          <p className="text-xs text-muted-foreground">
            Nach dem letzten Element gibt es nur mit nahtloser Schleife einen Übergang.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Nach vorn"
          title="Nach vorn (Alt+←)"
          onClick={() => onNudge(-1)}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Nach hinten"
          title="Nach hinten (Alt+→)"
          onClick={() => onNudge(1)}
        >
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => remove(ids)}>
          <Trash2 className="size-4" /> Entfernen
        </Button>
      </div>
    </PanelSection>
  )
}
