// Eingehendes OSC-Feedback auf die Kacheln der Fläche spiegeln (ohne erneut zu senden).

import type { OscFeedback } from '@shared/types'
import { useOscSurface, type OscWidget } from './store'
import { labelForValue } from './mapping'
import { clamp, clamp01 } from './oscShared'

/** Eingehendes Feedback in passende Widgets spiegeln (ohne erneut zu senden). */
export function reflectFeedback(fb: OscFeedback): void {
  const toNum = (a: string | number | boolean | undefined): number | null =>
    typeof a === 'number' ? a : typeof a === 'boolean' ? (a ? 1 : 0) : null
  const num = toNum(fb.args[0])
  const st = useOscSurface.getState()
  for (const w of st.currentSet().widgets) {
    if (w.target === 'nova') continue // NovaStar-Widgets kennen kein OSC-Feedback
    if (w.type === 'color' && w.address === fb.address && num != null) {
      // r,g,b(,a) aus den ersten Argumenten – fehlende Kanäle bleiben unverändert.
      const patch: Partial<OscWidget> = { r: clamp01(num) }
      const g = toNum(fb.args[1])
      const b = toNum(fb.args[2])
      const a = toNum(fb.args[3])
      if (g != null) patch.g = clamp01(g)
      if (b != null) patch.b = clamp01(b)
      if (a != null) patch.a = clamp01(a)
      st.updateWidget(w.id, patch)
      continue
    }
    // Text-Anzeige: beliebige Argumente (auch Strings) übernehmen – z.B.
    // Blendmodus oder Surface-Name von MadMapper. Muss VOR dem num-Guard stehen,
    // da String-Feedback keinen numerischen Wert hat. Kommt eine ZAHL und sind
    // Wert→Text-Zuordnungen gepflegt, wird der passende Name gezeigt (MadMapper
    // sendet für Enums nur Zahlen, keinen Klartext).
    if (w.type === 'meter' && w.source === 'text' && w.address === fb.address) {
      const first = fb.args[0]
      const text =
        typeof first === 'number' && w.items.length > 0
          ? labelForValue(first, w.items)
          : fb.args.map((a) => (typeof a === 'boolean' ? (a ? 'An' : 'Aus') : String(a))).join(' ')
      st.updateWidget(w.id, { text })
      continue
    }
    if (num == null) continue
    if ((w.type === 'fader' || (w.type === 'knob' && !w.endless)) && w.address === fb.address) {
      const lo = Math.min(w.min, w.max)
      const hi = Math.max(w.min, w.max)
      st.updateWidget(w.id, { value: clamp(num, lo, hi) })
    } else if (w.type === 'toggle' && w.address === fb.address) {
      st.updateWidget(w.id, { value: num >= 0.5 ? 1 : 0 })
    } else if (w.type === 'xy') {
      if (w.address === fb.address) st.updateWidget(w.id, { x: clamp01(num) })
      if (w.addressY === fb.address) st.updateWidget(w.id, { y: clamp01(num) })
    } else if (w.type === 'meter' && w.source === 'osc' && w.address === fb.address) {
      st.updateWidget(w.id, { value: num })
    } else if (w.type === 'select') {
      // Option, deren Adresse+Wert zum Feedback passt -> als aktiv markieren.
      const idx = w.items.findIndex(
        (it) => (it.address || w.address) === fb.address && it.value === num
      )
      if (idx >= 0) st.updateWidget(w.id, { value: idx })
    }
  }
}
