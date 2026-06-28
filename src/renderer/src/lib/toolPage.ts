// Einheitliches Seiten-Gerüst für zentrierte Tool-Layouts: gleiche Außenabstände
// (p-6) und vertikale Rhythmik (space-y-5) überall – nur die Maximalbreite variiert
// je nach Tool. Eine Quelle der Wahrheit statt verstreuter mx-auto-Divs.
// (Klassen als Literale ausgeschrieben, damit Tailwind sie beim Scan findet.)
const WIDTHS = {
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl'
} as const

export type ToolPageWidth = keyof typeof WIDTHS

/** Tailwind-Klassen für einen zentrierten Tool-Seitencontainer. */
export function toolPageClass(width: ToolPageWidth = '2xl'): string {
  return `mx-auto ${WIDTHS[width]} space-y-5 p-6`
}
