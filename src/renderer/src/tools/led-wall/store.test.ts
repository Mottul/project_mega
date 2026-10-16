import { describe, expect, it, vi } from 'vitest'

// der Store hängt sich an localStorage (debouncedStorage) – im Test ein schlichter Ersatz
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
})
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })

const { migrateLedWall, ledWallDirty, useLedWall } = await import('./store')
const { DEFAULT_LED_WALL_CONFIG, ledWallSection } = await import('./config')
const { digest } = await import('@shared/projectFile')
const { LED_WALL_FILE } = await import('./fileSection')

const v1Planung = {
  moduleKey: '496-2,0',
  widthM: '4',
  heightM: '2,5',
  projectName: 'Messe',
  customerName: '',
  buildMode: 'stacked',
  sig: [[0, 1]],
  pwr: [[0, 0]],
  sigChain: 1,
  pwrChain: 0,
  curveMode: 'circle',
  segSag: '0,5',
  builderSegs: [{ type: 'straight', count: 3 }],
  sqD: '2',
  sqCorner: 3,
  selectedCircle: 0,
  pdfLandscape: true
}

describe('gemerkter Stand des LED-Wall-Konfigurators', () => {
  it('Version 1 -> 2: Planung UND jede Vorlage bekommen die neuen Felder', () => {
    const out = migrateLedWall(
      {
        ...v1Planung,
        presets: [
          { id: 'a', name: 'Stand A', savedAt: 5, data: { ...v1Planung, widthM: '6' } },
          { id: 7, name: 'kaputt' }
        ]
      },
      1
    ) as Record<string, unknown> & { presets: { data: Record<string, unknown> }[] }
    expect(out).toMatchObject({ ...v1Planung, sigMeta: {}, redundancy: false, file: null })
    expect(out.presets).toHaveLength(1)
    expect(out.presets[0].data).toMatchObject({ widthM: '6', sigMeta: {}, feed: 'bottom' })
  })

  it('Version 2 bleibt, wie sie ist', () => {
    const v2 = { widthM: '9', file: null }
    expect(migrateLedWall(v2, 2)).toBe(v2)
  })

  it('Vorlage laden löst die Bindung und ersetzt alle Felder', () => {
    const st = useLedWall.getState()
    st.replaceConfig({ ...DEFAULT_LED_WALL_CONFIG, projectName: 'Vorlage' })
    st.savePreset('Vorlage')
    st.replaceConfig({
      ...DEFAULT_LED_WALL_CONFIG,
      projectName: 'Anders',
      sigMeta: { '0': { start: 'tl' } }
    })
    st.setFile({ path: '/p/x.mottul', name: 'x', baseSha: 'a'.repeat(64), rev: 1, savedDigest: '' })
    const id = useLedWall.getState().presets[0].id
    useLedWall.getState().loadPreset(id)
    const s = useLedWall.getState()
    expect(s.projectName).toBe('Vorlage')
    expect(s.sigMeta).toEqual({})
    expect(s.file).toBeNull()
  })

  it('ungespeichert: nur bei Bindung und geänderten Daten', () => {
    const st = useLedWall.getState()
    st.replaceConfig({ ...DEFAULT_LED_WALL_CONFIG, projectName: 'Messe' })
    st.setFile(null)
    expect(ledWallDirty(useLedWall.getState())).toBe(false)
    const saved = digest(ledWallSection(useLedWall.getState()))
    st.setFile({
      path: '/p/x.mottul',
      name: 'x',
      baseSha: 'a'.repeat(64),
      rev: 1,
      savedDigest: saved
    })
    expect(ledWallDirty(useLedWall.getState())).toBe(false)
    st.set({ sigChain: 4 }) // Bedienzustand
    expect(ledWallDirty(useLedWall.getState())).toBe(false)
    st.set({ widthM: '5' })
    expect(ledWallDirty(useLedWall.getState())).toBe(true)
    st.set({ widthM: '4' })
    expect(ledWallDirty(useLedWall.getState())).toBe(false)
  })

  it('Raster verkleinern und wieder vergrößern stellt die Verkabelung wieder her', () => {
    useLedWall.getState().replaceConfig({ ...DEFAULT_LED_WALL_CONFIG })
    const full = Array.from({ length: 5 }, () =>
      Array.from({ length: 12 }, (_, c) => (c < 6 ? 0 : 1))
    )
    useLedWall.getState().set({ sig: full, pwr: full.map((r) => [...r]) })
    const st = useLedWall.getState()
    st.setFile({
      path: '/p/x.mottul',
      name: 'x',
      baseSha: 'a'.repeat(64),
      rev: 1,
      savedDigest: digest(ledWallSection(st))
    })
    useLedWall.getState().ensureGridSize(5, 8) // flaches Modul oder Vollkreis mit 8
    useLedWall.getState().ensureGridSize(1, 12) // Höhenfeld kurz leer
    useLedWall.getState().setCell('sig', 0, 0) // Änderung im sichtbaren Bereich bleibt
    useLedWall.getState().setCell('sig', 0, 0) // … und wird zurückgenommen
    useLedWall.getState().ensureGridSize(5, 12)
    expect(useLedWall.getState().sig).toEqual(full)
    expect(useLedWall.getState().pwr).toEqual(full)
    expect(ledWallDirty(useLedWall.getState())).toBe(false)
  })

  it('gemerkte Zuordnungen gelten nur für die eigene Planung', () => {
    const wide = Array.from({ length: 5 }, () => Array(12).fill(0))
    useLedWall.getState().replaceConfig({ ...DEFAULT_LED_WALL_CONFIG })
    useLedWall.getState().set({ sig: wide, pwr: wide.map((r) => [...r]) })
    useLedWall.getState().ensureGridSize(5, 8)
    const empty = Array.from({ length: 5 }, () => Array(8).fill(-1))
    useLedWall.getState().replaceConfig({ ...DEFAULT_LED_WALL_CONFIG, sig: empty, pwr: empty })
    useLedWall.getState().ensureGridSize(5, 12)
    expect(
      useLedWall
        .getState()
        .sig.flat()
        .every((v) => v === -1)
    ).toBe(true)
    // „Raster leeren“ vergisst ebenfalls
    useLedWall.getState().set({ sig: wide, pwr: wide.map((r) => [...r]) })
    useLedWall.getState().ensureGridSize(5, 8)
    useLedWall.getState().resetGrid('sig')
    useLedWall.getState().ensureGridSize(5, 12)
    expect(
      useLedWall
        .getState()
        .sig.flat()
        .every((v) => v === -1)
    ).toBe(true)
    expect(
      useLedWall
        .getState()
        .pwr.flat()
        .every((v) => v === 0)
    ).toBe(true)
  })

  it('Tippfehler in Breite und Höhe blähen das Gedächtnis nicht auf', () => {
    const grid = Array.from({ length: 5 }, () => Array(8).fill(0))
    useLedWall.getState().replaceConfig({ ...DEFAULT_LED_WALL_CONFIG })
    useLedWall.getState().set({ sig: grid, pwr: grid.map((r) => [...r]) })
    const started = performance.now()
    // 4000 statt 4 m Breite, korrigiert; dann 2500 statt 2,5 m Höhe, korrigiert
    for (const [rows, cols] of [
      [5, 8065],
      [5, 8],
      [5040, 8],
      [5, 8],
      [5, 9]
    ]) {
      useLedWall.getState().ensureGridSize(rows, cols)
    }
    expect(performance.now() - started).toBeLessThan(1000)
    expect(useLedWall.getState().sig).toEqual(grid.map((r) => [...r, -1]))
  })

  it('fremde Datei mit unmöglich großer Wand wird nicht übernommen', () => {
    useLedWall.getState().replaceConfig({ ...DEFAULT_LED_WALL_CONFIG, projectName: 'bleibt' })
    expect(LED_WALL_FILE.apply({ widthM: '500000' }, 2)).toBe(false)
    const builder = Array.from({ length: 30 }, () => ({ type: 'straight', count: 40 }))
    expect(
      LED_WALL_FILE.apply({ moduleKey: 'uS2+', curveMode: 'builder', builderSegs: builder }, 2)
    ).toBe(true) // 1200 Module zusammen: Builder fällt auf die Vorgabe zurück
    expect(useLedWall.getState().builderSegs).toEqual(DEFAULT_LED_WALL_CONFIG.builderSegs)
    expect(LED_WALL_FILE.apply({ widthM: '40' }, 2)).toBe(true)
  })
})
