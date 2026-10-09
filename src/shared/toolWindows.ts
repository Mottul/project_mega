// Fenster der Werkzeuge. Kleine Werkzeuge (Rechner, Umrechner) brauchen wenig Platz und öffnen
// sich IMMER in einem eigenen, passend kleinen Fenster – nie im Hauptfenster, das bleibt für die
// großen Werkzeuge frei. Je kleinem Werkzeug gibt es höchstens ein Fenster; Lage und Breite
// merkt sich die App, die Höhe folgt dem Inhalt. Rein (main und Renderer), getestet in
// toolWindows.test.ts.

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

/**
 * Kleine Werkzeuge lassen sich bis auf Handybreite schmal ziehen: Die Felder setzen ihre
 * Beschriftung dann über die Eingabe (tools/_calc/ui).
 */
const SMALL_MIN = { minWidth: 320, minHeight: 200 }

/**
 * Erste Höhe, bis der Inhalt gemessen ist. Das Fenster erscheint erst danach (main), die Zahl
 * sieht also niemand – sie muss nur in jeden Bildschirm passen.
 */
const SMALL_START_HEIGHT = 600

/** Eine Spalte: Felder untereinander */
const ONE_COLUMN = 520
/**
 * Zwei Karten nebeneinander (tools/_calc/ui: ab 2 × 22rem + Abstand + Rand ≈ 772 px). Für
 * Rechner, die einspaltig höher als ein Laptop-Bildschirm wären.
 */
const TWO_COLUMNS = 880

/** Breite je kleinem Werkzeug; die Höhe misst das Fenster selbst (fitHeight). */
export const SMALL_TOOLS: Readonly<Record<string, { width: number }>> = {
  'circle-calc': { width: ONE_COLUMN },
  'dmx-address': { width: ONE_COLUMN },
  'throw-ratio': { width: ONE_COLUMN },
  'audio-delay': { width: ONE_COLUMN },
  'projector-lumen': { width: ONE_COLUMN },
  timecode: { width: ONE_COLUMN },
  'power-load': { width: TWO_COLUMNS },
  'camera-lens': { width: TWO_COLUMNS },
  rigging: { width: TWO_COLUMNS }
}

/** Kennzeichen in der Route (`/tool/<id>?fenster=1`): Das Werkzeug läuft in seinem eigenen Fenster. */
export const OWN_WINDOW_PARAM = 'fenster'

export function isSmallTool(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(SMALL_TOOLS, id)
}

export function toolWindowSize(id: string): ToolWindowSize {
  const s = isSmallTool(id) ? SMALL_TOOLS[id] : null
  return s ? { width: s.width, height: SMALL_START_HEIGHT, ...SMALL_MIN } : TOOL_WINDOW
}

/**
 * Höhe des Fensterinhalts für die gemeldete Inhaltshöhe der Seite: nie kleiner als das
 * Mindestmaß, nie höher als der Bildschirm (dann scrollt die Seite). null = Meldung unbrauchbar
 * (kommt aus dem Renderer, also prüfen).
 */
export function fitHeight(requested: unknown, maxHeight: number, minHeight: number): number | null {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) return null
  return Math.round(Math.max(minHeight, Math.min(requested, maxHeight)))
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
