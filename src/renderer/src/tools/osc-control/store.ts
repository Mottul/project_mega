// Zustand der OSC-Steuerung (zustand/persist): mehrere SETS (gespeicherte
// Setups, wie die Bänke im Jingle-Player). Jedes Set hat ein Raster aus Widgets
// (Fader/Button/Toggle/XY/Farbe). Jedes Widget kennt seine OSC-Adresse(n) und
// seine Rastergröße (cw = Spalten-, ch = Zeilenspanne). Gesendet wird über
// api.osc (main-Prozess). Live-Werte werden mitgespeichert.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type OscWidgetType = 'fader' | 'button' | 'toggle' | 'xy' | 'color'

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
  cw: number // Rasterspanne: Spalten
  ch: number // Rasterspanne: Zeilen
  // persistierter Live-Zustand
  value: number // Fader / Toggle (on = value>=0.5)
  x: number // xy 0..1
  y: number // xy 0..1
  r: number // Farbe 0..1
  g: number
  b: number
}

export interface OscSet {
  id: string
  name: string
  columns: number
  widgets: OscWidget[]
}

export type OscMode = 'edit' | 'live'

/** Maximale Zeilenspanne eines Widgets (Rasterhöhe). */
export const MAX_CH = 6

export const WIDGET_COLORS = [
  '#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e'
]

export const WIDGET_TYPE_LABEL: Record<OscWidgetType, string> = {
  fader: 'Fader',
  button: 'Taster',
  toggle: 'Schalter',
  xy: 'XY-Pad',
  color: 'Farbe'
}

// Vernünftige Standard-Rastergröße je Widget-Typ.
const DEFAULT_SIZE: Record<OscWidgetType, { cw: number; ch: number }> = {
  fader: { cw: 1, ch: 3 },
  button: { cw: 1, ch: 2 },
  toggle: { cw: 1, ch: 2 },
  xy: { cw: 2, ch: 3 },
  color: { cw: 2, ch: 4 }
}

let seq = 0
function uid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `w${Date.now().toString(36)}${(seq++).toString(36)}`
  }
}

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
    cw: size.cw,
    ch: size.ch,
    value: 0,
    x: 0.5,
    y: 0.5,
    r: 0.2,
    g: 0.6,
    b: 1
  }
  if (type === 'xy') {
    base.address = '/megatoolbox/x'
    base.addressY = '/megatoolbox/y'
  }
  return base
}

/** Felder eines (evtl. alten) Widgets vervollständigen + Größen begrenzen. */
function normalizeWidget(w: Partial<OscWidget> | undefined): OscWidget {
  const type: OscWidgetType =
    w && ['fader', 'button', 'toggle', 'xy', 'color'].includes(w.type as string)
      ? (w.type as OscWidgetType)
      : 'fader'
  const def = makeWidget(type)
  const merged = { ...def, ...w, type, id: w?.id ?? def.id }
  merged.cw = clampInt(merged.cw, 1, 8)
  merged.ch = clampInt(merged.ch, 1, MAX_CH)
  return merged
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

/** Beispiel-Oberfläche – je ein Widget pro Typ. */
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

function newSet(name: string, widgets: OscWidget[] = []): OscSet {
  return { id: uid(), name, columns: 4, widgets }
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
  moveWidget: (id: string, dir: -1 | 1) => void
  resizeWidget: (id: string, cw: number, ch: number) => void
  resetSurface: () => void
}

export const useOscSurface = create<OscStoreState>()(
  persist(
    (set, get) => {
      const mapWidgets = (fn: (ws: OscWidget[]) => OscWidget[]): OscSet[] =>
        get().sets.map((s) => (s.id === get().currentSetId ? { ...s, widgets: fn(s.widgets) } : s))
      const patchSet = (fn: (s: OscSet) => OscSet): OscSet[] =>
        get().sets.map((s) => (s.id === get().currentSetId ? fn(s) : s))
      const initial = newSet('Set 1', seedWidgets())

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
          const s = newSet(`Set ${get().sets.length + 1}`)
          set({ sets: [...get().sets, s], currentSetId: s.id })
        },
        renameSet: (id, name) =>
          set({ sets: get().sets.map((s) => (s.id === id ? { ...s, name } : s)) }),
        deleteSet: (id) => {
          const rest = get().sets.filter((s) => s.id !== id)
          const sets = rest.length ? rest : [newSet('Set 1', seedWidgets())]
          set({ sets, currentSetId: sets[0].id })
        },
        setColumns: (n) => set({ sets: patchSet((s) => ({ ...s, columns: clampInt(n, 2, 8) })) }),

        addWidget: (type) => {
          const w = makeWidget(type)
          set({ sets: mapWidgets((ws) => [...ws, w]) })
          return w.id
        },
        updateWidget: (id, patch) =>
          set({ sets: mapWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w))) }),
        removeWidget: (id) => set({ sets: mapWidgets((ws) => ws.filter((w) => w.id !== id)) }),
        moveWidget: (id, dir) =>
          set({
            sets: mapWidgets((ws) => {
              const next = [...ws]
              const i = next.findIndex((w) => w.id === id)
              const j = i + dir
              if (i < 0 || j < 0 || j >= next.length) return ws
              ;[next[i], next[j]] = [next[j], next[i]]
              return next
            })
          }),
        resizeWidget: (id, cw, ch) =>
          set({
            sets: mapWidgets((ws) =>
              ws.map((w) =>
                w.id === id ? { ...w, cw: clampInt(cw, 1, 8), ch: clampInt(ch, 1, MAX_CH) } : w
              )
            )
          }),
        resetSurface: () => set({ sets: patchSet((s) => ({ ...s, widgets: seedWidgets() })) })
      }
    },
    {
      name: 'osc-control',
      version: 1,
      // Alte Fassung (eine Oberfläche: { widgets, columns, mode }) -> Sets.
      migrate: (persisted, version) => {
        const p = persisted as Record<string, unknown>
        if (version < 1 && p && Array.isArray(p.widgets)) {
          const columns = typeof p.columns === 'number' ? p.columns : 4
          const set = newSet('Set 1', (p.widgets as OscWidget[]).map(normalizeWidget))
          set.columns = clampInt(columns, 2, 8)
          return { sets: [set], currentSetId: set.id, mode: p.mode === 'live' ? 'live' : 'edit' }
        }
        return p as unknown
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (state.mode !== 'edit' && state.mode !== 'live') state.mode = 'edit'
        if (!Array.isArray(state.sets) || state.sets.length === 0) {
          const s = newSet('Set 1', seedWidgets())
          state.sets = [s]
          state.currentSetId = s.id
          return
        }
        for (const s of state.sets) {
          s.columns = clampInt(s.columns, 2, 8)
          s.widgets = (s.widgets ?? []).map(normalizeWidget)
        }
        if (!state.sets.some((s) => s.id === state.currentSetId)) {
          state.currentSetId = state.sets[0].id
        }
      }
    }
  )
)
