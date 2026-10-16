// Zusatz im Fenstertitel vor dem Werkzeugnamen, z. B. die gebundene Projektdatei
// („● Messe Dornbirn 2026 – LED-Wall-Konfigurator · Mottulbox“). Hilft bei mehreren Fenstern in der
// Taskleiste. ToolHost setzt den Titel, Werkzeuge setzen nur den Zusatz (je Fenster).

import { create } from 'zustand'

export const useTitleDetail = create<{ detail: string | null }>(() => ({ detail: null }))

export function setTitleDetail(detail: string | null): void {
  if (useTitleDetail.getState().detail !== detail) useTitleDetail.setState({ detail })
}
