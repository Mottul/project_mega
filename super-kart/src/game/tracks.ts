/**
 * Streckendefinitionen. Eine Strecke ist nur eine Handvoll Stützpunkte plus
 * ein Farbthema - Textur, Kollisionskarte, Wegpunkte und Deko entstehen daraus
 * zur Laufzeit in trackgen.ts.
 */

export interface Theme {
  skyTop: string
  skyBottom: string
  /** Farbe der fernen Bergsilhouette; null = keine Berge. */
  ridge: string | null
  sun: string | null
  /** Zwei Grüntöne o. ä. für das Gelände-Schachbrett. */
  ground: [string, string]
  road: [string, string]
  curb: [string, string]
  /** Nebelfarbe am Horizont (RGB 0..255). */
  fog: [number, number, number]
  decor: 'trees' | 'cactus' | 'ice' | 'rock' | 'pylon' | 'none'
  /** True: außerhalb der Strecke ist Abgrund statt Gelände. */
  abyss?: boolean
}

export interface TrackDef {
  id: string
  name: string
  kind: 'race' | 'battle'
  /** Runden im Grand Prix / Einzelrennen. */
  laps: number
  roadWidth: number
  /** Geschlossener Streckenzug in Weltkoordinaten. */
  points: [number, number][]
  theme: Theme
  music: number
  /** Fortschrittspositionen (0..1) für Boost-Felder. */
  boostAt: number[]
  /** Fortschrittspositionen (0..1) für Item-Reihen. */
  itemsAt: number[]
  /** Nur für Arenen: rechteckige Hindernisse [x, y, halbBreite, halbHöhe]. */
  blocks?: [number, number, number, number][]
}

const GRASS: Theme = {
  skyTop: '#1d3f8f',
  skyBottom: '#7fb6ef',
  ridge: '#2a6a3e',
  sun: '#fff4c2',
  ground: ['#2f7d3a', '#276b32'],
  road: ['#585b66', '#4e515c'],
  curb: ['#e8402f', '#f4f2ee'],
  fog: [150, 195, 230],
  decor: 'trees',
}

const DESERT: Theme = {
  skyTop: '#2b5fa8',
  skyBottom: '#f3c98a',
  ridge: '#a97a4c',
  sun: '#fff0b0',
  ground: ['#d9b273', '#cfa663'],
  road: ['#6b6257', '#605850'],
  curb: ['#e0e0e0', '#c2432f'],
  fog: [232, 202, 150],
  decor: 'cactus',
}

const SNOW: Theme = {
  skyTop: '#16244d',
  skyBottom: '#b8cfe6',
  ridge: '#7f95b5',
  sun: '#e8f2ff',
  ground: ['#e9f1f7', '#dbe6ef'],
  road: ['#6a7079', '#5e646d'],
  curb: ['#2f6fb5', '#f2f7fb'],
  fog: [214, 230, 244],
  decor: 'ice',
}

const VOLCANO: Theme = {
  skyTop: '#2a0b18',
  skyBottom: '#c4462a',
  ridge: '#5a2320',
  sun: '#ffb257',
  ground: ['#3a2420', '#2e1c1a'],
  road: ['#4b4442', '#413a39'],
  curb: ['#f0912c', '#241a19'],
  fog: [148, 74, 54],
  decor: 'rock',
}

const NEON: Theme = {
  skyTop: '#05010f',
  skyBottom: '#20074a',
  ridge: null,
  sun: null,
  ground: ['#0a0418', '#0a0418'],
  road: ['#2a2050', '#241b48'],
  curb: ['#ff3fb4', '#3fe9ff'],
  fog: [24, 8, 52],
  decor: 'pylon',
  abyss: true,
}

const ARENA_THEME: Theme = {
  skyTop: '#101a33',
  skyBottom: '#4a6b9c',
  ridge: '#26364f',
  sun: null,
  ground: ['#2b3550', '#252e46'],
  road: ['#6d6a7d', '#635f73'],
  curb: ['#ffd23f', '#2b2b3a'],
  fog: [90, 110, 150],
  decor: 'none',
}

