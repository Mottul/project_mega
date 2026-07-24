// Zustand der OSC-Steuerung (zustand/persist): mehrere SETS (gespeicherte
// Setups, wie die Bänke im Jingle-Player). Jedes Set hat ein RASTER, in dem die
// Widgets (Fader/Button/Toggle/XY/Farbe) frei positioniert sind (gx/gy = Zelle,
// cw/ch = Spanne) und sich nicht überlappen. Jedes Widget kennt seine
// OSC-Adresse(n). Gesendet wird über api.osc (main-Prozess). Live-Werte werden
// mitgespeichert.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { APP_SLUG } from '@shared/brand'
import { debouncedStorage } from '@renderer/lib/persistStorage'

export type OscWidgetType =
  'fader' | 'button' | 'toggle' | 'xy' | 'color' | 'label' | 'meter' | 'select' | 'bank' | 'knob'

/** Verhalten der Felder einer Bank-Kachel. */
export type BankMode = 'momentary' | 'toggle' | 'knob'

/** Ziel einer Widget-Interaktion: OSC-Nachricht (Default) oder NovaStar-Befehl.
 *  NovaStar-Widgets sind normale Fader/Schalter/Taster/Auswahl -- nur das Ziel
 *  ist der (werkzeugübergreifend geteilte) NovaStar-Prozessor statt OSC. */
export type OscTarget = 'osc' | 'nova'

/** NovaStar-Funktion eines Widgets (nur wenn target === 'nova'). */
export type NovaFn =
  | 'brightness' // Fader: 0..100 % (min/max des Faders = %)
  | 'brightnessSet' // Taster: Helligkeit auf `value` % setzen
  | 'brightnessStep' // Taster: Helligkeit um `value` % ändern (±)
  | 'fadeToBlack' // Schalter: an = weich auf 0, aus = weich auf `restore` %
  | 'freeze' // Schalter: einfrieren / auftauen
  | 'blackout' // Schalter: schwarz / normal (schließt Freeze aus)
  | 'preset' // Auswahl: Option-Wert = Preset-Nummer

export interface NovaConfig {
  fn: NovaFn
  value: number // brightnessSet: Ziel-%, brightnessStep: ±%, fadeToBlack: Dauer (s)
  restore: number // fadeToBlack: Helligkeit beim Ausschalten (%)
}

export const DEFAULT_NOVA: NovaConfig = { fn: 'brightness', value: 10, restore: 100 }

/** Eintrag einer Auswahl-/Bank-Kachel. `value` ist der gespeicherte Live-Wert des
 *  Eintrags (Auswahl: zu sendender Wert; Bank-Schalter: An/Aus 0/1; Bank-Poti:
 *  Reglerwert min..max). */
export interface OscItem {
  label: string
  address: string // leer = Adresse des Widgets verwenden
  value: number
}

export interface OscWidget {
  id: string
  type: OscWidgetType
  label: string
  color: string // Akzentfarbe der Kachel (#rrggbb)
  address: string // primäre OSC-Adresse
  addressY: string // 2. Achse (nur xy)
  min: number // Faderbereich
  max: number
  onValue: number // Button/Toggle: Wert „an“
  offValue: number // Button/Toggle: Wert „aus“
  gx: number // Rasterposition: Spalte (0-basiert); -1 = noch zu platzieren
  gy: number // Rasterposition: Zeile (0-basiert)
  cw: number // Rasterspanne: Spalten
  ch: number // Rasterspanne: Zeilen
  // persistierter Live-Zustand
  value: number // Fader / Toggle (on = value>=0.5)
  x: number // xy 0..1
  y: number // xy 0..1
  r: number // Farbe 0..1
  g: number
  b: number
  a: number // Farbe Alpha 0..1
  align: 'left' | 'center' | 'right' // nur Label: Textausrichtung
  // nur Anzeige/Meter: Wertquelle. 'osc' = numerisches OSC-Feedback (Balken+Zahl),
  // 'text' = OSC-String (z.B. Blendmodus/Surface-Name von MadMapper), 'video' =
  // Restzeit des laufenden Videos.
  source: 'osc' | 'video' | 'text'
  text: string // nur Anzeige/Meter (source='text'): zuletzt empfangener String
  items: OscItem[] // nur Auswahl/Bank: Optionen bzw. Felder
  orient: 'h' | 'v' // Fader/Farbe: Ausrichtung der Regler
  cols: number // Auswahl/Bank: Spalten im Raster (Zeilen folgen aus der Anzahl; 0 = automatisch)
  bankMode: BankMode // Bank: Verhalten der Felder (Taster/Schalter/Poti)
  endless: boolean // Poti: Endlos-Encoder (sendet relative Schritte statt Absolutwert)
  target: OscTarget // 'osc' (Default) oder 'nova' -> NovaStar-Prozessor
  nova: NovaConfig // nur bei target === 'nova'
}

