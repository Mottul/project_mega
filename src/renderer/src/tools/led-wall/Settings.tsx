// Schublade des LED-Wall-Konfigurators: alles, was die Wand festlegt (Vorlagen, Projekt, Modul,
// Größe und Aufbau, Curving-Form). Die Arbeitsfläche zeigt, was daraus folgt.

import { Bookmark, Box, Briefcase, Cpu, Plus, Ruler, Save, Spline, Trash2, X } from 'lucide-react'
import { PanelSection } from '@renderer/components/ToolShell'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { Segmented } from '@renderer/components/ui/segmented'
import { Select } from '@renderer/components/ui/select'
import { LiveInput } from '@renderer/components/ui/textarea'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { fmt } from '../_calc/ui'
import type { WallMetrics } from './compute'
import { digest } from '@shared/projectFile'
import { toast } from '@renderer/lib/toast'
import { GRID_SIDE_MAX, isDefaultPlanning, pickConfig, WALL_NAME_MAX, wallSection } from './config'
import { CURVE_MODE_LABELS } from './curve'
import { CIRCLE_TABLE, MODULES } from './data'
import type { BuilderSegment } from './math'
import { DEFAULT_PROCESSOR, PROCESSOR_LABELS, PROCESSORS, resolveProcessor } from './processors'
import {
  plannedWalls,
  useLedWall,
  type BuildMode,
  type CurveMode,
  type LedWallPreset
} from './store'
import { NumCommit, UnitInput } from './ui'

export const BUILD_LABELS: Record<BuildMode, string> = {
  stacked: 'Ground-Stack',
  flying: 'Fliegend'
}

/** Kurzform der Curving-Formen für den Umschalter (die langen stehen im Titel) */
const MODE_SHORT: Record<CurveMode, string> = {
  circle: 'Kreis',
  segment: 'Segment',
  builder: 'Builder',
  squircle: 'Squircle'
}

/** Zahl mit Komma, ohne überflüssige Nullen (2.06 -> „2,06“) */
const num = (n: number, digits = 3): string => fmt(n, digits)

export function LedWallSettings({ d }: { d: WallMetrics }): JSX.Element {
  const moduleKey = useLedWall((s) => s.moduleKey)
  return (
    <>
      <PresetsPanel />
      <ProjectPanel />
      <ModulePanel />
      <WallPanel d={d} />
      {MODULES[moduleKey]?.canCurve && <CurvingPanel d={d} />}
      <ProcessorPanel />
    </>
  )
}

