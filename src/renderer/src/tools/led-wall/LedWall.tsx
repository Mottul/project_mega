// LED-Wall-Konfigurator: Wandgröße + Modultyp -> Auflösung, 16:9-Einpassung,
// Gewicht, Strom und Ballast; dazu zeichenbare Signal-/Strom-Verkabelungspläne
// und (uS2+) die Curving-Planung. Export als PDF-Projektdoku.

import { useEffect, useMemo } from 'react'
import { FileDown } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Readout, fmt } from '../_calc/ui'
import { CableGrid } from './CableGrid'
import { computeWall } from './compute'
import { Curving } from './Curving'
import { CURVE_MODE_LABELS } from './curve'
import { MODULES, PWR_COLORS, SIG_COLORS } from './data'
import { exportLedWallPdf } from './print'
import { useLedWall, type BuildMode } from './store'
import { topDownMarkup } from './topdown'
import { LField } from './ui'

function SectionTitle({ children }: { children: string }): JSX.Element {
  return <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{children}</h2>
}

export function LedWall(): JSX.Element {
  const s = useLedWall()

  const d = useMemo(
    () =>
      computeWall({
        moduleKey: s.moduleKey,
        widthM: s.widthM,
        heightM: s.heightM,
        curveMode: s.curveMode,
        segSag: s.segSag,
        builderSegs: s.builderSegs,
        sqD: s.sqD,
        sqCorner: s.sqCorner,
        selectedCircle: s.selectedCircle
      }),
    [s.moduleKey, s.widthM, s.heightM, s.curveMode, s.segSag, s.builderSegs, s.sqD, s.sqCorner, s.selectedCircle]
  )

  // Verkabelungs-Grids an die Modulzahl anpassen (Zuordnungen bleiben erhalten).
  useEffect(() => {
    s.ensureGridSize(d.rows, d.cols)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.rows, d.cols])

  // Breite ist nur dort frei editierbar, wo sie das Curving treibt (Segment/
  // Squircle) bzw. bei flachen Modulen. Bei Vollkreis/Builder ergibt sie sich.
  const curve = d.curve
  const widthEditable = !curve || curve.drivesWidth != null

  function doExport(): void {
    const curveForPdf = curve
      ? {
          modeLabel: CURVE_MODE_LABELS[curve.mode],
          mods: curve.mods,
          angles: curve.angles,
          footprintW: curve.footprintW,
          footprintD: curve.footprintD,
          svg: topDownMarkup(curve.angles, {
            showChord: curve.mode === 'segment',
            chordHorizontal: curve.mode === 'segment',
            chordLabel: curve.arc?.ca ?? null,
            sagLabel: curve.arc?.sa ?? null,
            maxPx: s.pdfLandscape ? 620 : 470
          })
        }
      : null
    void exportLedWallPdf({
      ...d,
      projectName: s.projectName,
      customerName: s.customerName,
      buildMode: s.buildMode,
      sig: s.sig,
      pwr: s.pwr,
      landscape: s.pdfLandscape,
      curve: curveForPdf
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      {/* Projekt + Wandgröße */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <SectionTitle>Projekt</SectionTitle>
            <div className="flex items-center gap-1.5">
              <div className="flex overflow-hidden rounded-md border border-border" title="Seitenformat der PDF-Doku">
                {(
                  [
                    [false, 'Hoch'],
                    [true, 'Quer']
                  ] as [boolean, string][]
                ).map(([landscape, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => s.set({ pdfLandscape: landscape })}
                    className={`px-2 py-1 text-xs transition-colors ${
                      s.pdfLandscape === landscape
                        ? 'bg-primary/15 font-semibold text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={doExport}>
                <FileDown className="size-4" /> PDF exportieren
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Projektname</span>
              <Input
                value={s.projectName}
                placeholder="z.B. Messe Frankfurt 2026"
                onChange={(e) => s.set({ projectName: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Kunde</span>
              <Input
                value={s.customerName}
                placeholder="z.B. Firma XY"
                onChange={(e) => s.set({ customerName: e.target.value })}
              />
            </label>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Wandgröße &amp; Aufbau</SectionTitle>
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {widthEditable ? (
                <LField label="Breite" unit="m" value={s.widthM} onChange={(v) => s.set({ widthM: v })} />
              ) : (
                <div>
                  <span className="mb-1 block text-xs text-muted-foreground">Breite (aus Curving)</span>
                  <div className="flex h-9 items-center rounded-md border border-primary/30 bg-primary/[0.07] px-3 text-sm font-semibold text-primary">
                    {d.actualW} m
                  </div>
                </div>
              )}
              <LField label="Höhe" unit="m" value={s.heightM} onChange={(v) => s.set({ heightM: v })} />
            </div>
            {curve && (
              <p className="text-xs text-muted-foreground">
                Form: <span className="font-medium text-foreground">{CURVE_MODE_LABELS[curve.mode]}</span> ·{' '}
                {curve.mods} Module/Reihe · belegt {fmt(curve.footprintW, 2)} × {fmt(curve.footprintD, 2)} m
              </p>
            )}
            <div className="flex gap-2">
              {(
                [
                  ['stacked', 'Ground-Stack'],
                  ['flying', 'Fliegend']
                ] as [BuildMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => s.set({ buildMode: mode })}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    s.buildMode === mode
                      ? 'border-primary/60 bg-primary/10 font-semibold text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Tatsächlich: <span className="font-medium text-foreground">{d.actualW} × {d.actualH} m</span>{' '}
              ({d.cols}×{d.rows} = {d.total} Module)
            </p>
          </div>
        </Card>
      </div>

      {/* Modultyp */}
      <Card className="p-5">
        <SectionTitle>Modultyp</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {Object.entries(MODULES).map(([key, m]) => (
            <button
              key={key}
              type="button"
              onClick={() => s.set({ moduleKey: key })}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                s.moduleKey === key
                  ? 'border-primary/70 bg-primary/[0.07]'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <div className="text-base font-bold text-primary">{m.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                PP {m.pitch} mm · {m.tag}
              </div>
              <div className="text-xs text-muted-foreground">
                {m.resX}×{m.resY} px · {m.dimW}×{m.dimH} mm
              </div>
              {m.canCurve && <div className="mt-1 text-[10px] font-semibold text-primary">Curving 0–{m.maxAngle}°</div>}
            </button>
          ))}
        </div>
      </Card>

      {/* Curving (nur uS2+) */}
      {s.moduleKey === 'uS2+' && <Curving />}

      {/* Kennzahlen + Verkabelung */}
      <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle>Auflösung</SectionTitle>
            <div className="mt-2 text-3xl font-bold tracking-tight">
              {d.resX} × {d.resY}
            </div>
            <p className="text-xs text-muted-foreground">
              Pixel ({d.ratioW}:{d.ratioH})
            </p>
            <div className="mt-3 space-y-2">
              {d.fit169?.match ? (
                <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-500">
                  16:9-Content passt exakt
                </p>
              ) : d.fit169 ? (
                <div className="rounded-md border border-primary/30 bg-primary/[0.08] px-3 py-2 text-xs">
                  <p className="font-semibold text-primary">16:9-Content</p>
                  <p className="mt-0.5 text-muted-foreground">
                    <span className="font-medium text-foreground">{d.fit169.barPx} px</span> Rand{' '}
                    {d.fit169.side === 'lr' ? 'links/rechts' : 'oben/unten'} · Nutzfläche {d.fit169.cw}×{d.fit169.ch} px
                  </p>
                </div>
              ) : null}
              <Readout label="Pixelpitch" value={String(d.mod.pitch)} unit="mm" />
              <Readout label="Module" value={String(d.total)} unit="Stk." />
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Technische Daten</SectionTitle>
            <div className="mt-3 space-y-2">
              <Readout label="Gewicht" value={fmt(parseFloat(d.weightKg), 1)} unit="kg" accent />
              <Readout label="Tiefe" value={String(d.mod.dimD)} unit="mm" />
              <Readout label="Schutzart" value={d.mod.ip} />
              <Readout label="Helligkeit" value={String(d.mod.brightness)} unit="nit" />
              <Readout label="Kontrast" value={`> ${d.mod.contrast}`} />
              <Readout label="Refresh" value={`≥ ${d.mod.refresh}`} unit="Hz" />
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Strom</SectionTitle>
            <div className="mt-3 space-y-2">
              <Readout label="Typisch" value={fmt(d.powerTypW, 0)} unit="W" />
              <Readout label="Maximal" value={fmt(d.powerMaxW, 0)} unit="W" accent />
              <Readout label="Typisch" value={d.ampsTyp} unit="A" />
              <Readout label="Maximal" value={d.ampsMax} unit="A" accent />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">{d.mod.connector}</p>
          </Card>

          <Card className="p-5">
            <SectionTitle>{s.buildMode === 'stacked' ? 'Ground-Stack (LSU)' : 'Fliegend'}</SectionTitle>
            <div className="mt-3 space-y-2">
              {s.buildMode === 'stacked' ? (
                <>
                  <Readout label="Standfüße" value={String(d.baseUnits)} unit="Stk." />
                  <Readout label="Ballast/Fuß" value={String(d.ballastPerBase)} unit="kg" />
                  <Readout label="Ballast gesamt" value={fmt(d.totalBallast, 0)} unit="kg" big accent />
                  <p className="text-[10px] text-muted-foreground">
                    1 LSU-Fuß pro lfd. Meter Bildbreite ({d.actualW} m → {d.baseUnits} Bases)
                  </p>
                </>
              ) : (
                <>
                  <Readout label="Gewicht an Traverse" value={fmt(parseFloat(d.weightKg), 1)} unit="kg" big accent />
                  <p className="text-[10px] text-muted-foreground">
                    Rigging-Punkte und Traverse je nach Situation planen.
                  </p>
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle>{`Signalverkabelung — ${d.cols}×${d.rows}`}</SectionTitle>
            <div className="mt-3">
              <CableGrid
                grid={s.sig}
                colors={SIG_COLORS}
                prefix="S"
                activeChain={s.sigChain}
                onChain={(c) => s.set({ sigChain: c })}
                onCell={(r, c) => s.setCell('sig', r, c)}
                onLine={(k, i) => s.fillLine('sig', k, i)}
                onReset={() => s.resetGrid('sig')}
              />
            </div>
          </Card>
          <Card className="p-5">
            <SectionTitle>{`Stromverkabelung — ${d.cols}×${d.rows}`}</SectionTitle>
            <div className="mt-3">
              <CableGrid
                grid={s.pwr}
                colors={PWR_COLORS}
                prefix="P"
                activeChain={s.pwrChain}
                onChain={(c) => s.set({ pwrChain: c })}
                onCell={(r, c) => s.setCell('pwr', r, c)}
                onLine={(k, i) => s.fillLine('pwr', k, i)}
                onReset={() => s.resetGrid('pwr')}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
