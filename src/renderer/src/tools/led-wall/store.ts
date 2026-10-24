// Zustand des LED-Wall-Konfigurators – per zustand/persist in localStorage,
// damit eine angefangene Planung Tool-Wechsel UND App-Neustart übersteht.
//
// Mehrere Wände (ab Version 3): Die gewählte Wand steht in den flachen Feldern – so lesen alle
// Ansichten weiter `s.widthM`, `s.sig` …; die übrigen liegen in `walls` (der Eintrag der gewählten
// hat `config: null`). Projekt und Kunde gelten für alle Wände. Wer alle Wände braucht (Datei,
// Packliste, Mini-Manual), nimmt `plannedWalls(s)`, nie `walls` direkt.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { digest } from '@shared/projectFile'
import { debouncedStorage, syncAcrossWindows } from '@renderer/lib/persistStorage'
import { sanitizeBinding, type ProjectBinding } from '@renderer/lib/projectBinding'
import {
  DEFAULT_LED_WALL_CONFIG,
  FIRST_WALL_ID,
  ledWallFileData,
  ledWallSection,
  pickConfig,
  sanitizeLedWallConfig,
  WALL_NAME_MAX,
  wallLabel,
  WALLS_MAX,
  type ChainRoute,
  type Corner,
  type LedWallConfig,
  type LedWallFileData,
  type PlannedWall,
  type PlanningData,
  type PwrChainMeta,
  type SigChainMeta
} from './config'
import { chainCells, chainRoute } from './cabling'

export type { BuildMode, CurveMode, LedWallConfig } from './config'

/** Eintrag der Wand-Liste; `config: null` = die gewählte Wand (steht in den flachen Feldern). */
export interface WallSlot {
  id: string
  name: string
  config: LedWallConfig | null
}

/** Benannte, gespeicherte Konfiguration. */
export interface LedWallPreset {
  id: string
  name: string
  savedAt: number
  data: LedWallConfig
}

interface LedWallState extends LedWallConfig {
  presets: LedWallPreset[]
  /** Projektdatei, an die die Planung gebunden ist (null = ohne Datei). Steht NEBEN der
   *  Konfiguration, damit Vorlagen sie nicht mitnehmen (lib/projectFile). */
  file: ProjectBinding | null
  /** alle Wände in Reihenfolge (mindestens eine) */
  walls: WallSlot[]
  /** gewählte Wand */
  wallId: string

  set: (patch: Partial<LedWallState>) => void
  selectWall: (id: string) => void
  /** neue Wand hinter der gewählten (copy: Kopie der gewählten), wird gleich gewählt */
  addWall: (copy?: boolean) => void
  renameWall: (id: string, name: string) => void
  /** Wand entfernen (die letzte bleibt); war sie gewählt, wird die Nachbarin gewählt */
  removeWall: (id: string) => void
  /** Grids an neue Modulzahl anpassen (Zuordnungen im Überlapp bleiben erhalten). */
  ensureGridSize: (rows: number, cols: number) => void
  setCell: (grid: 'sig' | 'pwr', row: number, col: number) => void
  fillLine: (grid: 'sig' | 'pwr', kind: 'row' | 'col', index: number) => void
  /** Raster und Verlauf leeren */
  resetGrid: (grid: 'sig' | 'pwr') => void
  /** Startecke/Richtung einer Kette setzen (löscht eine gezeichnete Reihenfolge); null = kein Verlauf */
  setRoute: (
    grid: 'sig' | 'pwr',
    chain: number,
    route: { start: Corner; axis: 'row' | 'col' } | null
  ) => void
  /**
   * Kette zeichnen: die Module kommen in diese Reihenfolge und in die Kette (aus anderen heraus).
   * `extend`: an die bisherige Reihenfolge anhängen (Strich beginnt am letzten Modul), sonst
   * ersetzt der Strich die Kette – ihre übrigen Module werden frei.
   */
  drawChain: (
    grid: 'sig' | 'pwr',
    chain: number,
    cells: [number, number][],
    extend: boolean
  ) => void
  /** Port bzw. Backup einer Signalkette ändern (undefined = Feld entfernen → Vorgabe) */
  setSigChain: (chain: number, patch: Partial<SigChainMeta>) => void
  /** Backup-Leitung bei allen Signalketten an bzw. aus – und als Vorgabe für neue Ketten */
  setBackupAlle: (an: boolean) => void
  /** Stromkreis bzw. Phase einer Stromkette ändern (undefined = Feld entfernen → Vorschlag) */
  setPwrChain: (chain: number, patch: Partial<PwrChainMeta>) => void
  /** Aktuelle Konfiguration (der gewählten Wand) als Vorlage sichern (gleicher Name -> überschreiben). */
  savePreset: (name: string) => void
  /** Vorlage in die gewählte Wand laden; Projekt und Kunde bleiben (leer: aus der Vorlage), die
   *  Bindung an eine Projektdatei auch – die Datei ist danach „ungespeichert“. */
  loadPreset: (id: string) => void
  deletePreset: (id: string) => void
  setFile: (file: ProjectBinding | null) => void
  /** Planung ersetzen mit genau einer Wand (Tests, „Neu“); Bedienzustand (PDF-Format) bleibt. */
  replaceConfig: (config: LedWallConfig) => void
  /** Ganze Planung ersetzen (Projektdatei); die erste Wand wird gewählt. */
  replacePlanning: (p: PlanningData) => void
}

