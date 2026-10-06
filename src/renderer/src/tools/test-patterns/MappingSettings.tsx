// Einstellungen des Mapping-Testbilds: Texte, Raster (automatisch, eigene Größe oder
// Cabinet-Raster aus dem LED-Wall-Konfigurator), schaltbare Elemente und Farben.

import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { selectClass } from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import {
  DEFAULT_PATTERN_CONFIG,
  MAPPING_DEFAULT_ACCENT,
  MAPPING_DEFAULT_BACKGROUND,
  type MappingElement,
  type PatternConfig
} from '@shared/types'
import { cardLayout } from './mappingCard'

// Schnellwahl: je Beamer eine eigene Akzentfarbe -> Überlappungen sofort zuzuordnen
const ACCENTS = [
  { hex: MAPPING_DEFAULT_ACCENT, label: 'Gold' },
  { hex: '#ff8c1a', label: 'Orange' },
  { hex: '#e8409c', label: 'Magenta' },
  { hex: '#45c552', label: 'Grün' },
  { hex: '#34c7db', label: 'Cyan' },
  { hex: '#4c7dff', label: 'Blau' }
]

const BACKGROUNDS = [
  { hex: MAPPING_DEFAULT_BACKGROUND, label: 'Anthrazit' },
  { hex: '#000000', label: 'Schwarz' },
  { hex: '#808080', label: 'Grau' },
  { hex: '#ffffff', label: 'Weiß' }
]

const ACCENT_ELEMENTS: { id: MappingElement; label: string; hint: string }[] = [
  {
    id: 'frame',
    label: 'Rahmen',
    hint: '1 px auf dem äußersten Pixel: fehlt eine Kante, wird beschnitten'
  },
  { id: 'corners', label: 'Ecken 1–4', hint: 'Ecknummern im Uhrzeigersinn, mit Pixelkoordinate' },
  { id: 'axes', label: 'Mittelachsen', hint: 'Genau durch die Bildmitte' },
  { id: 'circles', label: 'Kreise', hint: 'Bleiben sie rund, stimmt das Seitenverhältnis' },
  { id: 'up', label: 'OBEN-Pfeil', hint: 'Zeigt gedrehte oder gespiegelte Ausgänge' }
]

const OTHER_ELEMENTS: { id: MappingElement; label: string; hint: string }[] = [
  { id: 'grid', label: 'Raster', hint: 'Ab Pixel 0,0' },
  { id: 'ruler', label: 'Lineal', hint: 'Teilstriche alle 10/50/100 px' },
  { id: 'diagonals', label: 'Diagonalen', hint: 'Von Ecke zu Ecke' },
  { id: 'fields', label: 'Messfelder', hint: 'Farbe, Grau, Schärfe, Verlauf' },
  {
    id: 'labels',
    label: 'Beschriftungen',
    hint: 'Zellnamen, Lineal-Zahlen, Eck-Koordinaten, Grauwerte'
  },
  { id: 'logo', label: 'Logo & Titel', hint: 'Über der Mitte' },
  { id: 'info', label: 'Kennung', hint: 'Bezeichnung, Auflösung, Seitenverhältnis, Uhrzeit' }
]

function ColorField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
      />
      {label}
    </label>
  )
}

function Swatches({
  options,
  value,
  onPick
}: {
  options: { hex: string; label: string }[]
  value: string
  onPick: (hex: string) => void
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.hex}
          type="button"
          onClick={() => onPick(o.hex)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
            value.toLowerCase() === o.hex
              ? 'border-primary text-foreground'
              : 'border-border text-muted-foreground'
          )}
        >
          <span
            className="size-3 rounded-sm border border-white/25"
            style={{ background: o.hex }}
          />
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-sm" title={hint}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[hsl(var(--primary))]"
      />
      {label}
    </label>
  )
}

// Zellanzahl hübsch: ganze Zahl als solche, sonst mit Dezimalkomma (Teilzellen am Rand)
function fmtCells(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('de-DE', { maximumFractionDigits: 2 })
}

