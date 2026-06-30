// Umschaltbarer Marken-Akzent (Primärfarbe). Wie beim Theme wird der Wert SYNCHRON
// vor dem ersten Rendern angewandt (kein Farb-Flackern). Quelle der Wahrheit bleibt
// settings.json; localStorage spiegelt nur für den Boot.
//
// Technik: ein einziges <style id="accent-vars"> überschreibt --primary/--ring/
// --primary-foreground für :root (dunkel) und :root.light (hell). So bleibt die
// bestehende Hell/Dunkel-Logik aus main.css unangetastet – wir tauschen nur Werte.

import type { AccentId } from '@shared/types'

interface AccentVars {
  /** "H S% L%" für --primary und --ring */
  p: string
  /** "H S% L%" für --primary-foreground (Text auf Akzentflächen) */
  pf: string
}
interface Accent {
  id: AccentId
  label: string
  dark: AccentVars
  light: AccentVars
}

// Werte je Akzent für dunkel + hell (hell etwas kräftiger/dunkler, damit der
// Akzent auf weißem Grund lesbar bleibt – analog zur Gold-Marke in main.css).
export const ACCENTS: Accent[] = [
  {
    id: 'gold',
    label: 'Gold',
    dark: { p: '46 100% 59%', pf: '240 8% 8%' },
    light: { p: '41 96% 44%', pf: '40 45% 11%' }
  },
  {
    id: 'amber',
    label: 'Bernstein',
    dark: { p: '32 100% 55%', pf: '30 45% 8%' },
    light: { p: '28 92% 45%', pf: '30 45% 10%' }
  },
  {
    id: 'teal',
    label: 'Türkis',
    dark: { p: '172 80% 45%', pf: '180 60% 6%' },
    light: { p: '174 84% 30%', pf: '0 0% 100%' }
  },
  {
    id: 'blue',
    label: 'Blau',
    dark: { p: '213 94% 62%', pf: '214 80% 10%' },
    light: { p: '221 83% 50%', pf: '0 0% 100%' }
  },
  {
    id: 'violet',
    label: 'Violett',
    dark: { p: '258 92% 68%', pf: '258 60% 10%' },
    light: { p: '262 83% 55%', pf: '0 0% 100%' }
  },
  {
    id: 'pink',
    label: 'Pink',
    dark: { p: '330 90% 64%', pf: '330 60% 10%' },
    light: { p: '333 80% 50%', pf: '0 0% 100%' }
  },
  {
    id: 'green',
    label: 'Grün',
    dark: { p: '142 70% 48%', pf: '144 60% 7%' },
    light: { p: '142 72% 33%', pf: '0 0% 100%' }
  }
]

const STORAGE_KEY = 'av-accent'
const STYLE_ID = 'accent-vars'

export function accentById(id: string): Accent {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]
}

/** Vorschaufarbe für den Wähler (Hue ist die Identität, daher dunkle Variante). */
export function accentSwatch(a: Accent): string {
  return `hsl(${a.dark.p})`
}

function cssFor(a: Accent): string {
  return (
    `:root{--primary:${a.dark.p};--ring:${a.dark.p};--primary-foreground:${a.dark.pf}}` +
    `:root.light{--primary:${a.light.p};--ring:${a.light.p};--primary-foreground:${a.light.pf}}`
  )
}

/** Akzent als CSS-Variablen am <head> setzen (überschreibt main.css-Werte). */
export function applyAccent(id: AccentId): void {
  const a = accentById(id)
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = cssFor(a)
}

export function persistAccent(id: AccentId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // localStorage nicht verfügbar -> nur für diese Sitzung
  }
}

export function storedAccent(): AccentId {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && ACCENTS.some((a) => a.id === v)) return v as AccentId
  } catch {
    // ignorieren
  }
  return 'gold'
}
