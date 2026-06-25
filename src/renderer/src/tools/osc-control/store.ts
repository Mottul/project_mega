// Zustand der OSC-Steuerung (zustand/persist): mehrere SETS (gespeicherte
// Setups, wie die Bänke im Jingle-Player). Jedes Set hat ein RASTER, in dem die
// Widgets (Fader/Button/Toggle/XY/Farbe) frei positioniert sind (gx/gy = Zelle,
// cw/ch = Spanne) und sich nicht überlappen. Jedes Widget kennt seine
// OSC-Adresse(n). Gesendet wird über api.osc (main-Prozess). Live-Werte werden
// mitgespeichert.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type OscWidgetType =
  | 'fader'
  | 'button'
  | 'toggle'
  | 'xy'
  | 'color'
  | 'label'
  | 'meter'
  | 'select'
  | 'bank'
  | 'knob'

/** Verhalten der Felder einer Bank-Kachel. */
export type BankMode = 'momentary' | 'toggle' | 'knob'

/** Eintrag einer Auswahl-/Bank-Kachel. `value` ist der gespeicherte Live-Wert des
 *  Eintrags (Auswahl: zu sendender Wert; Bank-Schalter: An/Aus 0/1; Bank-Knopf:
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
  source: 'osc' | 'video' // nur Anzeige/Meter: Wertquelle (OSC-Feedback oder Video-Restzeit)
  items: OscItem[] // nur Auswahl/Bank: Optionen bzw. Felder
  orient: 'h' | 'v' // Fader/Farbe: Ausrichtung der Regler
  cols: number // Auswahl/Bank: Spalten im Raster (Zeilen folgen aus der Anzahl; 0 = automatisch)
  bankMode: BankMode // Bank: Verhalten der Felder (Taster/Schalter/Knopf)
  endless: boolean // Knopf: Endlos-Encoder (sendet relative Schritte statt Absolutwert)
}

export interface OscSet {
  id: string
  name: string
  columns: number
  widgets: OscWidget[]
}

export type OscMode = 'edit' | 'live'

/** Rastergrenzen. Fein (Default 24 Spalten) -> Fader/Buttons lassen sich klein
 *  und trotzdem bedienbar legen, Positionen in feinen Schritten. */
export const MIN_COLS = 4
export const MAX_COLS = 48
export const DEFAULT_COLS = 24
export const MAX_CH = 16

export const WIDGET_COLORS = [
  '#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e'
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
  knob: 'Knopf'
}

export const BANK_MODE_LABEL: Record<BankMode, string> = {
  momentary: 'Taster',
  toggle: 'Schalter',
  knob: 'Knopf'
}

// Standard-Rastergröße je Widget-Typ (Zellen, bezogen auf 24 Spalten).
const DEFAULT_SIZE: Record<OscWidgetType, { cw: number; ch: number }> = {
  fader: { cw: 6, ch: 6 },
  button: { cw: 4, ch: 2 },
  toggle: { cw: 4, ch: 2 },
  xy: { cw: 8, ch: 5 },
  color: { cw: 8, ch: 6 },
  label: { cw: 10, ch: 2 },
  meter: { cw: 6, ch: 3 },
  select: { cw: 6, ch: 6 },
  bank: { cw: 8, ch: 4 },
  knob: { cw: 5, ch: 6 }
}

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
  for (let y = gy; y < gy + ch; y++) for (let x = gx; x < gx + cw; x++) if (occ.has(`${x},${y}`)) return false
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