/** Vorschau-Anzeige eines Sets (gemerkt je Set). */
export type OscDevice = 'off' | 'phone' | 'tablet'

export interface OscSet {
  id: string
  name: string
  columns: number
  widgets: OscWidget[]
  device: OscDevice // gemerkte Vorschau-Anzeige (Desktop/Handy/Tablet)
  landscape: boolean // gemerkte Ausrichtung der Vorschau
}

/** Ein Projekt bündelt mehrere Sets. Der Projekt-Titel ist das erste
 *  OSC-Adresssegment neu angelegter Widgets (Titel „mottl“ -> /mottl/fader). */
export interface OscProject {
  id: string
  name: string
  sets: OscSet[]
  currentSetId: string
}

export type OscMode = 'edit' | 'live'

/** Rastergrenzen. Fein (Default 24 Spalten) -> Fader/Buttons lassen sich klein
 *  und trotzdem bedienbar legen, Positionen in feinen Schritten. */
export const MIN_COLS = 4
export const MAX_COLS = 48
export const DEFAULT_COLS = 24
export const MAX_CH = 16

export const WIDGET_COLORS = [
  '#64748b',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e'
]

export const WIDGET_TYPE_LABEL: Record<OscWidgetType, string> = {
  fader: 'Fader',
  button: 'Taster',
  toggle: 'Schalter',
  xy: 'XY-Pad',
  color: 'Farbe',
  label: 'Label',
  meter: 'Anzeige',
  select: 'Auswahl',
  bank: 'Bank',
  knob: 'Poti'
}

// Standard-Rastergröße je Widget-Typ (Zellen, bezogen auf 24 Spalten).
const DEFAULT_SIZE: Record<OscWidgetType, { cw: number; ch: number }> = {
  fader: { cw: 3, ch: 6 },
  button: { cw: 3, ch: 2 },
  toggle: { cw: 3, ch: 2 },
  xy: { cw: 6, ch: 5 },
  color: { cw: 6, ch: 6 },
  label: { cw: 6, ch: 2 },
  meter: { cw: 6, ch: 3 },
  select: { cw: 3, ch: 6 },
  bank: { cw: 6, ch: 4 },
  knob: { cw: 3, ch: 4 }
}

/** Reihenfolge in der Widget-Palette (Hinzufügen). */
export const WIDGET_ORDER: OscWidgetType[] = [
  'fader',
  'knob',
  'toggle',
  'button',
  'bank',
  'select',
  'color',
  'xy',
  'label',
  'meter'
]

// Mindestgröße je Typ -> Regler bleiben bedienbar (Pads behalten Fläche, ein
// Taster schrumpft nicht auf null).
export const WIDGET_MIN: Record<OscWidgetType, { cw: number; ch: number }> = {
  fader: { cw: 1, ch: 2 },
  button: { cw: 1, ch: 1 },
  toggle: { cw: 1, ch: 1 },
  xy: { cw: 4, ch: 3 },
  color: { cw: 5, ch: 4 },
  label: { cw: 2, ch: 1 },
  meter: { cw: 3, ch: 2 },
  select: { cw: 3, ch: 2 },
  bank: { cw: 3, ch: 2 },
  knob: { cw: 3, ch: 3 }
}

let seq = 0
function uid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `w${Date.now().toString(36)}${(seq++).toString(36)}`
  }
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

/* --------------------------- Raster-Belegung ---------------------------- */

