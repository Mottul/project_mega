// Zustand der OSC-Steuerung (zustand/persist): eine frei belegbare
// Steueroberfläche aus Widgets (Fader/Button/Toggle/XY/Farbe). Jedes Widget
// kennt seine OSC-Adresse(n); gesendet wird über api.osc (main-Prozess). Der
// Live-Wert wird mitgespeichert, damit das Pult so aussieht wie zuletzt.

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
  // persistierter Live-Zustand
  value: number // Fader / Toggle (on = value>=0.5)
  x: number // xy 0..1
  y: number // xy 0..1
  r: number // Farbe 0..1
  g: number
  b: number
}

export type OscMode = 'edit' | 'live'

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

let seq = 0
function uid(): string {
  // crypto.randomUUID ist im Renderer verfügbar; Fallback nur zur Sicherheit.
  try {
    return crypto.randomUUID()
  } catch {
    return `w${Date.now().toString(36)}${(seq++).toString(36)}`
  }
}

/** Vernünftige Vorbelegung je Widget-Typ. */
export function makeWidget(type: OscWidgetType): OscWidget {
  const base: OscWidget = {
    id: uid(),
    type,
    label: WIDGET_TYPE_LABEL[type],
    color: WIDGET_COLORS[6],
    address: '/megatoolbox/' + type,
    addressY: '',
    min: 0,
    max: 1,
    onValue: 1,
    offValue: 0,
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
  if (type === 'fader') base.value = 0
  return base
}

/** Beispiel-Oberfläche beim ersten Start – je ein Widget pro Typ. */
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

interface OscStoreState {
  widgets: OscWidget[]
  columns: number
  mode: OscMode
  set: (patch: Partial<Pick<OscStoreState, 'columns' | 'mode'>>) => void
  addWidget: (type: OscWidgetType) => string
  updateWidget: (id: string, patch: Partial<OscWidget>) => void
  removeWidget: (id: string) => void
  moveWidget: (id: string, dir: -1 | 1) => void
  resetSurface: () => void
}

export const useOscSurface = create<OscStoreState>()(
  persist(
    (set, get) => ({
      widgets: seedWidgets(),
      columns: 4,
      mode: 'edit',
      set: (patch) => set(patch),
      addWidget: (type) => {
        const w = makeWidget(type)
        set({ widgets: [...get().widgets, w] })
        return w.id
      },
      updateWidget: (id, patch) =>
        set({ widgets: get().widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) }),
      removeWidget: (id) => set({ widgets: get().widgets.filter((w) => w.id !== id) }),
      moveWidget: (id, dir) => {
        const ws = [...get().widgets]
        const i = ws.findIndex((w) => w.id === id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= ws.length) return
        ;[ws[i], ws[j]] = [ws[j], ws[i]]
        set({ widgets: ws })
      },
      resetSurface: () => set({ widgets: seedWidgets() })
    }),
    {
      name: 'osc-control',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (state.mode !== 'edit' && state.mode !== 'live') state.mode = 'edit'
        if (!Number.isFinite(state.columns)) state.columns = 4
        state.columns = Math.min(8, Math.max(2, Math.round(state.columns)))
        // Felder älterer Versionen auffüllen (sonst NaN/undefined in der UI).
        const def = makeWidget('fader')
        state.widgets = (state.widgets ?? []).map((w) => ({
          ...def,
          ...w,
          id: w.id ?? uid(),
          type: w.type ?? 'fader'
        }))
      }
    }
  )
)
