// Fenster der Werkzeuge. Kleine Werkzeuge (Rechner, Umrechner) brauchen wenig Platz und öffnen
// sich IMMER in einem eigenen, passend kleinen Fenster – nie im Hauptfenster, das bleibt für die
// großen Werkzeuge frei. Je kleinem Werkzeug gibt es höchstens ein Fenster; Größe und Lage
// merkt sich die App. Rein (main und Renderer nutzen es), getestet in toolWindows.test.ts.

export interface ToolWindowSize {
  /** Inhaltsgröße in px (ohne Fensterrahmen) */
  width: number
  height: number
  minWidth: number
  minHeight: number
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Hauptfenster und große Werkzeuge in eigenen Fenstern */
export const TOOL_WINDOW: ToolWindowSize = {
  width: 1240,
  height: 840,
  minWidth: 960,
  minHeight: 620
}

const SMALL_MIN = { minWidth: 400, minHeight: 300 }

/**
 * Inhaltsgröße je kleinem Werkzeug: 600 px Breite (Rechner-Seite), Höhe = schlanke Kopfleiste
 * (41 px) + Seite, gemessen im echten Fenster (Oktober 2026). Kameraobjektiv und Rigging-Last
 * sind höher als ein Laptop-Bildschirm und scrollen ab 900 px. Ändert sich ein Werkzeug,
 * neu messen (e2e/layout.mjs prüft, dass die kleinen Fenster ohne Scrollen auskommen).
 */
export const SMALL_TOOLS: Readonly<Record<string, { width: number; height: number }>> = {
  'circle-calc': { width: 600, height: 430 },
  'dmx-address': { width: 600, height: 480 },
  'throw-ratio': { width: 600, height: 670 },
  'audio-delay': { width: 600, height: 730 },
  'projector-lumen': { width: 600, height: 780 },
  timecode: { width: 600, height: 800 },
  'power-load': { width: 600, height: 920 },
  'camera-lens': { width: 600, height: 900 },
  rigging: { width: 600, height: 900 }
}

/** Werkzeuge, deren Inhalt höher ist als ihr Fenster (scrollen bewusst) */
export const SCROLLING_SMALL_TOOLS = ['camera-lens', 'rigging']

/** Kennzeichen in der Route (`/tool/<id>?fenster=1`): Das Werkzeug läuft in seinem eigenen Fenster. */
export const OWN_WINDOW_PARAM = 'fenster'

export function isSmallTool(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(SMALL_TOOLS, id)
}

export function toolWindowSize(id: string): ToolWindowSize {
  const s = isSmallTool(id) ? SMALL_TOOLS[id] : null
  return s ? { ...s, ...SMALL_MIN } : TOOL_WINDOW
}

/** Nur so viel Überlappung mit einem Bildschirm, dass man das Fenster noch greifen kann */
const MIN_VISIBLE = { width: 120, height: 60 }

/**
 * Gemerkte Lage wiederherstellen – aber nur, wenn das Fenster noch auf einem Bildschirm liegt
 * (Monitor abgesteckt, Auflösung gewechselt). Die Größe bleibt zwischen Mindestmaß und
 * Arbeitsfläche dieses Bildschirms. Sonst null: Das Fenster erscheint dann zentriert.
 */
export function restoreBounds(
  saved: unknown,
  workAreas: WindowBounds[],
  size: ToolWindowSize
): WindowBounds | null {
  if (!saved || typeof saved !== 'object') return null
  const s = saved as Record<string, unknown>
  const nums = [s.x, s.y, s.width, s.height]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const b = {
    x: s.x as number,
    y: s.y as number,
    width: s.width as number,
    height: s.height as number
  }
  const area = workAreas.find((a) => {
    const w = Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x)
    const h = Math.min(b.y + b.height, a.y + a.height) - Math.max(b.y, a.y)
    return w >= MIN_VISIBLE.width && h >= MIN_VISIBLE.height
  })
  if (!area) return null
  return {
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(Math.min(Math.max(b.width, size.minWidth), area.width)),
    height: Math.round(Math.min(Math.max(b.height, size.minHeight), area.height))
  }
}