/** Vollständiges Widget mit sinnvoller Vorbelegung je Typ. */
export function makeWidget(type: OscWidgetType): OscWidget {
  const size = DEFAULT_SIZE[type]
  const base: OscWidget = {
    id: uid(),
    type,
    label: WIDGET_TYPE_LABEL[type],
    color: WIDGET_COLORS[6],
    address: `/megatoolbox/${type}`,
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
    items: [],
    orient: 'v',
    cols: 1,
    bankMode: 'momentary',
    endless: false
  }
  if (type === 'xy') {
    base.address = '/megatoolbox/x'
    base.addressY = '/megatoolbox/y'
  }
  if (type === 'label') {
    base.address = ''
    base.label = 'Überschrift'
  }
  if (type === 'meter') {
    base.label = 'Anzeige'
    base.address = '/megatoolbox/level'
  }
  if (type === 'knob') {
    base.label = 'Knopf'
    base.address = '/megatoolbox/knob'
    base.value = 0.5
  }
  if (type === 'select') {
    base.label = 'Auswahl'
    base.address = '/megatoolbox/select'
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
      { label: '1', address: '/megatoolbox/btn/1', value: 0 },
      { label: '2', address: '/megatoolbox/btn/2', value: 0 },
      { label: '3', address: '/megatoolbox/btn/3', value: 0 }
    ]
  }
  return base
}

/** Adresse/Label eines NEU hinzugefügten Widgets durchnummerieren, wenn der Typ
 *  schon auf der Fläche liegt ( /…/fader -> /…/fader-2, Label „Fader 2"). Das
 *  erste seiner Art behält die saubere Default-Adresse. */
