// Zustand des LED-Wall-Konfigurators – per zustand/persist in localStorage,
// damit eine angefangene Planung Tool-Wechsel UND App-Neustart übersteht.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_MODULE_KEY } from './data'
import { resizeGrid, type BuilderSegment } from './math'

export type BuildMode = 'stacked' | 'flying'
export type CurveMode = 'circle' | 'segment' | 'builder' | 'squircle'

interface LedWallState {
  moduleKey: string
  widthM: string // Eingaben als Text (Komma-tolerant), geparst wird beim Rechnen
  heightM: string
  projectName: string
  customerName: string
  buildMode: BuildMode
  sig: number[][] // -1 = frei, sonst Ketten-Index
  pwr: number[][]
  sigChain: number
  pwrChain: number
  curveMode: CurveMode
  segChord: string
  segSag: string
  builderSegs: BuilderSegment[]
  sqW: string
  sqD: string
  sqCorner: number

  set: (patch: Partial<LedWallState>) => void
  /** Grids an neue Modulzahl anpassen (Zuordnungen im Überlapp bleiben erhalten). */
  ensureGridSize: (rows: number, cols: number) => void
  setCell: (grid: 'sig' | 'pwr', row: number, col: number) => void
  fillLine: (grid: 'sig' | 'pwr', kind: 'row' | 'col', index: number) => void
  resetGrid: (grid: 'sig' | 'pwr') => void
}

export const useLedWall = create<LedWallState>()(
  persist(
    (set, get) => ({
      moduleKey: DEFAULT_MODULE_KEY,
      widthM: '4',
      heightM: '2,5',
      projectName: '',
      customerName: '',
      buildMode: 'stacked',
      sig: [],
      pwr: [],
      sigChain: 0,
      pwrChain: 0,
      curveMode: 'circle',
      segChord: '4',
      segSag: '0,5',
      builderSegs: [
        { type: 'straight', count: 3 },
        { type: 'curved', count: 6, angle: 45, dir: 'convex' },
        { type: 'straight', count: 3 }
      ],
      sqW: '4',
      sqD: '2',
      sqCorner: 3,

      set: (patch) => set(patch),

      ensureGridSize: (rows, cols) => {
        const { sig, pwr } = get()
        if (sig.length === rows && (sig[0]?.length ?? 0) === cols) return
        set({ sig: resizeGrid(sig, rows, cols), pwr: resizeGrid(pwr, rows, cols) })
      },

      setCell: (grid, row, col) => {
        const s = get()
        const chain = grid === 'sig' ? s.sigChain : s.pwrChain
        const next = s[grid].map((r) => [...r])
        next[row][col] = next[row][col] === chain ? -1 : chain
        set({ [grid]: next } as Partial<LedWallState>)
      },

      fillLine: (grid, kind, index) => {
        const s = get()
        const chain = grid === 'sig' ? s.sigChain : s.pwrChain
        const next = s[grid].map((r) => [...r])
        const cells =
          kind === 'col' ? next.map((r) => r[index]) : (next[index] ?? [])
        const allSet = cells.length > 0 && cells.every((v) => v === chain)
        if (kind === 'col') for (const r of next) r[index] = allSet ? -1 : chain
        else next[index] = next[index].map(() => (allSet ? -1 : chain))
        set({ [grid]: next } as Partial<LedWallState>)
      },

      resetGrid: (grid) => {
        const s = get()
        set({
          [grid]: s[grid].map((r) => r.map(() => -1)),
          [grid === 'sig' ? 'sigChain' : 'pwrChain']: 0
        } as Partial<LedWallState>)
      }
    }),
    { name: 'led-wall-konfigurator' }
  )
)
