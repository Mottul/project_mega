// Leichtgewichtige In-App-Benachrichtigungen (Toasts). Ersetzt das stille
// Verschlucken von Fehlern an Stellen, wo ein nativer Dialog (api.notify) zu
// aufdringlich wäre. Von überall aufrufbar (auch außerhalb von React-Komponenten,
// z.B. der Audio-Engine) über das modulweite `toast`-Objekt.

import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  detail?: string
}

interface ToastState {
  items: ToastItem[]
  dismiss: (id: number) => void
}

export const useToasts = create<ToastState>((set) => ({
  items: [],
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) }))
}))

// Anzeigedauer je nach Wichtigkeit (Fehler bleiben am längsten).
const DURATION: Record<ToastKind, number> = {
  info: 4000,
  success: 2500,
  warning: 6000,
  error: 8000
}

let seq = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function push(kind: ToastKind, message: string, detail?: string): void {
  const items = useToasts.getState().items
  // Entprellen: identische, noch sichtbare Meldung -> nur den Timer auffrischen,
  // statt Dubletten zu stapeln (z.B. wenn viele Audio-Elemente gleichzeitig scheitern).
  const existing = items.find(
    (t) => t.kind === kind && t.message === message && t.detail === detail
  )
  const id = existing ? existing.id : ++seq
  if (!existing) useToasts.setState({ items: [...items, { id, kind, message, detail }] })
  const prev = timers.get(id)
  if (prev) clearTimeout(prev)
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      useToasts.getState().dismiss(id)
    }, DURATION[kind])
  )
}

/** Toast entfernen und seinen Auto-Timer aufräumen (für manuelles Schließen). */
export function dismissToast(id: number): void {
  const t = timers.get(id)
  if (t) {
    clearTimeout(t)
    timers.delete(id)
  }
  useToasts.getState().dismiss(id)
}

export const toast = {
  info: (message: string, detail?: string): void => push('info', message, detail),
  success: (message: string, detail?: string): void => push('success', message, detail),
  warning: (message: string, detail?: string): void => push('warning', message, detail),
  error: (message: string, detail?: string): void => push('error', message, detail)
}
