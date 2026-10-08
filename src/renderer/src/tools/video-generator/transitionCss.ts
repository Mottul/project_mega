// Übergänge der Live-Vorschau als CSS – nachgebaut nach Messungen am gebündelten ffmpeg (rot ->
// blau, Bild für Bild ausgelesen): Wischen/Schieben kommen von rechts bzw. unten, „Über
// Schwarz/Weiß“ ist das alte Bild nach einem Fünftel weg, der Kreis öffnet sich mit weichem
// Rand ab etwa einem Sechstel, Zoom vergrößert in der ersten Hälfte und blendet in der zweiten.
// Fortschritt p wie xfade: Bild k von T hat p = k/T. Die Datei rechnet xfade selbst – hier
// geht es nur um eine Vorschau, die genauso wirkt. „Vorschau rechnen“ zeigt das Original.

import type { CSSProperties } from 'react'
import type { VgenTransitionKind } from '@shared/types'

export interface TransitionLook {
  /** Ebene des alten (a) und des neuen Elements (b) */
  a: CSSProperties
  b: CSSProperties
  /** Farbe unter beiden Ebenen (Blenden über Schwarz/Weiß); null = Hintergrund */
  under: string | null
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

const pct = (v: number): string => `${Math.round(v * 10000) / 100}%`

function mask(image: string): CSSProperties {
  return { maskImage: image, WebkitMaskImage: image }
}

export function transitionLook(kind: VgenTransitionKind, p: number): TransitionLook {
  const q = 1 - p
  switch (kind) {
    case 'fadeblack':
    case 'fadewhite':
      // xfade: a = (1−p)·smoothstep(0,8..1, 1−p), b = p·(1 − smoothstep(0,2..1, 1−p))
      return {
        a: { opacity: q * smoothstep(0.8, 1, q) },
        b: { opacity: p * (1 - smoothstep(0.2, 1, q)) },
        under: kind === 'fadeblack' ? '#000000' : '#ffffff'
      }
    case 'wipeleft':
      return { a: {}, b: { clipPath: `inset(0 0 0 ${pct(q)})` }, under: null }
    case 'wiperight':
      return { a: {}, b: { clipPath: `inset(0 ${pct(q)} 0 0)` }, under: null }
    case 'slideleft':
      return {
        a: { transform: `translateX(${pct(-p)})` },
        b: { transform: `translateX(${pct(q)})` },
        under: null
      }
    case 'slideright':
      return {
        a: { transform: `translateX(${pct(p)})` },
        b: { transform: `translateX(${pct(-q)})` },
        under: null
      }
    case 'slideup':
      return {
        a: { transform: `translateY(${pct(-p)})` },
        b: { transform: `translateY(${pct(q)})` },
        under: null
      }
    case 'slidedown':
      return {
        a: { transform: `translateY(${pct(p)})` },
        b: { transform: `translateY(${pct(-q)})` },
        under: null
      }
    case 'circleopen': {
      // b deckt, wo Abstand/Eckabstand + 3·(0,5 − p) ≤ 0; weicher Rand eine Eckweite breit
      const r0 = 3 * (p - 0.5)
      return {
        a: {},
        b: mask(
          `radial-gradient(circle farthest-corner at 50% 50%, #000 ${pct(r0)}, transparent ${pct(r0 + 1)})`
        ),
        under: null
      }
    }
    case 'smoothleft':
      return {
        a: {},
        b: mask(`linear-gradient(to right, transparent ${pct(1 - 2 * p)}, #000 ${pct(2 - 2 * p)})`),
        under: null
      }
    case 'smoothright':
      return {
        a: {},
        b: mask(`linear-gradient(to left, transparent ${pct(1 - 2 * p)}, #000 ${pct(2 - 2 * p)})`),
        under: null
      }
    case 'zoomin': {
      // a wächst bis zur Mitte (Zoom 1/zf), danach blendet b über
      const zf = smoothstep(0.5, 1, q)
      return {
        a: { transform: `scale(${Math.min(50, 1 / Math.max(zf, 0.02))})` },
        b: { opacity: 1 - smoothstep(0, 0.5, q) },
        under: null
      }
    }
    // fade, dissolve (zufälliges Pixelmuster -> als Blende) und alles Unbekannte
    default:
      return { a: {}, b: { opacity: p }, under: null }
  }
}

/** Ton im Übergang: xfade/acrossfade blenden linear (c1=tri, c2=tri). */
export function transitionAudio(p: number): { a: number; b: number } {
  return { a: 1 - p, b: p }
}