function numberWidget(w: OscWidget, existing: OscWidget[]): void {
  const sameType = existing.filter((x) => x.type === w.type).length
  if (sameType === 0) return
  const n = sameType + 1
  if (w.address) w.address = `${w.address}-${n}`
  if (w.addressY) w.addressY = `${w.addressY}-${n}`
  w.label = `${w.label} ${n}`
  if (w.items.length) {
    w.items = w.items.map((it) => ({ ...it, address: it.address ? `${it.address}-${n}` : it.address }))
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
    ['fader', 'button', 'toggle', 'xy', 'color', 'label', 'meter', 'select', 'bank', 'knob'].includes(
      w.type as string
    )
      ? (w.type as OscWidgetType)
      : 'fader'
  const def = makeWidget(type)
  const merged = { ...def, ...w, type, id: w?.id ?? def.id }
  merged.items = w?.items ? normalizeItems(w.items) : def.items
  merged.orient = w?.orient === 'h' || w?.orient === 'v' ? w.orient : def.orient
  merged.bankMode = ['momentary', 'toggle', 'knob'].includes(w?.bankMode as string)
    ? (w!.bankMode as BankMode)
    : def.bankMode
  merged.cols =
    Number.isFinite(w?.cols) && (w!.cols as number) >= 0 ? Math.round(w!.cols as number) : def.cols
  merged.endless = typeof w?.endless === 'boolean' ? w.endless : def.endless
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
  return { id: uid(), name, columns: DEFAULT_COLS, widgets: [] }
}
function seededSet(name: string): OscSet {
  const widgets = seedWidgets()
  placeMissing(widgets, DEFAULT_COLS)
  return { id: uid(), name, columns: DEFAULT_COLS, widgets }
}

interface OscStoreState {
  sets: OscSet[]
  currentSetId: string
  mode: OscMode

  currentSet: () => OscSet
  set: (patch: Partial<Pick<OscStoreState, 'mode'>>) => void
  selectSet: (id: string) => void
  addSet: () => void
  renameSet: (id: string, name: string) => void
  deleteSet: (id: string) => void
  setColumns: (n: number) => void

  addWidget: (type: OscWidgetType) => string
  updateWidget: (id: string, patch: Partial<OscWidget>) => void
  removeWidget: (id: string) => void
  moveWidgetTo: (id: string, gx: number, gy: number) => void
  resizeWidget: (id: string, cw: number, ch: number) => void
  settleWidget: (id: string) => void
  resetSurface: () => void
}

export const useOscSurface = create<OscStoreState>()(
  persist(
    (set, get) => {
      const mapWidgets = (fn: (ws: OscWidget[]) => OscWidget[]): OscSet[] =>
        get().sets.map((s) => (s.id === get().currentSetId ? { ...s, widgets: fn(s.widgets) } : s))
      const patchSet = (fn: (s: OscSet) => OscSet): OscSet[] =>
        get().sets.map((s) => (s.id === get().currentSetId ? fn(s) : s))
      const initial = seededSet('Set 1')

      return {
        sets: [initial],
        currentSetId: initial.id,
        mode: 'edit',

        currentSet: () => {
          const s = get()
          return s.sets.find((x) => x.id === s.currentSetId) ?? s.sets[0]
        },
        set: (patch) => set(patch),
        selectSet: (id) => set({ currentSetId: id }),
        addSet: () => {
          const s = emptySet(`Set ${get().sets.length + 1}`)
          set({ sets: [...get().sets, s], currentSetId: s.id })
        },
        renameSet: (id, name) =>
          set({ sets: get().sets.map((s) => (s.id === id ? { ...s, name } : s)) }),
        deleteSet: (id) => {
          const rest = get().sets.filter((s) => s.id !== id)
          const sets = rest.length ? rest : [seededSet('Set 1')]
          set({ sets, currentSetId: sets[0].id })
        },
        setColumns: (n) =>
          set({
            sets: patchSet((s) => {
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

        addWidget: (type) => {
          const w = makeWidget(type)
          const ws = get().currentSet().widgets
          numberWidget(w, ws) // Adresse/Label durchnummerieren, wenn Typ schon da
          // unter alles setzen -> kein Überlappen beim Hinzufügen
          w.gx = 0
          w.gy = ws.reduce((m, x) => Math.max(m, x.gy + x.ch), 0)
          set({ sets: mapWidgets((arr) => [...arr, w]) })
          return w.id
        },
        updateWidget: (id, patch) =>
          set({
            sets: mapWidgets((ws) =>
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
        removeWidget: (id) => set({ sets: mapWidgets((ws) => ws.filter((w) => w.id !== id)) }),
        moveWidgetTo: (id, gx, gy) =>
          set({
            sets: mapWidgets((ws) =>
              ws.map((w) =>
                w.id === id ? { ...w, gx: Math.max(0, Math.round(gx)), gy: Math.max(0, Math.round(gy)) } : w
              )
            )
          }),
        resizeWidget: (id, cw, ch) =>
          set({
            sets: mapWidgets((ws) =>
              ws.map((w) => {
                if (w.id !== id) return w
                const min = WIDGET_MIN[w.type]
                return { ...w, cw: clampInt(cw, min.cw, MAX_COLS), ch: clampInt(ch, min.ch, MAX_CH) }
              })
            )
          }),
        // Nach dem Ziehen/Resizen Überlappung auflösen: liegt das Widget auf
        // einem anderen, rückt es auf die nächste freie Stelle.
        settleWidget: (id) =>
          set({
            sets: mapWidgets((ws) => {
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
          }),
        resetSurface: () =>
          set({
            sets: patchSet((s) => {
              const widgets = seedWidgets()
              placeMissing(widgets, s.columns)
              return { ...s, widgets }
            })
          })
      }
    },
    {
      name: 'osc-control',
      version: 3,
      migrate: (persisted, version) => {
        let p = persisted as Record<string, unknown>
        // v0 -> v1: einzelne Oberfläche { widgets, columns, mode } -> Sets
        if (version < 1 && Array.isArray(p.widgets)) {
          const set: OscSet = {
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
        return p as unknown
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (state.mode !== 'edit' && state.mode !== 'live') state.mode = 'edit'
        if (!Array.isArray(state.sets) || state.sets.length === 0) {
          const s = seededSet('Set 1')
          state.sets = [s]
          state.currentSetId = s.id
          return
        }
        for (const s of state.sets) {
          s.columns = clampInt(s.columns, MIN_COLS, MAX_COLS)
          s.widgets = (s.widgets ?? []).map(normalizeWidget)
          placeMissing(s.widgets, s.columns)
        }
        if (!state.sets.some((s) => s.id === state.currentSetId)) {
          state.currentSetId = state.sets[0].id
        }
      }
    }
  )
)
