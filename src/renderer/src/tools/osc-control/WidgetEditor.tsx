// Inspector der OSC-Steuerung: Eigenschaften der gewählten Kachel (Adresse, Bereich, Einträge,
// Text-Zuordnungen, NovaStar-Funktion).

import type { ReactNode } from 'react'
import { Copy, Plus, Radio, Trash2, Tv } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { Select } from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import { useDraft } from '@renderer/lib/useDraft'
import {
  makeWidget,
  MAX_CH,
  NOVA_FN_LABEL,
  oscSlug,
  useOscSurface,
  WIDGET_COLORS,
  WIDGET_MIN,
  WIDGET_ORDER,
  WIDGET_TYPE_LABEL,
  type OscItem,
  type OscWidget,
  type OscWidgetType
} from './store'
import { clamp } from './oscShared'

/* ------------------------- Inspector: Widget ---------------------------- */

export function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function DecimalField({
  value,
  onCommit,
  className
}: {
  value: number
  onCommit: (n: number) => void
  className?: string
}): JSX.Element {
  const { ref, text, setText } = useDraft(String(value))
  function commit(): void {
    const n = parseFloat(text.replace(',', '.'))
    if (Number.isFinite(n)) onCommit(n)
    else setText(String(value))
  }
  return (
    <Input
      ref={ref}
      className={className}
      value={text}
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

/** Editor für die Einträge einer Auswahl- oder Bank-Kachel (Label + Wert bzw.
 *  Label + Adresse, hinzufügen/entfernen). */
function ItemsEditor({ w }: { w: OscWidget }): JSX.Element {
  const update = useOscSurface((s) => s.updateWidget)
  // Neuer Bank-Eintrag bekommt die Adresse mit AKTUELLEM Projekt-Titel als erstem
  // Segment (nicht mehr hart „megatoolbox"). Titel „mottl" -> /mottl/btn/N bzw. /mottl/knob/N.
  const projectName = useOscSurface((s) => s.currentProject().name)
  const isSelect = w.type === 'select'
  const isKnob = !isSelect && w.bankMode === 'knob'
  // Beschriftung folgt dem Bank-Modus, sonst stünde bei Schaltern und Potis „Taster“.
  const [title, noun] = isSelect
    ? ['Optionen', 'Option']
    : isKnob
      ? ['Potis', 'Poti']
      : w.bankMode === 'toggle'
        ? ['Schalter', 'Schalter']
        : ['Taster', 'Taster']
  const items = w.items
  const setItem = (i: number, patch: Partial<OscItem>): void =>
    update(w.id, { items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  const add = (): void =>
    update(w.id, {
      items: [
        ...items,
        isSelect
          ? {
              label: String.fromCharCode(65 + (items.length % 26)),
              address: '',
              value: items.length
            }
          : {
              label: String(items.length + 1),
              address: `/${oscSlug(projectName)}/${isKnob ? 'knob' : 'btn'}/${items.length + 1}`,
              // value ist bei Schaltern der Zustand und bei Potis die Stellung: neu = aus bzw.
              // Anschlag unten (vorher 1 -> neuer Schalter stand schon auf „an“).
              value: isKnob ? Math.min(w.min, w.max) : 0
            }
      ]
    })
  const remove = (i: number): void => update(w.id, { items: items.filter((_, j) => j !== i) })
  return (
    <div className="space-y-2">
      <span className="block text-xs text-muted-foreground">{title}</span>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={it.label}
            placeholder="Label"
            className="h-8 w-0 flex-1"
            onChange={(e) => setItem(i, { label: e.target.value })}
          />
          {isSelect ? (
            <DecimalField
              value={it.value}
              onCommit={(v) => setItem(i, { value: v })}
              className="h-8 w-16"
            />
          ) : (
            <Input
              value={it.address}
              spellCheck={false}
              placeholder="/adresse"
              className="h-8 w-0 flex-1 font-mono text-xs"
              onChange={(e) => setItem(i, { address: e.target.value })}
            />
          )}
          <button
            type="button"
            title="Eintrag entfernen"
            onClick={() => remove(i)}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={add}>
        <Plus className="size-3.5" /> {noun} hinzufügen
      </Button>
    </div>
  )
}

/** Wert→Text-Zuordnungen einer Text-Anzeige. MadMapper sendet für Enums
 *  (Blendmodus, Surface …) nur Zahlen; hier ordnet man jedem beobachteten Wert
 *  einen Namen zu. Die Zahlen liest man am besten im OSC-Monitor ab. */
function TextMeterMappings({ w }: { w: OscWidget }): JSX.Element {
  const update = useOscSurface((s) => s.updateWidget)
  const items = w.items
  const setItem = (i: number, patch: Partial<OscItem>): void =>
    update(w.id, { items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  const add = (): void =>
    update(w.id, { items: [...items, { label: '', address: '', value: items.length }] })
  const remove = (i: number): void => update(w.id, { items: items.filter((_, j) => j !== i) })
  return (
    <div className="space-y-2">
      <span className="block text-xs text-muted-foreground">
        Wert → Text (leer = Rohwert zeigen; Zahlen im OSC-Monitor ablesen)
      </span>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <DecimalField
            value={it.value}
            onCommit={(v) => setItem(i, { value: v })}
            className="h-8 w-20"
          />
          <span className="shrink-0 text-muted-foreground">→</span>
          <Input
            value={it.label}
            placeholder="Text"
            className="h-8 w-0 flex-1"
            onChange={(e) => setItem(i, { label: e.target.value })}
          />
          <button
            type="button"
            title="Zuordnung entfernen"
            onClick={() => remove(i)}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={add}>
        <Plus className="size-3.5" /> Zuordnung
      </Button>
    </div>
  )
}

/** Kompakte Umschaltleiste (gleich breite Knöpfe nebeneinander). */
function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div className="flex gap-1">
      {options.map(([v, lbl]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'h-9 flex-1 rounded-md border text-sm transition-colors',
            value === v
              ? 'border-foreground bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          {lbl}
        </button>
      ))}
    </div>
  )
}

/** Einstellungen eines NovaStar-Widgets (nur die zur Funktion passenden Felder).
 *  Bindet an w.nova; Preset-Optionen werden weiter unten über den ItemsEditor
 *  bearbeitet (Auswahl-Kachel). */
function NovaConfigEditor({ w }: { w: OscWidget }): JSX.Element {
  const update = useOscSurface((s) => s.updateWidget)
  const setNova = (patch: Partial<OscWidget['nova']>): void =>
    update(w.id, { nova: { ...w.nova, ...patch } })
  const fn = w.nova.fn
  return (
    <div className="space-y-2.5 rounded-md border border-border bg-muted/20 p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Tv className="size-3.5" /> {NOVA_FN_LABEL[fn]}
      </p>
      {fn === 'brightness' && (
        <p className="text-xs text-muted-foreground">
          Fader 0–100 %. Blendet die LED-Helligkeit direkt. Ausrichtung unten wählbar.
        </p>
      )}
      {fn === 'brightnessSet' && (
        <Field label="Ziel-Helligkeit (%)">
          <DecimalField
            value={w.nova.value}
            onCommit={(v) => setNova({ value: clamp(v, 0, 100) })}
            className="h-9"
          />
        </Field>
      )}
      {fn === 'brightnessStep' && (
        <Field label="Schrittweite (± %)">
          <DecimalField
            value={w.nova.value}
            onCommit={(v) => setNova({ value: clamp(v, -100, 100) })}
            className="h-9"
          />
        </Field>
      )}
      {fn === 'fadeToBlack' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fade-Dauer (s)">
            <DecimalField
              value={w.nova.value}
              onCommit={(v) => setNova({ value: Math.max(0.1, v) })}
              className="h-9"
            />
          </Field>
          <Field label="Aufblenden auf (%)">
            <DecimalField
              value={w.nova.restore}
              onCommit={(v) => setNova({ restore: clamp(v, 0, 100) })}
              className="h-9"
            />
          </Field>
        </div>
      )}
      {(fn === 'freeze' || fn === 'blackout') && (
        <p className="text-xs text-muted-foreground">
          Schalter (an/aus). Blackout und Freeze teilen sich am Gerät einen Anzeigemodus – nur eines
          gleichzeitig; das aktive ausschalten geht zurück auf Normal.
        </p>
      )}
      {fn === 'preset' && (
        <p className="text-xs text-muted-foreground">
          Auswahl der Preset-/Szenennummern (unten als Optionen). Der Wert einer Option ist die
          abzurufende Preset-Nummer.
        </p>
      )}
    </div>
  )
}

export function WidgetEditor({
  w,
  columns,
  learning,
  canLearn,
  onToggleLearn,
  onDuplicate,
  onRemove
}: {
  w: OscWidget
  columns: number
  learning: boolean
  canLearn: boolean
  onToggleLearn: () => void
  onDuplicate: () => void
  onRemove: () => void
}): JSX.Element {
  const update = useOscSurface((s) => s.updateWidget)
  const min = WIDGET_MIN[w.type]
  const isNova = w.target === 'nova'
  const hasRange =
    !isNova &&
    (w.type === 'fader' ||
      (w.type === 'knob' && !w.endless) ||
      (w.type === 'meter' && w.source === 'osc') ||
      (w.type === 'bank' && w.bankMode === 'knob'))
  const hasOnOff =
    !isNova &&
    (w.type === 'button' || w.type === 'toggle' || (w.type === 'bank' && w.bankMode !== 'knob'))
  return (
    <div className="space-y-2.5">
      {/* Schnellaktionen oben: Duplizieren + Entfernen */}
      <div className="flex gap-2 border-b border-border pb-2.5">
        <Button variant="outline" size="sm" className="flex-1" onClick={onDuplicate}>
          <Copy className="size-3.5" /> Duplizieren
        </Button>
        <Button variant="ghost" size="sm" className="flex-1 text-danger" onClick={onRemove}>
          <Trash2 className="size-3.5" /> Entfernen
        </Button>
      </div>
      {/* Name + Typ in einer Zeile -> kürzeres Panel */}
      <div className="grid grid-cols-2 gap-2">
        <Field label={w.type === 'label' ? 'Text' : 'Name'}>
          <Input
            className="h-9"
            value={w.label}
            onChange={(e) => update(w.id, { label: e.target.value })}
          />
        </Field>
        <Field label="Typ">
          {isNova ? (
            <div className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 text-sm text-muted-foreground">
              <Tv className="size-3.5 shrink-0" /> NovaStar
            </div>
          ) : (
            <Select
              className="w-full"
              value={w.type}
              onChange={(e) => {
                const type = e.target.value as OscWidgetType
                const patch: Partial<OscWidget> = { type }
                if (type === 'xy' && !w.addressY) patch.addressY = makeWidget('xy').addressY
                // Auswahl/Bank brauchen Einträge -> Beispiele setzen, falls leer.
                if ((type === 'select' || type === 'bank') && w.items.length === 0)
                  patch.items = makeWidget(type).items
                update(w.id, patch)
              }}
            >
              {WIDGET_ORDER.map((t) => (
                <option key={t} value={t}>
                  {WIDGET_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {isNova && <NovaConfigEditor w={w} />}

      {w.type === 'meter' && (
        <Field label="Quelle">
          <Select
            value={w.source}
            onChange={(e) => update(w.id, { source: e.target.value as 'osc' | 'video' | 'text' })}
            className="w-full"
          >
            <option value="osc">OSC-Feedback (Zahl)</option>
            <option value="text">OSC-Text (String)</option>
            <option value="video">Video-Restzeit</option>
          </Select>
        </Field>
      )}

      {!isNova && w.type !== 'label' && !(w.type === 'meter' && w.source === 'video') && (
        <Field
          label={
            w.type === 'xy'
              ? 'OSC-Adresse (X)'
              : w.type === 'select' || w.type === 'bank'
                ? 'OSC-Adresse (Standard)'
                : 'OSC-Adresse'
          }
        >
          <div className="flex gap-1.5">
            <Input
              value={w.address}
              spellCheck={false}
              className="flex-1 font-mono text-xs"
              onChange={(e) => update(w.id, { address: e.target.value })}
            />
            <button
              type="button"
              onClick={onToggleLearn}
              disabled={!canLearn && !learning}
              title={
                canLearn || learning
                  ? 'OSC-Adresse lernen: die nächste eingehende Adresse übernehmen'
                  : 'Erst Feedback-Empfang aktivieren (siehe Verbindung)'
              }
              className={cn(
                'flex h-9 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors',
                learning
                  ? 'animate-pulse border-success text-success'
                  : 'border-border text-muted-foreground hover:text-foreground disabled:opacity-40'
              )}
            >
              <Radio className="size-4" />
              {learning ? 'lernt…' : 'Learn'}
            </button>
          </div>
        </Field>
      )}

      {w.type === 'xy' && (
        <Field label="OSC-Adresse (Y)">
          <Input
            value={w.addressY}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => update(w.id, { addressY: e.target.value })}
          />
        </Field>
      )}

      {w.type === 'label' && (
        <Field label="Ausrichtung">
          <Segmented
            value={w.align}
            options={[
              ['left', 'Links'],
              ['center', 'Mitte'],
              ['right', 'Rechts']
            ]}
            onChange={(a) => update(w.id, { align: a })}
          />
        </Field>
      )}

      {w.type === 'fader' && (
        <Field label="Ausrichtung">
          <Segmented
            value={w.orient}
            options={[
              ['v', 'Vertikal'],
              ['h', 'Horizontal']
            ]}
            onChange={(o) => update(w.id, { orient: o })}
          />
        </Field>
      )}

      {w.type === 'knob' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={w.endless}
            onChange={(e) => update(w.id, { endless: e.target.checked })}
            className="size-4"
          />
          Endlos-Encoder (relative Schritte)
        </label>
      )}

      {w.type === 'bank' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Modus">
            <Segmented
              value={w.bankMode}
              options={[
                ['momentary', 'Taster'],
                ['toggle', 'Schalter'],
                ['knob', 'Poti']
              ]}
              onChange={(m) => update(w.id, { bankMode: m })}
            />
          </Field>
          <Field label="Spalten">
            <NumberField
              value={w.cols}
              min={1}
              max={12}
              onCommit={(v) => update(w.id, { cols: v })}
              className="h-9"
            />
          </Field>
        </div>
      )}

      {w.type === 'select' && (
        <Field label="Spalten">
          <NumberField
            value={w.cols}
            min={1}
            max={12}
            onCommit={(v) => update(w.id, { cols: v })}
            className="h-9"
          />
        </Field>
      )}

      {(w.type === 'select' || w.type === 'bank') && <ItemsEditor w={w} />}

      {w.type === 'meter' && w.source === 'text' && <TextMeterMappings w={w} />}

      {hasRange && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min">
            <DecimalField value={w.min} onCommit={(v) => update(w.id, { min: v })} />
          </Field>
          <Field label="Max">
            <DecimalField value={w.max} onCommit={(v) => update(w.id, { max: v })} />
          </Field>
        </div>
      )}

      {w.type === 'knob' && w.endless && (
        <Field label="Schrittweite (je Rastung)">
          <DecimalField value={w.onValue} onCommit={(v) => update(w.id, { onValue: v })} />
        </Field>
      )}

      {hasOnOff && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Wert „an“">
            <DecimalField value={w.onValue} onCommit={(v) => update(w.id, { onValue: v })} />
          </Field>
          <Field label="Wert „aus“">
            <DecimalField value={w.offValue} onCommit={(v) => update(w.id, { offValue: v })} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Breite (Spalten)">
          <NumberField
            value={w.cw}
            min={min.cw}
            max={columns}
            onCommit={(v) => update(w.id, { cw: v })}
            className="h-9"
          />
        </Field>
        <Field label="Höhe (Zeilen)">
          <NumberField
            value={w.ch}
            min={min.ch}
            max={MAX_CH}
            onCommit={(v) => update(w.id, { ch: v })}
            className="h-9"
          />
        </Field>
      </div>

      <div>
        <span className="mb-1.5 block text-xs text-muted-foreground">Farbe</span>
        <div className="flex flex-wrap gap-1.5">
          {WIDGET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update(w.id, { color: c })}
              className={cn(
                'size-6 rounded-full border-2 transition-transform hover:scale-110',
                w.color === c ? 'border-foreground' : 'border-transparent'
              )}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
