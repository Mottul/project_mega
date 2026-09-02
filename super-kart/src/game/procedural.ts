import { angleDelta, clamp, TAU } from '../core/math'
import { Rng } from '../core/rng'
import { WORLD_SIZE } from './config'
import { ARENA_THEMES, RACE_THEMES, type TrackDef } from './tracks'
import { buildCenterline } from './trackgen'

/**
 * Zufallsstrecken. Der Seed bestimmt die Strecke vollständig - dieselbe Zahl
 * ergibt immer dieselbe Strecke, damit man eine gute Strecke wiederfinden und
 * weitergeben kann.
 *
 * Erzeugen allein reicht nicht: Eine Schleife darf sich nicht selbst
 * schneiden (sonst überlappt die Fahrbahn und die Rundenzählung bricht) und
 * keine Kurve darf enger sein, als ein Kart fahren kann. Deshalb wird jeder
 * Vorschlag geprüft und bei Bedarf neu gewürfelt.
 */

const NAME_A = [
  'Goldene',
  'Wilde',
  'Stille',
  'Rasende',
  'Späte',
  'Weite',
  'Nasse',
  'Steile',
  'Krumme',
  'Alte',
  'Heiße',
  'Eisige',
]
const NAME_B = [
  'Schleife',
  'Senke',
  'Kurve',
  'Passage',
  'Bucht',
  'Schneise',
  'Spirale',
  'Kehre',
  'Rampe',
  'Furche',
]

/** Grenzwerte, ab denen eine Strecke als unfahrbar gilt. */
const LIMITS = {
  /** Kleinster Abstand zwischen zwei nicht benachbarten Streckenteilen. */
  separation: 1.35,
  /** Größte Richtungsänderung je Abtastschritt (rad) - begrenzt den Kurvenradius. */
  curvature: 0.12,
  /** Abstand zum Weltrand als Vielfaches der Streckenbreite. */
  margin: 1.2,
  attempts: 80,
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffff) + 1
}

export function trackName(seed: number): string {
  const rng = new Rng(seed ^ 0x5bf03635)
  return `${rng.pick(NAME_A)} ${rng.pick(NAME_B)}`
}

/**
 * Prüft eine Punktfolge auf Selbstüberschneidung, zu enge Kurven und
 * Weltgrenzen. Gibt die Fehlerursache zurück (null = brauchbar).
 */