export const RACE_TRACKS: TrackDef[] = [
  {
    id: 'wiese',
    name: 'Grüne Wiese',
    kind: 'race',
    laps: 3,
    roadWidth: 330,
    points: [
      [1100, 700],
      [2150, 610],
      [3060, 800],
      [3420, 1500],
      [3180, 2180],
      [3450, 2880],
      [2880, 3360],
      [1880, 3320],
      [1230, 2900],
      [960, 2100],
      [800, 1380],
    ],
    theme: GRASS,
    music: 0,
    boostAt: [0.12, 0.62],
    itemsAt: [0.28, 0.55, 0.82],
  },
  {
    id: 'wueste',
    name: 'Wüstenpiste',
    kind: 'race',
    laps: 3,
    roadWidth: 310,
    points: [
      [700, 900],
      [1600, 720],
      [2450, 680],
      [3300, 1010],
      [3420, 1900],
      [2620, 2180],
      [3280, 2700],
      [3220, 3340],
      [2200, 3460],
      [1180, 3220],
      [660, 2360],
      [820, 1520],
    ],
    theme: DESERT,
    music: 1,
    boostAt: [0.05, 0.45, 0.78],
    itemsAt: [0.2, 0.5, 0.72, 0.92],
  },
  {
    id: 'frost',
    name: 'Frostkurve',
    kind: 'race',
    laps: 3,
    roadWidth: 275,
    points: [
      [2048, 600],
      [2720, 760],
      [3120, 1200],
      [2900, 1720],
      [3320, 2120],
      [3340, 2720],
      [2780, 3200],
      [2080, 3160],
      [1680, 2700],
      [1240, 3010],
      [800, 2580],
      [1010, 1980],
      [760, 1480],
      [1260, 1040],
      [1700, 880],
    ],
    theme: SNOW,
    music: 0,
    boostAt: [0.36, 0.88],
    itemsAt: [0.15, 0.44, 0.68, 0.9],
  },
  {
    id: 'vulkan',
    name: 'Vulkanring',
    kind: 'race',
    laps: 3,
    roadWidth: 300,
    points: [
      [1400, 780],
      [2600, 720],
      [3400, 1300],
      [3300, 2000],
      [2500, 2380],
      [3220, 3000],
      [2380, 3400],
      [1380, 3300],
      [900, 2700],
      [1420, 2100],
      [840, 1580],
    ],
    theme: VOLCANO,
    music: 1,
    boostAt: [0.22, 0.55, 0.83],
    itemsAt: [0.1, 0.4, 0.66, 0.88],
  },
  {
    id: 'neon',
    name: 'Neon-Nacht',
    kind: 'race',
    laps: 3,
    roadWidth: 250,
    points: [
      [2048, 520],
      [2900, 700],
      [3480, 1320],
      [3120, 1900],
      [3520, 2500],
      [3000, 3200],
      [2200, 3480],
      [1400, 3220],
      [1600, 2560],
      [1000, 2200],
      [640, 1560],
      [1200, 900],
    ],
    theme: NEON,
    music: 0,
    boostAt: [0.08, 0.33, 0.6, 0.86],
    itemsAt: [0.2, 0.47, 0.74, 0.95],
  },
]

export const BATTLE_ARENAS: TrackDef[] = [
  {
    id: 'block-arena',
    name: 'Block-Arena',
    kind: 'battle',
    laps: 0,
    roadWidth: 0,
    points: [
      [1150, 1150],
      [2946, 1150],
      [2946, 2946],
      [1150, 2946],
    ],
    theme: ARENA_THEME,
    music: 2,
    boostAt: [],
    itemsAt: [],
    blocks: [
      [2048, 2048, 240, 240],
      [1500, 1500, 150, 150],
      [2596, 1500, 150, 150],
      [1500, 2596, 150, 150],
      [2596, 2596, 150, 150],
    ],
  },
  {
    id: 'kreuz-arena',
    name: 'Kreuz-Arena',
    kind: 'battle',
    laps: 0,
    roadWidth: 0,
    points: [
      [1000, 1000],
      [3096, 1000],
      [3096, 3096],
      [1000, 3096],
    ],
    theme: { ...ARENA_THEME, ground: ['#3a2a44', '#332440'], curb: ['#65e0a0', '#20202c'] },
    music: 2,
    boostAt: [],
    itemsAt: [],
    blocks: [
      [2048, 1420, 620, 90],
      [2048, 2676, 620, 90],
      [1420, 2048, 90, 620],
      [2676, 2048, 90, 620],
    ],
  },
]

export const ALL_TRACKS = [...RACE_TRACKS, ...BATTLE_ARENAS]

export function trackById(id: string): TrackDef | undefined {
  return ALL_TRACKS.find((t) => t.id === id)
}