function addOcc(occ: Set<string>, gx: number, gy: number, cw: number, ch: number): void {
  for (let y = gy; y < gy + ch; y++) for (let x = gx; x < gx + cw; x++) occ.add(`${x},${y}`)
}
function fitsAt(occ: Set<string>, gx: number, gy: number, cw: number, ch: number): boolean {
  if (gx < 0 || gy < 0) return false
  for (let y = gy; y < gy + ch; y++)
    for (let x = gx; x < gx + cw; x++) if (occ.has(`${x},${y}`)) return false
  return true
}
/** Belegte Zellen aller Widgets (optional eines ausgenommen). */
function occupancyOf(ws: OscWidget[], cols: number, exceptId?: string): Set<string> {
  const occ = new Set<string>()
  for (const w of ws) {
    if (w.id === exceptId || w.gx < 0 || w.gy < 0) continue
    addOcc(occ, w.gx, w.gy, Math.min(w.cw, cols), w.ch)
  }
  return occ
}
/** Nächstgelegene freie Position für cw×ch (von prefGx/prefGy aus gemessen). */
function nearestFree(
  occ: Set<string>,
  cols: number,
  rowsLimit: number,
  cw: number,
  ch: number,
  prefGx: number,
  prefGy: number
): { gx: number; gy: number } {
  const w = Math.min(Math.max(1, cw), cols)
  let best = { gx: 0, gy: 0 }
  let bestD = Infinity
  for (let gy = 0; gy <= rowsLimit; gy++) {
    for (let gx = 0; gx <= cols - w; gx++) {
      if (!fitsAt(occ, gx, gy, w, ch)) continue
      const d = (gx - prefGx) ** 2 + (gy - prefGy) ** 2
      if (d < bestD) {
        bestD = d
        best = { gx, gy }
      }
    }
  }
  return best
}
/** Widgets mit gx<0 ins Raster einpassen (erste freie Position, Lesereihenfolge). */
function placeMissing(ws: OscWidget[], cols: number): void {
  const occ = occupancyOf(ws, cols)
  for (const w of ws) {
    if (w.gx >= 0 && w.gy >= 0) continue
    const cw = Math.min(w.cw, cols)
    let placed = false
    for (let gy = 0; !placed && gy < 4000; gy++) {
      for (let gx = 0; gx <= cols - cw; gx++) {
        if (fitsAt(occ, gx, gy, cw, w.ch)) {
          w.gx = gx
          w.gy = gy
          addOcc(occ, gx, gy, cw, w.ch)
          placed = true
          break
        }
      }
    }
    if (!placed) {
      w.gx = 0
      w.gy = 0
    }
  }
}

/* ------------------------------- Widgets -------------------------------- */

const DEFAULT_TITLE = APP_SLUG