type WallsState = LedWallConfig & { walls: WallSlot[]; wallId: string }

/** Felder einer Kette setzen; undefined entfernt das Feld (dann gilt die Vorgabe bzw. der Vorschlag) */
function patchMeta<T extends object>(
  meta: Record<string, T>,
  chain: number,
  patch: Partial<T>
): Record<string, T> {
  const out = { ...meta }
  const k = String(chain)
  const next: Record<string, unknown> = { ...(Object.hasOwn(out, k) ? out[k] : {}) }
  for (const [key, v] of Object.entries(patch)) {
    if (v === undefined) delete next[key]
    else next[key] = v
  }
  out[k] = next as T
  return out
}

/** Alle Wände in Reihenfolge – die gewählte mit ihrem aktuellen Stand, Projekt und Kunde überall gleich. */
export function plannedWalls(s: WallsState): PlannedWall[] {
  const current = pickConfig(s)
  const slots = s.walls.some((w) => w.id === s.wallId)
    ? s.walls
    : [{ id: s.wallId, name: wallLabel(0), config: null }]
  return slots.map((w) => ({
    id: w.id,
    name: w.name,
    config:
      w.id === s.wallId
        ? current
        : {
            ...structuredClone(w.config ?? DEFAULT_LED_WALL_CONFIG),
            projectName: s.projectName,
            customerName: s.customerName
          }
  }))
}

/** Daten des Datei-Abschnitts (alle Wände). */
export function ledWallFile(s: WallsState): LedWallFileData {
  return ledWallFileData(s.projectName, s.customerName, plannedWalls(s))
}

/** Hat die gebundene Planung Änderungen, die noch nicht in der Datei stehen? */
export function ledWallDirty(s: WallsState & { file: ProjectBinding | null }): boolean {
  return !!s.file && digest(ledWallFile(s)) !== s.file.savedDigest
}

const newWallId = (): string => `wand-${crypto.randomUUID().slice(0, 8)}`

/** Kopie ohne die genannten Felder */
function omit<T extends object>(o: T, keys: (keyof T)[]): T {
  const out = { ...o }
  for (const k of keys) delete out[k]
  return out
}

/** Nächster freier Standardname („Wand 3“) */
function nextWallName(walls: WallSlot[]): string {
  for (let i = walls.length; ; i++) {
    const name = wallLabel(i)
    if (!walls.some((w) => w.name === name)) return name
  }
}

function sanitizePresets(v: unknown): LedWallPreset[] {
  return Array.isArray(v)
    ? v
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .filter((x) => typeof x.id === 'string' && typeof x.name === 'string')
        .map((x) => ({
          id: x.id as string,
          name: (x.name as string).slice(0, 200),
          savedAt: typeof x.savedAt === 'number' ? x.savedAt : 0,
          data: sanitizeLedWallConfig(x.data)
        }))
    : []
}

/**
 * Gespeicherten Stand auf die aktuelle Version bringen. Rein, getestet in store.test.ts.
 * - Version 2 ergänzt die Felder für den Kabelverlauf – in der Planung UND in jeder Vorlage
 *   (zustand ergänzt nur oberste Felder).
 * - Version 3: Wand-Liste mit der bisherigen Planung als einziger Wand. War sie an eine Datei
 *   gebunden und gespeichert, bleibt sie „gespeichert“ (Prüfsumme auf die neue Form umgerechnet).
 */