function PresetsPanel(): JSX.Element {
  const presets = useLedWall((s) => s.presets)
  const projectName = useLedWall((s) => s.projectName)
  const wallName = useLedWall((s) => s.walls.find((w) => w.id === s.wallId)?.name ?? '')
  const several = useLedWall((s) => s.walls.length > 1)
  const savePreset = useLedWall((s) => s.savePreset)
  const loadPreset = useLedWall((s) => s.loadPreset)
  const deletePreset = useLedWall((s) => s.deletePreset)

  async function remove(p: LedWallPreset): Promise<void> {
    const ok = await api.confirm({
      message: `Vorlage „${p.name}“ löschen?`,
      confirmLabel: 'Löschen',
      danger: true
    })
    if (ok) deletePreset(p.id)
  }

  // Vorlage laden = die gewählte Wand ersetzen (andere Wände, Projekt und Datei-Bindung bleiben).
  // Gefragt wird nur, wenn in der Wand schon etwas steht.
  async function load(p: LedWallPreset): Promise<void> {
    const st = useLedWall.getState()
    const before = digest(wallSection(pickConfig(st)))
    const wall = st.walls.find((w) => w.id === st.wallId)
    if (!isDefaultPlanning({ ...pickConfig(st), projectName: '', customerName: '' })) {
      const ok = await api.confirm({
        message: `Vorlage „${p.name}“ in ${st.walls.length > 1 ? `„${wall?.name}“` : 'die Wand'} laden?`,
        detail: `Die Vorlage ersetzt Maße, Modul und Verkabelung dieser Wand${st.file ? ` – „${st.file.name}“ ist danach ungespeichert` : ''}.`,
        confirmLabel: 'Laden'
      })
      if (!ok) return
      // Rückfragen sperren nur dieses Fenster: Hat ein anderes die Wand inzwischen gewechselt
      // oder geändert, gilt die Zustimmung nicht (review-checkliste, „Zustand nach await“)
      const now = useLedWall.getState()
      if (now.wallId !== st.wallId || digest(wallSection(pickConfig(now))) !== before) {
        toast.warning('Die Wand hat sich inzwischen geändert – bitte noch einmal.')
        return
      }
    }
    loadPreset(p.id)
  }

  return (
    <PanelSection
      id="presets"
      title="Vorlagen"
      icon={Bookmark}
      defaultOpen={false}
      summary={presets.length === 0 ? 'keine gespeichert' : `${presets.length} gespeichert`}
    >
      {presets.length > 0 && (
        <ul className="space-y-1">
          {presets.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-1 rounded-md border border-border bg-card/60"
            >
              <button
                type="button"
                onClick={() => void load(p)}
                title="Vorlage laden – ersetzt die gewählte Wand"
                className="min-w-0 flex-1 px-2.5 py-1.5 text-left hover:text-primary"
              >
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {new Date(p.savedAt).toLocaleString('de-AT', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void remove(p)}
                aria-label={`Vorlage „${p.name}“ löschen`}
                className="mr-1 rounded p-1.5 text-muted-foreground hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() =>
          savePreset(
            [projectName.trim(), several ? wallName : ''].filter(Boolean).join(' – ') ||
              `Vorlage ${presets.length + 1}`
          )
        }
        title="Gespeichert wird unter dem Projektnamen (bei mehreren Wänden mit dem Namen der Wand) – gleicher Name überschreibt die Vorlage"
      >
        <Save className="size-4" />{' '}
        {several ? 'Diese Wand speichern' : 'Aktuelle Planung speichern'}
      </Button>
    </PanelSection>
  )
}

function ProjectPanel(): JSX.Element {
  const projectName = useLedWall((s) => s.projectName)
  const customerName = useLedWall((s) => s.customerName)
  const set = useLedWall((s) => s.set)
  const summary = [projectName.trim(), customerName.trim()].filter(Boolean).join(' · ')
  return (
    <PanelSection
      id="project"
      title="Projekt"
      icon={Briefcase}
      defaultOpen={false}
      summary={summary || 'ohne Namen'}
    >
      <Field label="Projektname" hint="Steht auf der PDF-Doku und ist der Name einer Vorlage.">
        <Input
          value={projectName}
          placeholder="z. B. Messe Frankfurt 2026"
          onChange={(e) => set({ projectName: e.target.value })}
        />
      </Field>
      <Field label="Kunde">
        <Input
          value={customerName}
          placeholder="z. B. Firma XY"
          onChange={(e) => set({ customerName: e.target.value })}
        />
      </Field>
    </PanelSection>
  )
}

function ModulePanel(): JSX.Element {
  const moduleKey = useLedWall((s) => s.moduleKey)
  const set = useLedWall((s) => s.set)
  const m = MODULES[moduleKey]
  return (
    <PanelSection
      id="module"
      title="Modul"
      icon={Box}
      summary={m ? `${m.name} · PP ${num(m.pitch)} mm · ${m.tag}` : undefined}
    >
      <div role="radiogroup" aria-label="Modultyp" className="space-y-1.5">
        {Object.entries(MODULES).map(([key, mod]) => {
          const on = key === moduleKey
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set({ moduleKey: key })}
              className={cn(
                'w-full rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                on
                  ? 'border-primary/60 bg-primary/[0.08]'
                  : 'border-border hover:border-primary/40 hover:bg-muted/40'
              )}
            >
              <span className="flex items-baseline gap-2">
                <span className={cn('font-semibold', on && 'text-primary')}>{mod.name}</span>
                <span className="text-xs text-muted-foreground">PP {num(mod.pitch)} mm</span>
                {mod.canCurve && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Curving
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {mod.tag} · {mod.resX} × {mod.resY} px · {mod.dimW} × {mod.dimH} mm
              </span>
            </button>
          )
        })}
      </div>
    </PanelSection>
  )
}

function WallPanel({ d }: { d: WallMetrics }): JSX.Element {
  const widthM = useLedWall((s) => s.widthM)
  const heightM = useLedWall((s) => s.heightM)
  const buildMode = useLedWall((s) => s.buildMode)
  const set = useLedWall((s) => s.set)
  const wallId = useLedWall((s) => s.wallId)
  const wallName = useLedWall((s) => s.walls.find((w) => w.id === s.wallId)?.name ?? '')
  const several = useLedWall((s) => s.walls.length > 1)
  const curve = d.curve
  // Breite frei nur, wo sie das Curving treibt (Segment/Squircle) bzw. bei flachen Modulen;
  // bei Vollkreis und Builder ergibt sie sich aus den Modulen
  const widthEditable = !curve || curve.drivesWidth != null
  const widthLabel = curve?.mode === 'segment' ? 'Breite (Sehne)' : 'Breite'
  const widthHint =
    curve?.mode === 'segment'
      ? 'Beim Kreissegment ist die Wandbreite die Sehne: Gesucht wird der größte Bogen, der in Breite × Stichhöhe passt.'
      : curve?.mode === 'squircle'
        ? 'Außenbreite des Squircles (Rechteck mit runden Ecken).'
        : 'Gewünschte Breite – gerundet auf ganze Module.'

  return (
    <PanelSection
      id="wall"
      title="Wand"
      icon={Ruler}
      summary={`${several ? `${wallName} · ` : ''}${num(parseFloat(d.actualW), 2)} × ${num(parseFloat(d.actualH), 2)} m · ${d.cols} × ${d.rows} Module · ${BUILD_LABELS[buildMode]}`}
    >
      <Field
        label="Name der Wand"
        hint="Unterscheidet die Wände einer Planung („Hauptbühne“, „Seitenwand links“) – im Wand-Menü der Leiste, im PDF, in der Packliste und im Mini-Manual."
      >
        <LiveInput
          key={wallId}
          value={wallName}
          maxLength={WALL_NAME_MAX}
          onCommit={(v) => useLedWall.getState().renameWall(wallId, v)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {widthEditable ? (
          <Field label={widthLabel} hint={widthHint}>
            <UnitInput value={widthM} unit="m" onChange={(v) => set({ widthM: v })} />
          </Field>
        ) : (
          <Field
            label="Breite"
            hint={`Ergibt sich aus dem Curving (${curve ? CURVE_MODE_LABELS[curve.mode] : ''}): belegte Breite der Draufsicht.`}
          >
            <output className="flex h-9 items-center rounded-md border border-primary/30 bg-primary/[0.07] px-3 text-sm font-semibold text-primary">
              {num(parseFloat(d.actualW), 2)} m
            </output>
          </Field>
        )}
        <Field label="Höhe" hint="Gewünschte Höhe – gerundet auf ganze Modulreihen.">
          <UnitInput value={heightM} unit="m" onChange={(v) => set({ heightM: v })} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Tatsächlich{' '}
        <span className="font-medium text-foreground">
          {num(parseFloat(d.actualW), 2)} × {num(parseFloat(d.actualH), 2)} m
        </span>{' '}
        · {d.cols} × {d.rows} = {d.total} Module
      </p>
      <Field
        label="Aufbau"
        hint="Ground-Stack: auf LSU-Füßen am Boden, mit Ballast (1 Fuß je laufendem Meter Bildbreite). Fliegend: an der Traverse."
      >
        <Segmented
          label="Aufbau"
          value={buildMode}
          options={(Object.keys(BUILD_LABELS) as BuildMode[]).map((v) => ({
            value: v,
            label: BUILD_LABELS[v]
          }))}
          onChange={(v) => set({ buildMode: v })}
        />
      </Field>
    </PanelSection>
  )
}

const HZ = [24, 25, 30, 48, 50, 60, 72, 100, 120, 144, 240]

/**
 * Prozessor der Wand: Vorbelegung je Modul oder eigene Wahl, Farbtiefe, Bildrate, Backup-Vorgabe
 * für neue Ketten; bei mehreren Wänden desselben Moduls „teilen mit“ (Ports zählen gemeinsam).
 */
function ProcessorPanel(): JSX.Element {
  const s = useLedWall()
  const p = s.processor
  const others = plannedWalls(s).filter((w) => w.id !== s.wallId)
  const shareable = others.filter((w) => w.config.moduleKey === s.moduleKey)
  const shared = p.shareWith ? others.find((w) => w.id === p.shareWith) : undefined
  const resolved = resolveProcessor(shared ? shared.config : pickConfig(s))
  const def = Object.hasOwn(DEFAULT_PROCESSOR, s.moduleKey)
    ? PROCESSORS[DEFAULT_PROCESSOR[s.moduleKey]].name
    : PROCESSORS['novapro-uhd-jr'].name
  const setP = (patch: Partial<typeof p>): void => {
    const next = { ...p, ...patch }
    for (const k of Object.keys(next) as (keyof typeof next)[])
      if (next[k] === undefined) delete next[k]
    s.set({ processor: next })
  }
  const bits = resolved.model === 'frei' ? [8, 10, 12] : PROCESSORS[resolved.model].bitDepths
  return (
    <PanelSection
      id="processor"
      title="Prozessor"
      icon={Cpu}
      defaultOpen={false}
      summary={`${shared ? `wie ${shared.name} · ` : ''}${resolved.name} · ${resolved.bitDepth} bit · ${resolved.hz} Hz`}
    >
      {shareable.length > 0 && (
        <Field
          label="Prozessor teilen mit"
          hint="Zwei Wände mit demselben Modul an einem Prozessor (verschiedene Ports). Die Ports zählen dann fortlaufend, Port- und Gesamtkapazität gemeinsam."
        >
          <Select
            aria-label="Prozessor teilen mit"
            value={shared?.id ?? ''}
            onChange={(e) => setP({ shareWith: e.target.value || undefined })}
          >
            <option value="">eigener Prozessor</option>
            {shareable.map((w) => (
              <option key={w.id} value={w.id}>
                wie {w.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {shared ? (
        <p className="text-xs text-muted-foreground">
          Nutzt den Prozessor von „{shared.name}“ ({resolved.name}) – Farbtiefe und Bildrate stellst
          du dort ein.
        </p>
      ) : (
        <>
          <Field
            label="Prozessor"
            hint="Ab Werk der Prozessor des Bestands für das Modul. Grenzen aus den Handbüchern; „eigener“ für alles andere – dann Werte selbst eintragen."
          >
            <Select
              aria-label="Prozessor"
              value={p.model ?? ''}
              onChange={(e) => setP({ model: (e.target.value || null) as typeof p.model })}
            >
              <option value="">
                Vorgabe für {s.moduleKey}: {def}
              </option>
              {(Object.keys(PROCESSOR_LABELS) as (keyof typeof PROCESSOR_LABELS)[]).map((m) => (
                <option key={m} value={m}>
                  {PROCESSOR_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Farbtiefe">
              <Segmented
                label="Farbtiefe"
                value={String(resolved.bitDepth)}
                options={bits.map((b) => ({ value: String(b), label: `${b} bit` }))}
                onChange={(v) => setP({ bitDepth: Number(v) as 8 | 10 | 12 })}
              />
            </Field>
            <Field label="Bildrate">
              <Select
                aria-label="Bildrate"
                value={String(resolved.hz)}
                onChange={(e) => setP({ hz: Number(e.target.value) })}
              >
                {(HZ.includes(resolved.hz) ? HZ : [...HZ, resolved.hz].sort((a, b) => a - b)).map(
                  (h) => (
                    <option key={h} value={h}>
                      {h} Hz
                    </option>
                  )
                )}
              </Select>
            </Field>
          </div>
          {resolved.model === 'frei' && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Ports">
                <NumCommit
                  aria-label="Ports"
                  integer
                  min={1}
                  max={64}
                  value={p.ports ?? 0}
                  onCommit={(v) => setP({ ports: v || undefined })}
                />
              </Field>
              <Field label="px je Port">
                <NumCommit
                  aria-label="Pixel je Port"
                  integer
                  min={0}
                  max={100_000_000}
                  value={p.portPx ?? 0}
                  onCommit={(v) => setP({ portPx: v || undefined })}
                />
              </Field>
              <Field label="px gesamt">
                <NumCommit
                  aria-label="Pixel gesamt"
                  integer
                  min={0}
                  max={1_000_000_000}
                  value={p.totalPx ?? 0}
                  onCommit={(v) => setP({ totalPx: v || undefined })}
                />
              </Field>
            </div>
          )}
        </>
      )}
      <Checkbox
        label="Backup-Leitung für neue Ketten"
        hint="Vorgabe für Signalketten ohne eigene Angabe: vom letzten Modul zurück an einen Backup-Port (im Plan ein „B“). Je Kette umschaltbar in der Verlauf-Leiste des Signalplans."
        checked={s.redundancy}
        onChange={(redundancy) => s.set({ redundancy })}
      />
      <p className="text-xs text-muted-foreground">
        {resolved.portPx > 0
          ? `Grenze je Port ${resolved.portPx.toLocaleString('de-DE')} px${resolved.limitBy === 'karte' ? ` (Empfangskarte ${resolved.card})` : ''}`
          : 'Grenze je Port nicht angegeben'}
        {resolved.ports > 0 && ` · ${resolved.ports} Ports`}
      </p>
    </PanelSection>
  )
}

function CurvingPanel({ d }: { d: WallMetrics }): JSX.Element {
  const curveMode = useLedWall((s) => s.curveMode)
  const set = useLedWall((s) => s.set)
  const curve = d.curve
  return (
    <PanelSection
      id="curving"
      title="Curving"
      icon={Spline}
      summary={
        curve
          ? `${CURVE_MODE_LABELS[curve.mode]} · ${curve.mods} Module je Reihe`
          : CURVE_MODE_LABELS[curveMode]
      }
    >
      <Field
        label="Form"
        hint="uS2+: 0° bis 45° je Modul in 2,5°-Schritten. Vollkreis: gleicher Winkel je Modul. Kreissegment: größter Bogen in Breite × Stichhöhe. Builder: freie Folge gerader und gebogener Abschnitte. Squircle: Rechteck mit runden 90°-Ecken."
      >
        <Segmented
          label="Curving-Form"
          value={curveMode}
          options={(Object.keys(MODE_SHORT) as CurveMode[]).map((v) => ({
            value: v,
            label: MODE_SHORT[v]
          }))}
          onChange={(v) => set({ curveMode: v })}
        />
      </Field>
      {curveMode === 'circle' && <CircleInputs />}
      {curveMode === 'segment' && <SegmentInputs d={d} />}
      {curveMode === 'builder' && <BuilderInputs />}
      {curveMode === 'squircle' && <SquircleInputs d={d} />}
    </PanelSection>
  )
}

function CircleInputs(): JSX.Element {
  const selected = useLedWall((s) => s.selectedCircle)
  const set = useLedWall((s) => s.set)
  const sel = Math.max(0, Math.min(selected, CIRCLE_TABLE.length - 1))
  return (
    <Field label="Kreis" hint="Vollkreise mit gleichem Winkel je Modul (0,5 m Modulbreite).">
      <div role="radiogroup" aria-label="Vollkreis" className="space-y-0.5">
        {CIRCLE_TABLE.map((c, i) => {
          const on = i === sel
          return (
            <button
              key={c.angle}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set({ selectedCircle: i })}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm tabular-nums transition-colors',
                on ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
              )}
            >
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  on ? 'bg-primary' : 'ring-1 ring-border'
                )}
              />
              <span className="w-11">{num(c.angle, 1)}°</span>
              <span className="flex-1 text-muted-foreground">{c.mods} Module</span>
              <span className={cn('font-medium', !on && 'text-foreground')}>R {num(c.r, 3)} m</span>
            </button>
          )
        })}
      </div>
    </Field>
  )
}

function SegmentInputs({ d }: { d: WallMetrics }): JSX.Element {
  const segSag = useLedWall((s) => s.segSag)
  const set = useLedWall((s) => s.set)
  const arc = d.curve?.arc ?? null
  return (
    <>
      <Field
        label="Stichhöhe (max. Tiefe)"
        hint="Wie tief der Bogen höchstens werden darf – gemessen von der Sehne (Wandbreite) zur Bogenmitte."
      >
        <UnitInput value={segSag} unit="m" onChange={(v) => set({ segSag: v })} />
      </Field>
      {!arc && <Alert tone="warning">Keine passende Konfiguration für Breite und Stichhöhe.</Alert>}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={!arc}
        title="Diese Winkel als bearbeitbare Abschnitte in den Segment-Builder übernehmen"
        onClick={() =>
          arc &&
          set({
            curveMode: 'builder',
            builderSegs: [{ type: 'curved', count: arc.mods, angle: arc.totalDeg, dir: 'convex' }]
          })
        }
      >
        Im Builder weiterbearbeiten
      </Button>
    </>
  )
}

function BuilderInputs(): JSX.Element {
  const segs = useLedWall((s) => s.builderSegs)
  const set = useLedWall((s) => s.set)
  function update(i: number, patch: Partial<BuilderSegment>): void {
    set({
      builderSegs: segs.map((seg, j) => (j === i ? ({ ...seg, ...patch } as BuilderSegment) : seg))
    })
  }
  return (
    <Field
      label="Abschnitte"
      hint="Gerade und gebogene Abschnitte von links nach rechts – die Winkel eines Bogens werden in 2,5°-Schritten auf seine Module verteilt (höchstens 45° je Modul)."
    >
      <div className="space-y-1.5">
        {segs.map((seg, i) => (
          <div
            key={i}
            className="space-y-1.5 rounded-md border border-border bg-card/60 p-2"
            aria-label={`Abschnitt ${i + 1}`}
            role="group"
          >
            <div className="flex items-center gap-1.5">
              <Segmented
                label={`Art von Abschnitt ${i + 1}`}
                className="flex-1"
                value={seg.type}
                options={[
                  { value: 'straight', label: 'Gerade' },
                  { value: 'curved', label: 'Bogen' }
                ]}
                onChange={(v) =>
                  update(
                    i,
                    v === 'straight'
                      ? { type: 'straight' }
                      : seg.type === 'curved'
                        ? { type: 'curved' }
                        : { type: 'curved', angle: 30, dir: 'convex' }
                  )
                }
              />
              <NumCommit
                aria-label={`Module in Abschnitt ${i + 1}`}
                value={seg.count}
                min={1}
                max={GRID_SIDE_MAX}
                integer
                // weniger Module: Winkel mitkappen (höchstens 45° je Modul)
                onCommit={(v) =>
                  update(
                    i,
                    seg.type === 'curved'
                      ? { count: v, angle: Math.min(seg.angle, v * 45) }
                      : { count: v }
                  )
                }
                className="h-8 w-14 px-2 text-sm"
              />
              <span className="text-xs text-muted-foreground">Mod.</span>
              {segs.length > 1 && (
                <button
                  type="button"
                  onClick={() => set({ builderSegs: segs.filter((_, j) => j !== i) })}
                  aria-label={`Abschnitt ${i + 1} entfernen`}
                  className="rounded p-1 text-muted-foreground hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {seg.type === 'curved' && (
              <div className="flex items-center gap-1.5">
                <NumCommit
                  aria-label={`Winkel von Abschnitt ${i + 1}`}
                  value={seg.angle ?? 0}
                  min={2.5}
                  max={seg.count * 45}
                  onCommit={(v) => update(i, { angle: v })}
                  className="h-8 w-16 px-2 text-sm"
                />
                <span className="text-xs text-muted-foreground">°</span>
                <Segmented
                  label={`Richtung von Abschnitt ${i + 1}`}
                  className="flex-1"
                  value={seg.dir ?? 'convex'}
                  options={[
                    { value: 'convex', label: 'Konvex' },
                    { value: 'concave', label: 'Konkav' }
                  ]}
                  onChange={(v) => update(i, { dir: v })}
                />
              </div>
            )}
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed"
          onClick={() => set({ builderSegs: [...segs, { type: 'straight', count: 3 }] })}
        >
          <Plus className="size-4" /> Abschnitt
        </Button>
      </div>
    </Field>
  )
}

function SquircleInputs({ d }: { d: WallMetrics }): JSX.Element {
  const sqD = useLedWall((s) => s.sqD)
  const sqCorner = useLedWall((s) => s.sqCorner)
  const set = useLedWall((s) => s.set)
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tiefe" hint="Außentiefe des Squircles.">
          <UnitInput value={sqD} unit="m" onChange={(v) => set({ sqD: v })} />
        </Field>
        <Field label="Module je Ecke" hint="Mindestens 2 (90° ÷ 45° je Modul).">
          <NumCommit
            aria-label="Module je Ecke"
            value={sqCorner}
            min={2}
            max={36}
            integer
            onCommit={(v) => set({ sqCorner: v })}
          />
        </Field>
      </div>
      {d.curve && !d.curve.feasible && (
        <Alert tone="danger">Mindestens 2 Module je Ecke nötig (90° ÷ 45° = 2).</Alert>
      )}
    </>
  )
}