/** Projekt-Titel -> erstes OSC-Adresssegment (klein, ohne Sonderzeichen). */
export function oscSlug(title: string): string {
  const s = (title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || DEFAULT_TITLE
}

/** Vollständiges Widget mit sinnvoller Vorbelegung je Typ. `title` liefert das
 *  erste Adresssegment (Projekt-Titel). */
export function makeWidget(type: OscWidgetType, title: string = DEFAULT_TITLE): OscWidget {
  const size = DEFAULT_SIZE[type]
  const slug = oscSlug(title)
  const base: OscWidget = {
    id: uid(),
    type,
    label: WIDGET_TYPE_LABEL[type],
    color: WIDGET_COLORS[6],
    address: `/${slug}/${type}`,
    addressY: '',
    min: 0,
    max: 1,
    onValue: 1,
    offValue: 0,
    gx: -1,
    gy: -1,
    cw: size.cw,
    ch: size.ch,
    value: 0,
    x: 0.5,
    y: 0.5,
    r: 0.2,
    g: 0.6,
    b: 1,
    a: 1,
    align: 'center',
    source: 'osc',
    text: '',
    items: [],
    orient: 'v',
    cols: 1,
    bankMode: 'momentary',
    endless: false,
    target: 'osc',
    nova: { ...DEFAULT_NOVA }
  }
  if (type === 'xy') {
    base.address = `/${slug}/x`
    base.addressY = `/${slug}/y`
  }
  if (type === 'label') {
    base.address = ''
    base.label = 'Überschrift'
  }
  if (type === 'meter') {
    base.label = 'Anzeige'
    base.address = `/${slug}/level`
  }
  if (type === 'knob') {
    base.label = 'Poti'
    base.address = `/${slug}/knob`
    base.value = 0.5
  }
  if (type === 'select') {
    base.label = 'Auswahl'
    base.address = `/${slug}/select`
    base.items = [
      { label: 'A', address: '', value: 0 },
      { label: 'B', address: '', value: 1 },
      { label: 'C', address: '', value: 2 }
    ]
  }
  if (type === 'bank') {
    base.label = 'Bank'
    base.address = ''
    base.cols = 3
    base.items = [
      { label: '1', address: `/${slug}/btn/1`, value: 0 },
      { label: '2', address: `/${slug}/btn/2`, value: 0 },
      { label: '3', address: `/${slug}/btn/3`, value: 0 }
    ]
  }
  return base
}

/* ------------------------- NovaStar-Widgets ----------------------------- */
// Eigene Palette-Einträge, die intern ganz normale Fader/Schalter/Taster/Auswahl
// sind (target='nova') -- so wird die gesamte Darstellung/Interaktion/Remote
// wiederverwendet, es fühlt sich aber wie dedizierte NovaStar-Widgets an.

export type NovaWidgetKind =
  | 'nova-brightness'
  | 'nova-bright-set'
  | 'nova-bright-step'
  | 'nova-fade'
  | 'nova-freeze'
  | 'nova-blackout'
  | 'nova-preset'

export const NOVA_PALETTE: { kind: NovaWidgetKind; type: OscWidgetType; label: string }[] = [
  { kind: 'nova-brightness', type: 'fader', label: 'Helligkeit' },
  { kind: 'nova-bright-set', type: 'button', label: 'Helligkeit =' },
  { kind: 'nova-bright-step', type: 'button', label: 'Helligkeit ±' },
  { kind: 'nova-fade', type: 'toggle', label: 'Fade to Black' },
  { kind: 'nova-freeze', type: 'toggle', label: 'Freeze' },
  { kind: 'nova-blackout', type: 'toggle', label: 'Blackout' },
  { kind: 'nova-preset', type: 'select', label: 'Presets' }
]

export const NOVA_FN_LABEL: Record<NovaFn, string> = {
  brightness: 'Helligkeit (Fader)',
  brightnessSet: 'Helligkeit setzen',
  brightnessStep: 'Helligkeit ±',
  fadeToBlack: 'Fade to Black',
  freeze: 'Freeze',
  blackout: 'Blackout',
  preset: 'Preset abrufen'
}

/** Fertig konfiguriertes NovaStar-Widget für einen Palette-Eintrag. */
export function makeNovaWidget(kind: NovaWidgetKind): OscWidget {
  const entry = NOVA_PALETTE.find((e) => e.kind === kind) ?? NOVA_PALETTE[0]
  const w = makeWidget(entry.type)
  w.target = 'nova'
  w.label = entry.label
  w.address = '' // NovaStar nutzt keine OSC-Adresse
  w.color = WIDGET_COLORS[1] // rot-orange -> hebt NovaStar-Widgets optisch ab
  switch (kind) {
    case 'nova-brightness':
      w.min = 0
      w.max = 100
      w.value = 100
      w.nova = { fn: 'brightness', value: 0, restore: 100 }
      break
    case 'nova-bright-set':
      w.nova = { fn: 'brightnessSet', value: 100, restore: 100 }
      w.label = 'Helligkeit 100 %'
      break
    case 'nova-bright-step':
      w.nova = { fn: 'brightnessStep', value: 10, restore: 100 }
      w.label = 'Helligkeit +10 %'
      break
    case 'nova-fade':
      w.nova = { fn: 'fadeToBlack', value: 2, restore: 100 }
      break
    case 'nova-freeze':
      w.nova = { fn: 'freeze', value: 0, restore: 100 }
      break
    case 'nova-blackout':
      w.nova = { fn: 'blackout', value: 0, restore: 100 }
      break
    case 'nova-preset':
      w.nova = { fn: 'preset', value: 0, restore: 100 }
      w.address = ''
      w.items = [
        { label: '1', address: '', value: 1 },
        { label: '2', address: '', value: 2 },
        { label: '3', address: '', value: 3 }
      ]
      break
  }
  return w
}

/** Adresse/Label eines NEU hinzugefügten Widgets durchnummerieren, wenn der Typ
 *  schon auf der Fläche liegt ( /…/fader -> /…/fader-2, Label „Fader 2"). Das
 *  erste seiner Art behält die saubere Default-Adresse. */
function numberWidget(w: OscWidget, existing: OscWidget[]): void {
  const same = existing.filter((x) => x.type === w.type)
  if (same.length === 0) return
  // Ab (Anzahl+1) hochzählen, bis Adresse UND Label frei sind – so kollidiert es
  // auch nach dem Löschen eines Widgets nicht (Bank/Label haben leere Adresse,
  // daher zählt dort das Label).
  const addrs = new Set(existing.map((x) => x.address))
  const labels = new Set(existing.map((x) => x.label))
  let n = same.length + 1
  while ((w.address && addrs.has(`${w.address}-${n}`)) || labels.has(`${w.label} ${n}`)) n++
  if (w.address) w.address = `${w.address}-${n}`
  if (w.addressY) w.addressY = `${w.addressY}-${n}`
  w.label = `${w.label} ${n}`
  if (w.items.length) {
    w.items = w.items.map((it) => ({
      ...it,
      address: it.address ? `${it.address}-${n}` : it.address
    }))
  }
}

/** Items eines (evtl. alten) Widgets säubern. */
function normalizeItems(raw: unknown): OscItem[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 64).map((it) => {
    const o = (it ?? {}) as Record<string, unknown>
    return {
      label: typeof o.label === 'string' ? o.label : '',
      address: typeof o.address === 'string' ? o.address : '',
      value: typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : 0
    }
  })
}