export function validateLoop(points: [number, number][], roadWidth: number): string | null {
  const wps = buildCenterline(points)
  const n = wps.length
  const margin = roadWidth * LIMITS.margin

  for (const wp of wps) {
    if (wp.x < margin || wp.y < margin || wp.x > WORLD_SIZE - margin || wp.y > WORLD_SIZE - margin) {
      return 'außerhalb der Welt'
    }
  }

  // Krümmung zuerst: linear teuer und der mit Abstand häufigste Ablehngrund.
  for (let i = 0; i < n; i++) {
    const delta = Math.abs(angleDelta(wps[i]!.dir, wps[(i + 1) % n]!.dir))
    if (delta > LIMITS.curvature) return 'Kurve zu eng'
  }

  // Zwei Streckenteile dürfen sich nur berühren, wenn sie in der Kurve
  // benachbart sind - alles andere wäre eine Kreuzung. Ein Raster über die
  // Karte hält den Test linear statt quadratisch.
  const minSep = roadWidth * LIMITS.separation
  const skip = Math.ceil(minSep / 26) + 4
  const cell = minSep
  const grid = new Map<string, number[]>()
  const key = (x: number, y: number) => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`
  for (let i = 0; i < n; i++) {
    const k = key(wps[i]!.x, wps[i]!.y)
    const bucket = grid.get(k)
    if (bucket) bucket.push(i)
    else grid.set(k, [i])
  }
  for (let i = 0; i < n; i++) {
    const a = wps[i]!
    const cx = Math.floor(a.x / cell)
    const cy = Math.floor(a.y / cell)
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (const j of grid.get(`${cx + ox}:${cy + oy}`) ?? []) {
          if (j <= i) continue
          // Abstand entlang der Schleife, nicht im Index - Anfang und Ende
          // sind ebenfalls benachbart.
          if (Math.min(j - i, n - (j - i)) < skip) continue
          const b = wps[j]!
          if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < minSep * minSep) return 'Strecke kreuzt sich'
        }
      }
    }
  }

  return null
}

/**
 * Die Schleife wird als Radiusfunktion über dem Winkel gebaut: r(theta) ist
 * eine Summe weniger Sinusschwingungen. Das hat zwei Vorteile - die Kurve ist
 * sternförmig um die Mitte und kann sich damit gar nicht selbst schneiden, und
 * die Oberwellen erzeugen von selbst Wechsel aus Geraden, weiten Bögen und
 * engeren Kurven statt eines Kreises.
 */
function proposeLoop(rng: Rng, count: number, roadWidth: number, amplitude: number): [number, number][] {
  const center = WORLD_SIZE / 2
  const maxR = WORLD_SIZE / 2 - roadWidth * LIMITS.margin - roadWidth * 0.6

  // Aus dem gemischten Vorrat ziehen statt zu würfeln und zu verwerfen -
  // letzteres kann sich festfahren, wenn alle Kandidaten vergeben sind.
  const pool = [2, 3, 4, 5, 6]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    const tmp = pool[i]!
    pool[i] = pool[j]!
    pool[j] = tmp
  }
  const harmonics: { k: number; amp: number; phase: number }[] = []
  const terms = rng.int(2, 4)
  for (let i = 0; i < terms; i++) {
    const k = pool[i]!
    // Höhere Oberwellen schwächer, sonst wird die Strecke zappelig.
    harmonics.push({
      k,
      amp: rng.range(0.14, 0.36) * (2.2 / (k + 0.8)) * amplitude,
      phase: rng.range(0, TAU),
    })
  }

  const mid = 0.7
  const radiusAt = (theta: number) => {
    let r = mid
    for (const h of harmonics) r += h.amp * Math.sin(h.k * theta + h.phase)
    return clamp(r, 0.32, 1) * maxR
  }

  const points: [number, number][] = []
  const start = rng.range(0, TAU)
  for (let i = 0; i < count; i++) {
    // Leicht ungleiche Winkelschritte lockern das Raster auf.
    const theta = start + (i / count) * TAU + rng.range(-0.3, 0.3) * (TAU / count / 2)
    const r = radiusAt(theta)
    points.push([center + Math.cos(theta) * r, center + Math.sin(theta) * r])
  }
  return points
}

/**
 * Zieht jeden Punkt etwas in Richtung seiner Nachbarn. Das entschärft genau
 * die beiden Fehlerquellen der Zufallsschleife: zu enge Kurven und
 * Ausbuchtungen, die sich selbst kreuzen.
 */
function smooth(points: [number, number][], strength: number, iterations: number): [number, number][] {
  let current = points
  for (let it = 0; it < iterations; it++) {
    const next: [number, number][] = []
    for (let i = 0; i < current.length; i++) {
      const prev = current[(i - 1 + current.length) % current.length]!
      const self = current[i]!
      const following = current[(i + 1) % current.length]!
      const midX = (prev[0] + following[0]) / 2
      const midY = (prev[1] + following[1]) / 2
      next.push([self[0] + (midX - self[0]) * strength, self[1] + (midY - self[1]) * strength])
    }
    current = next
  }
  return current
}

export interface GeneratedTrack extends TrackDef {
  /** Seed, aus dem diese Strecke stammt. */
  seed: number
}

/**
 * Würfelt so lange Schleifen, bis eine die Prüfung besteht. Getrennt
 * exportiert, damit sich messen lässt, wie oft der Zufall überhaupt trägt.
 */
export function buildLoop(
  rng: Rng,
  roadWidth: number
): { points: [number, number][]; attempts: number; fallback: boolean } {
  for (let attempt = 0; attempt < LIMITS.attempts; attempt++) {
    // Mit jedem Fehlversuch etwas weniger Punkte: weniger Punkte bedeutet
    // weitere Kurven und damit bessere Chancen auf eine gültige Schleife.
    const count = rng.int(11, 16)
    // Mit jedem Fehlversuch flacher und glatter: erst Charakter behalten,
    // notfalls eine ruhigere, aber garantiert fahrbare Linie.
    const amplitude = Math.max(0.25, 1 - attempt * 0.035)
    const raw = proposeLoop(rng, count, roadWidth, amplitude)
    const candidate = smooth(raw, Math.min(0.4, 0.08 + attempt * 0.02), 1 + Math.floor(attempt / 20))
    if (validateLoop(candidate, roadWidth) === null) {
      return { points: candidate, attempts: attempt + 1, fallback: false }
    }
  }
  return { points: fallbackLoop(roadWidth), attempts: LIMITS.attempts, fallback: true }
}

export function generateRaceTrack(seed: number): GeneratedTrack {
  const rng = new Rng(seed)
  const theme = RACE_THEMES[rng.int(0, RACE_THEMES.length - 1)]!
  const roadWidth = Math.round(rng.range(255, 335))
  const { points } = buildLoop(rng, roadWidth)

  const boostCount = rng.int(1, 3)
  const itemCount = rng.int(3, 4)

  return {
    id: `zufall-${seed}`,
    name: trackName(seed),
    kind: 'race',
    laps: 3,
    roadWidth,
    points,
    theme,
    music: rng.int(0, 1),
    boostAt: spread(rng, boostCount),
    itemsAt: spread(rng, itemCount),
    seed,
  }
}

/** Verteilt n Positionen (0..1) mit Abstand über die Runde. */
function spread(rng: Rng, count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    out.push((i + 0.35 + rng.range(0, 0.3)) / count)
  }
  return out
}

/** Garantiert gültige Ausweichstrecke, falls das Würfeln nicht konvergiert. */
function fallbackLoop(roadWidth: number): [number, number][] {
  const center = WORLD_SIZE / 2
  const rx = WORLD_SIZE / 2 - roadWidth * 2
  const ry = rx * 0.78
  const points: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU
    points.push([center + Math.cos(a) * rx, center + Math.sin(a) * ry])
  }
  return points
}

/**
 * Zufallsarena. Die Hindernisse werden auf einem Raster platziert und an
 * beiden Achsen gespiegelt - so hat kein Startplatz einen Vorteil und
 * zwischen den Blöcken bleiben garantiert Gassen.
 */
export function generateArena(seed: number): GeneratedTrack {
  const rng = new Rng(seed ^ 0x1d872b41)
  const theme = ARENA_THEMES[rng.int(0, ARENA_THEMES.length - 1)]!
  const center = WORLD_SIZE / 2
  const half = Math.round(rng.range(820, 1060))
  const grid = 5
  const cell = (half * 2) / grid
  const blockHalf = cell * 0.26

  const blocks: [number, number, number, number][] = []
  const seen = new Set<string>()
  const cells = rng.int(2, 4)
  for (let i = 0; i < cells; i++) {
    const gx = rng.int(0, Math.floor(grid / 2))
    const gy = rng.int(0, Math.floor(grid / 2))
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx = center + sx * (gx * cell)
        const cy = center + sy * (gy * cell)
        const key = `${Math.round(cx)}:${Math.round(cy)}`
        if (seen.has(key)) continue
        seen.add(key)
        // Nicht in die Wand hineinbauen.
        if (Math.abs(cx - center) + blockHalf > half - cell * 0.5) continue
        if (Math.abs(cy - center) + blockHalf > half - cell * 0.5) continue
        blocks.push([cx, cy, blockHalf, blockHalf])
      }
    }
  }
  if (blocks.length === 0) blocks.push([center, center, blockHalf, blockHalf])

  return {
    id: `arena-${seed}`,
    name: trackName(seed),
    kind: 'battle',
    laps: 0,
    roadWidth: 0,
    points: [
      [center - half, center - half],
      [center + half, center - half],
      [center + half, center + half],
      [center - half, center + half],
    ],
    theme,
    music: 2,
    boostAt: [],
    itemsAt: [],
    blocks,
    seed,
  }
}

export function generateTrack(kind: 'race' | 'battle', seed: number): GeneratedTrack {
  return kind === 'race' ? generateRaceTrack(seed) : generateArena(seed)
}
