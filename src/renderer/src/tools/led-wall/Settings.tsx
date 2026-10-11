// Schublade des LED-Wall-Konfigurators: alles, was die Wand festlegt (Vorlagen, Projekt, Modul,
// Größe und Aufbau, Curving-Form). Die Arbeitsfläche zeigt, was daraus folgt.

import { Bookmark, Box, Briefcase, Plus, Ruler, Save, Spline, Trash2, X } from 'lucide-react'
import { PanelSection } from '@renderer/components/ToolShell'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { Segmented } from '@renderer/components/ui/segmented'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { fmt } from '../_calc/ui'
import type { WallMetrics } from './compute'
import { CURVE_MODE_LABELS } from './curve'
import { CIRCLE_TABLE, MODULES } from './data'
import type { BuilderSegment } from './math'
import { useLedWall, type BuildMode, type CurveMode, type LedWallPreset } from './store'
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
    </>
  )
}

function PresetsPanel(): JSX.Element {
  const presets = useLedWall((s) => s.presets)
  const projectName = useLedWall((s) => s.projectName)
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
                onClick={() => loadPreset(p.id)}
                title="Vorlage laden – ersetzt die aktuelle Planung"
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
        onClick={() => savePreset(projectName.trim() || `Vorlage ${presets.length + 1}`)}
        title="Gespeichert wird unter dem Projektnamen – gleicher Name überschreibt die Vorlage"
      >
        <Save className="size-4" /> Aktuelle Planung speichern
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
      summary={`${num(parseFloat(d.actualW), 2)} × ${num(parseFloat(d.actualH), 2)} m · ${d.cols} × ${d.rows} Module · ${BUILD_LABELS[buildMode]}`}
    >
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
                max={50}
                integer
                onCommit={(v) => update(i, { count: v })}
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