/** Felder eines (evtl. alten) Widgets vervollständigen + Größen begrenzen. */
function normalizeWidget(w: Partial<OscWidget> | undefined): OscWidget {
  const type: OscWidgetType =
    w &&
    [
      'fader',
      'button',
      'toggle',
      'xy',
      'color',
      'label',
      'meter',
      'select',
      'bank',
      'knob'
    ].includes(w.type as string)
      ? (w.type as OscWidgetType)
      : 'fader'
  const def = makeWidget(type)
  const merged = { ...def, ...w, type, id: w?.id ?? def.id }
  merged.items = w?.items ? normalizeItems(w.items) : def.items
  merged.source =
    w?.source === 'video' || w?.source === 'text' || w?.source === 'osc' ? w.source : def.source
  merged.text = typeof w?.text === 'string' ? w.text : def.text
  merged.orient = w?.orient === 'h' || w?.orient === 'v' ? w.orient : def.orient
  merged.bankMode = ['momentary', 'toggle', 'knob'].includes(w?.bankMode as string)
    ? (w!.bankMode as BankMode)
    : def.bankMode
  merged.cols =
    Number.isFinite(w?.cols) && (w!.cols as number) >= 0 ? Math.round(w!.cols as number) : def.cols
  merged.endless = typeof w?.endless === 'boolean' ? w.endless : def.endless
  merged.target = w?.target === 'nova' ? 'nova' : 'osc'
  merged.nova = {
    fn: (w?.nova?.fn as NovaFn) ?? DEFAULT_NOVA.fn,
    value: Number.isFinite(w?.nova?.value) ? (w!.nova!.value as number) : DEFAULT_NOVA.value,
    restore: Number.isFinite(w?.nova?.restore) ? (w!.nova!.restore as number) : DEFAULT_NOVA.restore
  }
  const min = WIDGET_MIN[type]
  merged.cw = clampInt(merged.cw, min.cw, MAX_COLS)
  merged.ch = clampInt(merged.ch, min.ch, MAX_CH)
  merged.gx = Number.isFinite(w?.gx) ? Math.max(-1, Math.round(merged.gx)) : -1
  merged.gy = Number.isFinite(w?.gy) ? Math.max(-1, Math.round(merged.gy)) : -1
  return merged
}

/** Beispiel-Widgets – je ein Typ (Positionen setzt der Aufrufer per placeMissing). */
function seedWidgets(): OscWidget[] {
  const fader = makeWidget('fader')
  fader.label = 'Opacity'
  fader.address = '/surfaces/1/opacity'
  fader.color = WIDGET_COLORS[6]

  const toggle = makeWidget('toggle')
  toggle.label = 'Solo'
  toggle.address = '/surfaces/1/solo'
  toggle.color = WIDGET_COLORS[4]

  const button = makeWidget('button')
  button.label = 'Cue 1'
  button.address = '/cues/1/recall'
  button.color = WIDGET_COLORS[1]

  const xy = makeWidget('xy')
  xy.label = 'Position'
  xy.color = WIDGET_COLORS[7]

  const color = makeWidget('color')
  color.label = 'Farbe'
  color.address = '/surfaces/1/color'
  color.color = WIDGET_COLORS[8]

  return [fader, toggle, button, xy, color]
}

function emptySet(name: string): OscSet {
  return { id: uid(), name, columns: DEFAULT_COLS, widgets: [], device: 'off', landscape: false }
}
function seededSet(name: string): OscSet {
  const widgets = seedWidgets()
  placeMissing(widgets, DEFAULT_COLS)
  return { id: uid(), name, columns: DEFAULT_COLS, widgets, device: 'off', landscape: false }
}

function emptyProject(name: string): OscProject {
  const s = emptySet('Set 1')
  return { id: uid(), name, sets: [s], currentSetId: s.id }
}
function seededProject(name: string): OscProject {
  const s = seededSet('Set 1')
  return { id: uid(), name, sets: [s], currentSetId: s.id }
}
/** Tiefe Kopie der Sets mit neuen IDs (für „neues Projekt aus Default-Projekt"). */
function cloneSets(src: OscSet[]): OscSet[] {
  return src.map((s) => ({
    ...s,
    id: uid(),
    widgets: s.widgets.map((w) => ({ ...w, id: uid(), items: w.items.map((it) => ({ ...it })) }))
  }))
}

interface OscStoreState {
  projects: OscProject[]
  currentProjectId: string
  defaultProjectId: string | null
  mode: OscMode

  currentProject: () => OscProject
  currentSet: () => OscSet
  set: (patch: Partial<Pick<OscStoreState, 'mode'>>) => void

  // Projekte (Set-Sammlungen)
  selectProject: (id: string) => void
  addProject: () => void
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
  saveAsDefaultProject: () => void

  // Sets im aktiven Projekt
  selectSet: (id: string) => void
  addSet: () => void
  renameSet: (id: string, name: string) => void
  deleteSet: (id: string) => void
  setColumns: (n: number) => void
  setDevice: (device: OscDevice) => void
  setLandscape: (landscape: boolean) => void