export function migrateLedWall(persisted: unknown, version: number): unknown {
  if (version >= 3 || !persisted || typeof persisted !== 'object') return persisted
  const p = persisted as Record<string, unknown>
  const config = sanitizeLedWallConfig(p)
  const presets = version < 2 ? sanitizePresets(p.presets) : p.presets
  const file = sanitizeBinding(p.file)
  if (file && file.savedDigest === digest(ledWallSection(config))) {
    file.savedDigest = digest(
      ledWallFileData(config.projectName, config.customerName, [
        { id: FIRST_WALL_ID, name: wallLabel(0), config }
      ])
    )
  }
  return {
    ...(version < 2 ? config : p),
    presets,
    file,
    walls: [{ id: FIRST_WALL_ID, name: wallLabel(0), config: null }],
    wallId: FIRST_WALL_ID
  }
}

/** Wand-Liste aus einem fremden Stand (anderes Fenster, Speicher) prüfen: gewählte genau einmal. */
function sanitizeSlots(v: unknown, wallId: unknown): { walls: WallSlot[]; wallId: string } {
  const walls: WallSlot[] = []
  for (const w of Array.isArray(v) ? v.slice(0, WALLS_MAX) : []) {
    if (!w || typeof w !== 'object') continue
    const o = w as Record<string, unknown>
    if (typeof o.id !== 'string' || walls.some((x) => x.id === o.id)) continue
    walls.push({
      id: o.id,
      name: typeof o.name === 'string' ? o.name.slice(0, WALL_NAME_MAX) : wallLabel(walls.length),
      config: o.config ? sanitizeLedWallConfig(o.config) : null
    })
  }
  const active = walls.find((w) => w.id === wallId) ?? walls[0]
  if (!active)
    return {
      walls: [{ id: FIRST_WALL_ID, name: wallLabel(0), config: null }],
      wallId: FIRST_WALL_ID
    }
  return {
    walls: walls.map((w) =>
      w.id === active.id
        ? { ...w, config: null }
        : { ...w, config: w.config ?? structuredClone(DEFAULT_LED_WALL_CONFIG) }
    ),
    wallId: active.id
  }
}

/**
 * Beim Verkleinern abgeschnittene Zuordnungen, für diese Sitzung gemerkt: Wer kurz Modul, Curving
 * oder Maße umschaltet (oder das Höhenfeld leert), bekommt beim Zurückschalten seine Verkabelung
 * wieder – und eine gebundene Datei gilt dann wieder als gespeichert. Gespeichert wird weiter nur
 * das passende Raster. Gilt nur für die aktuelle Planung (andere Planung oder Stand aus einem
 * anderen Fenster -> vergessen).
 *
 * Nur belegte Zellen („Zeile,Spalte“ -> Kette): Eine Hülle aller je erreichten Größen wüchse nach
 * zwei korrigierten Tippfehlern (4000 statt 4 m Breite, 2500 statt 2,5 m Höhe) auf Millionen
 * Zellen, und jeder Tastendruck hinge.
 */
let shadow: { sig: Map<string, number>; pwr: Map<string, number> } | null = null

/** Aktuelles Raster ins Gedächtnis: in seinem Bereich gilt es (auch „frei“), außerhalb bleibt das Gemerkte. */
function remember(memo: Map<string, number>, grid: number[][]): void {
  grid.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v === -1) memo.delete(`${r},${c}`)
      else memo.set(`${r},${c}`, v)
    })
  )
}

function recall(memo: Map<string, number>, rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => memo.get(`${r},${c}`) ?? -1)
  )
}