export function MappingSettings({
  config,
  patch
}: {
  config: PatternConfig
  patch: (p: Partial<PatternConfig>) => void
}): JSX.Element {
  const [ledNote, setLedNote] = useState<string | null>(null)
  const accent = config.mappingAccent || MAPPING_DEFAULT_ACCENT
  const background = config.mappingBackground || MAPPING_DEFAULT_BACKGROUND
  const hidden = new Set(config.mappingHidden ?? [])
  const lay = cardLayout(config.width, config.height, config.mappingCell)
  const custom = Boolean(config.mappingCell)
  const defaultColors =
    accent === MAPPING_DEFAULT_ACCENT && background === MAPPING_DEFAULT_BACKGROUND

  function show(id: MappingElement, visible: boolean): void {
    const next = new Set(hidden)
    if (visible) next.delete(id)
    else next.add(id)
    patch({ mappingHidden: [...next] })
  }

  // Raster und Auflösung aus dem LED-Wall-Konfigurator (gespeicherter Stand; erst bei
  // Bedarf geladen, damit das Testbild-Werkzeug schlank bleibt)
  async function fromLedWall(): Promise<void> {
    const [{ useLedWall }, { computeWall }] = await Promise.all([
      import('../led-wall/store'),
      import('../led-wall/compute')
    ])
    const wall = computeWall(useLedWall.getState())
    patch({
      width: wall.resX,
      height: wall.resY,
      mappingCell: { w: wall.mod.resX, h: wall.mod.resY }
    })
    setLedNote(
      `Modul ${wall.mod.name}: ${wall.mod.resX} × ${wall.mod.resY} px je Cabinet, ${wall.cols} × ${wall.rows} Cabinets = ${wall.resX} × ${wall.resY} px.`
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Titel (neben dem Logo)</span>
          <Input
            value={config.mappingTitle ?? DEFAULT_PATTERN_CONFIG.mappingTitle}
            placeholder="leer = nur Logo"
            onChange={(e) => patch({ mappingTitle: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Bezeichnung (unter der Mitte)</span>
          <Input
            value={config.label}
            placeholder="z.B. Beamer links"
            onChange={(e) => patch({ label: e.target.value })}
          />
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Raster</span>
        <select
          className={selectClass}
          value={custom ? 'custom' : 'auto'}
          aria-label="Rastergröße"
          onChange={(e) =>
            patch({
              mappingCell: e.target.value === 'custom' ? { w: lay.cw, h: lay.ch } : null
            })
          }
        >
          <option value="auto">Automatisch ({lay.u} px)</option>
          <option value="custom">Eigene Größe (z. B. Cabinet)</option>
        </select>
        {custom && (
          <div className="flex items-center gap-2">
            <NumberField
              value={lay.cw}
              min={4}
              max={4096}
              className="w-24"
              aria-label="Zellbreite"
              onCommit={(v) => patch({ mappingCell: { w: v, h: lay.ch } })}
            />
            <span className="text-muted-foreground">×</span>
            <NumberField
              value={lay.ch}
              min={4}
              max={4096}
              className="w-24"
              aria-label="Zellhöhe"
              onCommit={(v) => patch({ mappingCell: { w: lay.cw, h: v } })}
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void fromLedWall()}>
            Aus LED-Wall-Konfigurator
          </Button>
          <span className="text-xs text-muted-foreground">
            {fmtCells(config.width / lay.cw)} × {fmtCells(config.height / lay.ch)} Zellen
          </span>
        </div>
        {ledNote && <span className="text-xs text-muted-foreground">{ledNote}</span>}
        <Toggle
          checked={Boolean(config.mappingGridAccent)}
          onChange={(v) => patch({ mappingGridAccent: v })}
          label="Raster in Akzentfarbe"
          hint="Beim Überblenden mehrerer Beamer hat jeder sein eigenes, unterscheidbares Raster"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            className="size-3 rounded-sm border border-white/25"
            style={{ background: accent }}
          />
          In Akzentfarbe
        </span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {ACCENT_ELEMENTS.map((e) => (
            <Toggle
              key={e.id}
              checked={!hidden.has(e.id)}
              onChange={(v) => show(e.id, v)}
              label={e.label}
              hint={e.hint}
            />
          ))}
        </div>
        <span className="mt-1 text-sm font-medium">Weitere Elemente</span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {OTHER_ELEMENTS.map((e) => (
            <Toggle
              key={e.id}
              checked={!hidden.has(e.id)}
              onChange={(v) => show(e.id, v)}
              label={e.label}
              hint={e.hint}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Farben</span>
          <ColorField
            label="Akzent"
            value={accent}
            onChange={(hex) => patch({ mappingAccent: hex })}
          />
          <ColorField
            label="Hintergrund"
            value={background}
            onChange={(hex) => patch({ mappingBackground: hex })}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={defaultColors}
            onClick={() =>
              patch({
                mappingAccent: MAPPING_DEFAULT_ACCENT,
                mappingBackground: MAPPING_DEFAULT_BACKGROUND
              })
            }
          >
            Standard
          </Button>
        </div>
        <Swatches
          options={ACCENTS}
          value={accent}
          onPick={(hex) => patch({ mappingAccent: hex })}
        />
        <Swatches
          options={BACKGROUNDS}
          value={background}
          onPick={(hex) => patch({ mappingBackground: hex })}
        />
        <span className="text-xs text-muted-foreground">
          Raster, Lineal und Beschriftungen passen sich dem Hintergrund an (hell auf dunkel, dunkel
          auf hell). Die Uhrzeit läuft live mit – steht sie, hängt die Ausgabe.
        </span>
      </div>
    </div>
  )
}