  addWidget: (type: OscWidgetType, pos?: { gx: number; gy: number }) => string
  addNovaWidget: (kind: NovaWidgetKind, pos?: { gx: number; gy: number }) => string
  duplicateWidget: (id: string) => string | null
  updateWidget: (id: string, patch: Partial<OscWidget>) => void
  removeWidget: (id: string) => void
  moveWidgetTo: (id: string, gx: number, gy: number) => void
  resizeWidget: (id: string, cw: number, ch: number) => void
  settleWidget: (id: string) => void
}

export const useOscSurface = create<OscStoreState>()(
  persist(
    (set, get) => {
      // Helfer: stets auf das aktive Projekt bzw. dessen aktives Set wirken.
      const proj = (): OscProject => {
        const s = get()
        return s.projects.find((p) => p.id === s.currentProjectId) ?? s.projects[0]
      }
      const mapProj = (fn: (p: OscProject) => OscProject): OscProject[] =>
        get().projects.map((p) => (p.id === get().currentProjectId ? fn(p) : p))
      const mapSets = (fn: (sets: OscSet[]) => OscSet[]): OscProject[] =>
        mapProj((p) => ({ ...p, sets: fn(p.sets) }))
      const mapWidgets = (fn: (ws: OscWidget[]) => OscWidget[]): OscProject[] =>
        mapSets((sets) =>
          sets.map((s) => (s.id === proj().currentSetId ? { ...s, widgets: fn(s.widgets) } : s))
        )
      const patchSet = (fn: (s: OscSet) => OscSet): OscProject[] =>
        mapSets((sets) => sets.map((s) => (s.id === proj().currentSetId ? fn(s) : s)))
      // Ein fertiges Widget ins aktive Set einfügen (an Klickzelle oder erste freie
      // Stelle). Von addWidget UND addNovaWidget genutzt.
      const placeAndAdd = (w: OscWidget, pos?: { gx: number; gy: number }): string => {
        const cols = get().currentSet().columns
        const ws = get().currentSet().widgets
        const cw = Math.min(w.cw, cols)
        if (pos) {
          const occ = occupancyOf(ws, cols)
          let gx = Math.max(0, Math.min(Math.round(pos.gx), cols - cw))
          let gy = Math.max(0, Math.round(pos.gy))
          if (!fitsAt(occ, gx, gy, cw, w.ch)) {
            const rowsLimit = ws.reduce((m, x) => Math.max(m, x.gy + x.ch), 0) + w.ch + 1
            const free = nearestFree(occ, cols, rowsLimit, cw, w.ch, gx, gy)
            gx = free.gx
            gy = free.gy
          }
          w.gx = gx
          w.gy = gy
        } else {
          w.gx = -1
          w.gy = -1
        }
        set({
          projects: mapWidgets((arr) => {
            const next = [...arr, w]
            if (!pos) placeMissing(next, cols)
            return next
          })
        })
        return w.id
      }
      const initial = seededProject('Projekt 1')

      return {
        projects: [initial],
        currentProjectId: initial.id,
        defaultProjectId: null,
        mode: 'edit',

        currentProject: () => proj(),
        currentSet: () => {
          const p = proj()
          return p.sets.find((s) => s.id === p.currentSetId) ?? p.sets[0]
        },
        set: (patch) => set(patch),

        // ---- Projekte ----
        selectProject: (id) => {
          if (get().projects.some((p) => p.id === id)) set({ currentProjectId: id })
        },
        addProject: () => {
          const def = get().projects.find((p) => p.id === get().defaultProjectId)
          const name = `Projekt ${get().projects.length + 1}`
          let np: OscProject
          if (def) {
            const sets = cloneSets(def.sets)
            np = { id: uid(), name, sets, currentSetId: sets[0].id }
          } else {
            np = emptyProject(name)
          }
          set({ projects: [...get().projects, np], currentProjectId: np.id })
        },
        renameProject: (id, name) =>
          set({ projects: get().projects.map((p) => (p.id === id ? { ...p, name } : p)) }),
        deleteProject: (id) => {
          const rest = get().projects.filter((p) => p.id !== id)
          const projects = rest.length ? rest : [seededProject('Projekt 1')]
          const defaultProjectId = get().defaultProjectId === id ? null : get().defaultProjectId
          const currentProjectId = projects.some((p) => p.id === get().currentProjectId)
            ? get().currentProjectId
            : projects[0].id
          set({ projects, currentProjectId, defaultProjectId })
        },
        saveAsDefaultProject: () => set({ defaultProjectId: get().currentProjectId }),

        // ---- Sets im aktiven Projekt ----
        selectSet: (id) => set({ projects: mapProj((p) => ({ ...p, currentSetId: id })) }),
        addSet: () => {
          const s = emptySet(`Set ${proj().sets.length + 1}`)
          set({ projects: mapProj((p) => ({ ...p, sets: [...p.sets, s], currentSetId: s.id })) })
        },
        renameSet: (id, name) =>
          set({ projects: mapSets((sets) => sets.map((s) => (s.id === id ? { ...s, name } : s))) }),
        deleteSet: (id) =>
          set({
            projects: mapProj((p) => {
              const rest = p.sets.filter((s) => s.id !== id)
              const sets = rest.length ? rest : [emptySet('Set 1')]
              const currentSetId = sets.some((s) => s.id === p.currentSetId)
                ? p.currentSetId
                : sets[0].id
              return { ...p, sets, currentSetId }
            })
          }),
        setColumns: (n) =>
          set({
            projects: patchSet((s) => {
              const cols = clampInt(n, MIN_COLS, MAX_COLS)
              // Widgets, die jetzt aus dem Raster ragen, hineinschieben.
              const widgets = s.widgets.map((w) => {
                const cw = Math.min(w.cw, cols)
                const gx = Math.max(0, Math.min(w.gx, cols - cw))
                return { ...w, cw, gx }
              })
              return { ...s, columns: cols, widgets }
            })
          }),
        setDevice: (device) => set({ projects: patchSet((s) => ({ ...s, device })) }),
        setLandscape: (landscape) => set({ projects: patchSet((s) => ({ ...s, landscape })) }),

        addWidget: (type, pos) => {
          const w = makeWidget(type, proj().name)
          const ws = get().currentSet().widgets
          numberWidget(w, ws) // Adresse/Label durchnummerieren, wenn Typ schon da
          return placeAndAdd(w, pos)
        },
        addNovaWidget: (kind, pos) => {
          const w = makeNovaWidget(kind)
          const ws = get().currentSet().widgets
          // nur Label durchnummerieren (NovaStar-Widgets haben keine OSC-Adresse)
          const sameLabel = ws.filter((x) => x.label === w.label).length
          if (sameLabel > 0) w.label = `${w.label} ${sameLabel + 1}`
          return placeAndAdd(w, pos)
        },
        duplicateWidget: (id) => {
          const ws = get().currentSet().widgets
          const src = ws.find((w) => w.id === id)
          if (!src) return null
          const cols = get().currentSet().columns
          // Adressen weiterzählen (Label/Größe/Einstellungen bleiben gleich).
          const addrs = new Set(ws.map((x) => x.address).filter(Boolean))
          const bump = (a: string): string => {
            if (!a) return a
            const base = a.replace(/-\d+$/, '')
            let n = 2
            while (addrs.has(`${base}-${n}`)) n++
            addrs.add(`${base}-${n}`)
            return `${base}-${n}`
          }
          const w: OscWidget = {
            ...src,
            id: uid(),
            address: bump(src.address),
            addressY: bump(src.addressY),
            items: src.items.map((it) => ({ ...it, address: bump(it.address) })),
            gx: -1,
            gy: -1
          }
          set({
            projects: mapWidgets((arr) => {
              const next = [...arr, w]
              placeMissing(next, cols)
              return next
            })
          })
          return w.id
        },
        updateWidget: (id, patch) =>
          set({
            projects: mapWidgets((ws) =>
              ws.map((w) => {
                if (w.id !== id) return w
                const next = { ...w, ...patch }
                const min = WIDGET_MIN[next.type]
                next.cw = clampInt(next.cw, min.cw, MAX_COLS)
                next.ch = clampInt(next.ch, min.ch, MAX_CH)
                return next
              })
            )
          }),
        removeWidget: (id) => set({ projects: mapWidgets((ws) => ws.filter((w) => w.id !== id)) }),
        moveWidgetTo: (id, gx, gy) =>
          set({
            projects: mapWidgets((ws) =>
              ws.map((w) =>
                w.id === id
                  ? { ...w, gx: Math.max(0, Math.round(gx)), gy: Math.max(0, Math.round(gy)) }
                  : w
              )
            )
          }),
        resizeWidget: (id, cw, ch) =>
          set({
            projects: mapWidgets((ws) =>
              ws.map((w) => {
                if (w.id !== id) return w
                const min = WIDGET_MIN[w.type]
                return {
                  ...w,
                  cw: clampInt(cw, min.cw, MAX_COLS),
                  ch: clampInt(ch, min.ch, MAX_CH)
                }
              })
            )
          }),
        // Nach dem Ziehen/Resizen Überlappung auflösen: liegt das Widget auf
        // einem anderen, rückt es auf die nächste freie Stelle.
        settleWidget: (id) =>
          set({
            projects: mapWidgets((ws) => {
              const me = ws.find((w) => w.id === id)
              if (!me || me.gx < 0) return ws
              const cols = get().currentSet().columns
              const occ = occupancyOf(ws, cols, id)
              const cw = Math.min(me.cw, cols)
              if (fitsAt(occ, me.gx, me.gy, cw, me.ch)) return ws
              const rowsLimit =
                ws.reduce((m, w) => (w.id === id ? m : Math.max(m, w.gy + w.ch)), 0) + me.ch + 1
              const pos = nearestFree(occ, cols, rowsLimit, cw, me.ch, me.gx, me.gy)
              return ws.map((w) => (w.id === id ? { ...w, gx: pos.gx, gy: pos.gy } : w))
            })
          })
      }
    },
    {
      name: 'osc-control',
      version: 4,
      storage: debouncedStorage(),
      migrate: (persisted, version) => {
        let p = persisted as Record<string, unknown>
        // v0 -> v1: einzelne Oberfläche { widgets, columns, mode } -> Sets
        if (version < 1 && Array.isArray(p.widgets)) {
          const set = {
            id: uid(),
            name: 'Set 1',
            columns: DEFAULT_COLS,
            widgets: p.widgets as OscWidget[]
          }
          p = { sets: [set], currentSetId: set.id, mode: p.mode === 'live' ? 'live' : 'edit' }
        }
        // <2: altes Modell ohne Rasterpositionen -> Geometrie auf aktuelle
        // Defaults setzen + platzieren (Inhalte bleiben).
        if (version < 2 && Array.isArray(p.sets)) {
          for (const s of p.sets as OscSet[]) {
            s.columns = DEFAULT_COLS
            s.widgets = (s.widgets ?? []).map((w) => {
              const nw = normalizeWidget(w)
              const def = DEFAULT_SIZE[nw.type]
              nw.cw = def.cw
              nw.ch = def.ch
              nw.gx = -1
              nw.gy = -1
              return nw
            })
            placeMissing(s.widgets, s.columns)
          }
        }
        // v2 -> v3: feineres Raster. Vorhandenes 12-Spalten-Layout wird
        // verdoppelt (Spalten, gx, cw) -> gleiches Aussehen, feinere Schritte.
        if (version === 2 && Array.isArray(p.sets)) {
          for (const s of p.sets as OscSet[]) {
            const cols = clampInt((s.columns ?? DEFAULT_COLS / 2) * 2, MIN_COLS, MAX_COLS)
            s.columns = cols
            s.widgets = (s.widgets ?? []).map((w) => {
              const raw = { ...(w as OscWidget) }
              if (Number.isFinite(raw.gx) && raw.gx >= 0) raw.gx = raw.gx * 2
              if (Number.isFinite(raw.cw)) raw.cw = raw.cw * 2
              return normalizeWidget(raw)
            })
            placeMissing(s.widgets, cols)
          }
        }
        // <=3 -> 4: flache Sets in ein Projekt „Projekt 1" wickeln; Geräte-/
        // Ausrichtungs-Felder pro Set ergänzen.
        if (!Array.isArray(p.projects) && Array.isArray(p.sets)) {
          const sets = (p.sets as OscSet[]).map((s) => ({
            ...s,
            device: (s as OscSet).device ?? 'off',
            landscape: (s as OscSet).landscape ?? false
          }))
          const currentSetId =
            typeof p.currentSetId === 'string' ? (p.currentSetId as string) : sets[0]?.id
          const project: OscProject = { id: uid(), name: 'Projekt 1', sets, currentSetId }
          p = {
            projects: [project],
            currentProjectId: project.id,
            defaultProjectId: null,
            mode: p.mode === 'live' ? 'live' : 'edit'
          }
        }
        return p as unknown
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (state.mode !== 'edit' && state.mode !== 'live') state.mode = 'edit'
        if (!Array.isArray(state.projects) || state.projects.length === 0) {
          const np = seededProject('Projekt 1')
          state.projects = [np]
          state.currentProjectId = np.id
          state.defaultProjectId = null
          return
        }
        for (const proj of state.projects) {
          if (!Array.isArray(proj.sets) || proj.sets.length === 0) proj.sets = [emptySet('Set 1')]
          for (const s of proj.sets) {
            s.columns = clampInt(s.columns, MIN_COLS, MAX_COLS)
            s.device = s.device === 'phone' || s.device === 'tablet' ? s.device : 'off'
            s.landscape = !!s.landscape
            s.widgets = (s.widgets ?? []).map(normalizeWidget)
            placeMissing(s.widgets, s.columns)
          }
          if (!proj.sets.some((s) => s.id === proj.currentSetId))
            proj.currentSetId = proj.sets[0].id
        }
        if (!state.projects.some((p) => p.id === state.currentProjectId)) {
          state.currentProjectId = state.projects[0].id
        }
        if (
          state.defaultProjectId &&
          !state.projects.some((p) => p.id === state.defaultProjectId)
        ) {
          state.defaultProjectId = null
        }
      }
    }
  )
)