export const useLedWall = create<LedWallState>()(
  persist(
    (set, get) => ({
      ...structuredClone(DEFAULT_LED_WALL_CONFIG),
      presets: [],
      file: null,
      walls: [{ id: FIRST_WALL_ID, name: wallLabel(0), config: null }],
      wallId: FIRST_WALL_ID,

      set: (patch) => set(patch),

      selectWall: (id) => {
        const s = get()
        const target = s.walls.find((w) => w.id === id)
        if (!target || id === s.wallId) return
        const current = pickConfig(s)
        shadow = null
        set({
          // Projekt, Kunde und PDF-Format gelten für alle Wände
          ...structuredClone(target.config ?? DEFAULT_LED_WALL_CONFIG),
          projectName: s.projectName,
          customerName: s.customerName,
          pdfLandscape: s.pdfLandscape,
          walls: s.walls.map((w) =>
            w.id === s.wallId ? { ...w, config: current } : w.id === id ? { ...w, config: null } : w
          ),
          wallId: id
        })
      },

      addWall: (copy = false) => {
        const s = get()
        if (s.walls.length >= WALLS_MAX) return
        const current = pickConfig(s)
        const here = s.walls.find((w) => w.id === s.wallId)
        const id = newWallId()
        const name =
          copy && here ? `${here.name} (Kopie)`.slice(0, WALL_NAME_MAX) : nextWallName(s.walls)
        const at = s.walls.findIndex((w) => w.id === s.wallId) + 1
        const walls = s.walls.map((w) => (w.id === s.wallId ? { ...w, config: current } : w))
        walls.splice(at, 0, { id, name, config: null })
        shadow = null
        set({
          ...(copy ? current : structuredClone(DEFAULT_LED_WALL_CONFIG)),
          projectName: s.projectName,
          customerName: s.customerName,
          pdfLandscape: s.pdfLandscape,
          walls,
          wallId: id
        })
      },

      renameWall: (id, name) => {
        const s = get()
        const i = s.walls.findIndex((w) => w.id === id)
        if (i < 0) return
        const n = name.trim().slice(0, WALL_NAME_MAX) || wallLabel(i)
        set({ walls: s.walls.map((w) => (w.id === id ? { ...w, name: n } : w)) })
      },

      removeWall: (id) => {
        const s = get()
        const i = s.walls.findIndex((w) => w.id === id)
        if (i < 0 || s.walls.length <= 1) return
        if (id === s.wallId) get().selectWall(s.walls[i + 1]?.id ?? s.walls[i - 1].id)
        set({ walls: get().walls.filter((w) => w.id !== id) })
      },

      ensureGridSize: (rows, cols) => {
        const { sig, pwr } = get()
        if (sig.length === rows && (sig[0]?.length ?? 0) === cols) return
        shadow ??= { sig: new Map(), pwr: new Map() }
        remember(shadow.sig, sig)
        remember(shadow.pwr, pwr)
        set({ sig: recall(shadow.sig, rows, cols), pwr: recall(shadow.pwr, rows, cols) })
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
        const cells = kind === 'col' ? next.map((r) => r[index]) : (next[index] ?? [])
        const allSet = cells.length > 0 && cells.every((v) => v === chain)
        if (kind === 'col') for (const r of next) r[index] = allSet ? -1 : chain
        else next[index] = next[index].map(() => (allSet ? -1 : chain))
        set({ [grid]: next } as Partial<LedWallState>)
      },

      resetGrid: (grid) => {
        const s = get()
        shadow?.[grid].clear()
        set({
          [grid]: s[grid].map((r) => r.map(() => -1)),
          [grid === 'sig' ? 'sigChain' : 'pwrChain']: 0,
          [grid === 'sig' ? 'sigMeta' : 'pwrMeta']: {}
        } as Partial<LedWallState>)
      },

      setRoute: (grid, chain, route) => {
        const metaKey = grid === 'sig' ? 'sigMeta' : 'pwrMeta'
        const meta = { ...get()[metaKey] } as Record<string, ChainRoute>
        const k = String(chain)
        // Port, Stromkreis … (spätere Felder) bleiben; nur der Verlauf wird ersetzt
        const rest = omit(Object.hasOwn(meta, k) ? meta[k] : {}, ['start', 'axis', 'order'])
        meta[k] = route ? { ...rest, start: route.start, axis: route.axis } : rest
        set({ [metaKey]: meta } as Partial<LedWallState>)
      },

      drawChain: (grid, chain, cells, extend) => {
        const s = get()
        const metaKey = grid === 'sig' ? 'sigMeta' : 'pwrMeta'
        const next = s[grid].map((r) => [...r])
        const valid = cells.filter(
          ([r, c]) => r >= 0 && c >= 0 && r < next.length && c < (next[r]?.length ?? 0)
        )
        if (!valid.length) return
        const k = String(chain)
        const meta = { ...s[metaKey] } as Record<string, ChainRoute>
        const old = Object.hasOwn(meta, k) ? meta[k] : {}
        const before = extend ? chainRoute(chainCells(s[grid]).get(chain) ?? [], old).order : []
        if (!extend) for (const row of next) row.forEach((v, c) => v === chain && (row[c] = -1))
        for (const [r, c] of valid) next[r][c] = chain
        const seen = new Set<string>()
        const order = [...before, ...valid].filter(([r, c]) => {
          const id = `${r},${c}`
          return !seen.has(id) && (seen.add(id), true)
        })
        meta[k] = { ...omit(old, ['start', 'axis']), order }
        set({ [grid]: next, [metaKey]: meta } as Partial<LedWallState>)
      },

      setSigChain: (chain, patch) => set({ sigMeta: patchMeta(get().sigMeta, chain, patch) }),

      setBackupAlle: (an) => {
        const s = get()
        // je Kette ausdrücklich – die Vorgabe allein reicht nicht: Ketten mit eigener Angabe
        // (null) blieben sonst ohne, und beim Hot-Backup ist „an“ schon die Vorgabe der Strecke.
        // Feste Backup-Ports bleiben beim Einschalten erhalten
        const meta = { ...s.sigMeta }
        for (const chain of chainCells(s.sig).keys()) {
          const k = String(chain)
          const alt: SigChainMeta = Object.hasOwn(meta, k) ? meta[k] : {}
          meta[k] = { ...alt, backup: an ? (alt.backup ?? {}) : null }
        }
        set({ redundancy: an, sigMeta: meta })
      },

      setPwrChain: (chain, patch) => set({ pwrMeta: patchMeta(get().pwrMeta, chain, patch) }),

      savePreset: (name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        const data = pickConfig(get())
        set((state) => {
          const idx = state.presets.findIndex((p) => p.name === trimmed)
          const entry: LedWallPreset = {
            id: idx >= 0 ? state.presets[idx].id : crypto.randomUUID(),
            name: trimmed,
            savedAt: Date.now(),
            data
          }
          return {
            presets:
              idx >= 0
                ? state.presets.map((p, i) => (i === idx ? entry : p))
                : [...state.presets, entry]
          }
        })
      },

      loadPreset: (id) => {
        const s = get()
        const preset = s.presets.find((p) => p.id === id)
        // alle Felder setzen (fehlende aus der Vorgabe) – sonst blieben Felder der vorigen
        // Planung stehen, z. B. eine fremde Kabelreihenfolge
        if (!preset) return
        const c = sanitizeLedWallConfig(preset.data)
        shadow = null
        set({
          ...c,
          projectName: s.projectName.trim() ? s.projectName : c.projectName,
          customerName: s.customerName.trim() ? s.customerName : c.customerName
        })
      },

      deletePreset: (id) => set((state) => ({ presets: state.presets.filter((p) => p.id !== id) })),

      setFile: (file) => set({ file }),

      replaceConfig: (config) =>
        get().replacePlanning({
          projectName: config.projectName,
          customerName: config.customerName,
          walls: [{ id: FIRST_WALL_ID, name: wallLabel(0), config }]
        }),

      replacePlanning: (p) => {
        const [first, ...rest] = p.walls.length
          ? p.walls
          : [{ id: FIRST_WALL_ID, name: wallLabel(0), config: DEFAULT_LED_WALL_CONFIG }]
        shadow = null
        set({
          ...structuredClone(first.config),
          projectName: p.projectName,
          customerName: p.customerName,
          pdfLandscape: get().pdfLandscape,
          walls: [
            { id: first.id, name: first.name, config: null },
            ...rest.map((w) => ({ id: w.id, name: w.name, config: structuredClone(w.config) }))
          ],
          wallId: first.id
        })
      }
    }),
    {
      name: 'led-wall-konfigurator',
      storage: debouncedStorage(),
      // v0/v1: Planung ohne Kabelverlauf; v2 (Oktober 2026): Kabelverlauf-Felder, Datei-Bindung;
      // v3 (Oktober 2026): mehrere Wände
      version: 3,
      migrate: (persisted, version) => migrateLedWall(persisted, version) as LedWallState,
      // Stand aus einem anderen Fenster oder dem Speicher: Wand-Liste prüfen (gewählte genau einmal)
      merge: (persisted, current) => {
        const p = (
          persisted && typeof persisted === 'object' ? persisted : {}
        ) as Partial<LedWallState>
        return { ...current, ...p, ...sanitizeSlots(p.walls, p.wallId) }
      }
    }
  )
)

// Ein Werkzeug in mehreren Fenstern: Änderungen der anderen übernehmen, statt sie
// beim nächsten Speichern mit altem Stand zu überschreiben (siehe persistStorage.ts).
syncAcrossWindows(useLedWall)
useLedWall.persist.onFinishHydration(() => {
  shadow = null
})
