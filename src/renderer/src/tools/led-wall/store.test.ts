import { describe, expect, it, vi } from 'vitest'

// der Store hängt sich an localStorage (debouncedStorage) – im Test ein schlichter Ersatz
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
})
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })

const { migrateLedWall, ledWallDirty, ledWallFile, plannedWalls, useLedWall } =
  await import('./store')
const { DEFAULT_LED_WALL_CONFIG, FIRST_WALL_ID, ledWallSection } = await import('./config')
const { digest } = await import('@shared/projectFile')
const { LED_WALL_FILE } = await import('./fileSection')

const binding = (savedDigest: string) => ({
  path: '/p/x.mottul',
  name: 'x',
  baseSha: 'a'.repeat(64),
  rev: 1,
  savedDigest
})

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

  it('Version 3 bleibt, wie sie ist', () => {
    const v3 = { widthM: '9', file: null, walls: [], wallId: 'x' }
    expect(migrateLedWall(v3, 3)).toBe(v3)
  })

  it('Version 2 -> 3: eine Wand; eine gespeicherte Bindung bleibt gespeichert', () => {
    const v2 = { ...DEFAULT_LED_WALL_CONFIG, widthM: '6', projectName: 'Messe', presets: [] }
    const saved = digest(ledWallSection(v2))
    const out = migrateLedWall({ ...v2, file: binding(saved) }, 2) as ReturnType<
      typeof useLedWall.getState
    >
    expect(out.walls).toEqual([{ id: FIRST_WALL_ID, name: 'Wand 1', config: null }])
    expect(out.wallId).toBe(FIRST_WALL_ID)
    expect(out.widthM).toBe('6')
    expect(ledWallDirty(out)).toBe(false)
    // war sie ungespeichert, bleibt sie es
    const dirty = migrateLedWall({ ...v2, file: binding('b'.repeat(64)) }, 2) as typeof out
    expect(ledWallDirty(dirty)).toBe(true)
  })

  it('Vorlage laden ersetzt nur die gewählte Wand; Bindung, Projekt und andere Wände bleiben', () => {
    const st = useLedWall.getState()
    st.replaceConfig({ ...DEFAULT_LED_WALL_CONFIG, projectName: 'Vorlage', widthM: '8' })
    st.savePreset('Vorlage')
    st.replaceConfig({
      ...DEFAULT_LED_WALL_CONFIG,
      projectName: 'Anders',
      sigMeta: { '0': { start: 'tl' } }
    })
    useLedWall.getState().addWall()
    useLedWall.getState().set({ widthM: '3' })
    useLedWall.getState().setFile(binding(''))
    const id = useLedWall.getState().presets[0].id
    useLedWall.getState().loadPreset(id)
    const s = useLedWall.getState()
    expect(s.projectName).toBe('Anders')
    expect(s.widthM).toBe('8')
    expect(s.file).not.toBeNull()
    expect(plannedWalls(s).map((w) => w.config.widthM)).toEqual(['4', '8'])
    expect(plannedWalls(s)[0].config.sigMeta).toEqual({ '0': { start: 'tl' } })
  })

  it('ungespeichert: nur bei Bindung und geänderten Daten', () => {
    const st = useLedWall.getState()
    st.replaceConfig({ ...DEFAULT_LED_WALL_CONFIG, projectName: 'Messe' })
    st.setFile(null)
    expect(ledWallDirty(useLedWall.getState())).toBe(false)
    const saved = digest(ledWallFile(useLedWall.getState()))
    st.setFile(binding(saved))
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
    st.setFile(binding(digest(ledWallFile(st))))
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

describe('mehrere Wände', () => {
  it('Wand wechseln: jede behält Maße und Verkabelung, Projekt gilt für alle', () => {
    const st = useLedWall.getState()
    st.replaceConfig({ ...DEFAULT_LED_WALL_CONFIG, projectName: 'Messe', sig: [[0, 0]] })
    st.addWall()
    const second = useLedWall.getState().wallId
    expect(useLedWall.getState().walls.map((w) => w.name)).toEqual(['Wand 1', 'Wand 2'])
    expect(useLedWall.getState().projectName).toBe('Messe')
    useLedWall.getState().set({ moduleKey: 'uS2+', widthM: '2', projectName: 'Messe 2026' })
    useLedWall.getState().selectWall(FIRST_WALL_ID)
    let s = useLedWall.getState()
    expect(s.sig).toEqual([[0, 0]])
    expect(s.moduleKey).toBe(DEFAULT_LED_WALL_CONFIG.moduleKey)
    expect(s.projectName).toBe('Messe 2026')
    useLedWall.getState().selectWall(second)
    s = useLedWall.getState()
    expect([s.moduleKey, s.widthM]).toEqual(['uS2+', '2'])
    expect(plannedWalls(s).map((w) => [w.name, w.config.moduleKey, w.config.projectName])).toEqual([
      ['Wand 1', DEFAULT_LED_WALL_CONFIG.moduleKey, 'Messe 2026'],
      ['Wand 2', 'uS2+', 'Messe 2026']
    ])
  })

  it('Wechseln ist keine Änderung; Umbenennen, Hinzufügen und Entfernen schon', () => {
    const st = useLedWall.getState()
    st.replaceConfig({ ...DEFAULT_LED_WALL_CONFIG })
    st.addWall(true)
    useLedWall.getState().setFile(binding(digest(ledWallFile(useLedWall.getState()))))
    useLedWall.getState().selectWall(FIRST_WALL_ID)
    expect(ledWallDirty(useLedWall.getState())).toBe(false)
    useLedWall.getState().renameWall(FIRST_WALL_ID, '  Hauptbühne ')
    expect(useLedWall.getState().walls[0].name).toBe('Hauptbühne')
    expect(ledWallDirty(useLedWall.getState())).toBe(true)
    useLedWall.getState().renameWall(FIRST_WALL_ID, '')
    expect(useLedWall.getState().walls[0].name).toBe('Wand 1')
  })

  it('Duplizieren kopiert die gewählte Wand; Entfernen wählt die Nachbarin, die letzte bleibt', () => {
    const st = useLedWall.getState()
    st.replaceConfig({ ...DEFAULT_LED_WALL_CONFIG, widthM: '7' })
    st.renameWall(FIRST_WALL_ID, 'Bühne')
    useLedWall.getState().addWall(true)
    let s = useLedWall.getState()
    expect(s.walls.map((w) => w.name)).toEqual(['Bühne', 'Bühne (Kopie)'])
    expect(s.widthM).toBe('7')
    useLedWall.getState().removeWall(s.wallId)
    s = useLedWall.getState()
    expect(s.walls.map((w) => w.id)).toEqual([FIRST_WALL_ID])
    expect(s.wallId).toBe(FIRST_WALL_ID)
    expect(s.walls[0].config).toBeNull()
    useLedWall.getState().removeWall(FIRST_WALL_ID)
    expect(useLedWall.getState().walls).toHaveLength(1)
  })

  it('Datei mit zwei Wänden: Reihenfolge, Namen und Projekt kommen an, der runde Weg stimmt', () => {
    const data = {
      projectName: 'Messe',
      customerName: 'Kunde',
      walls: [
        { id: 'a', name: 'Links', data: { moduleKey: 'uS2+', widthM: '2', heightM: '1' } },
        { id: 'b', name: 'Rechts', data: { moduleKey: '496-2,0', widthM: '3' } }
      ]
    }
    expect(LED_WALL_FILE.apply(data, 3)).toBe(true)
    const s = useLedWall.getState()
    expect([s.wallId, s.moduleKey, s.projectName, s.customerName]).toEqual([
      'a',
      'uS2+',
      'Messe',
      'Kunde'
    ])
    expect(s.sig.length).toBeGreaterThan(0) // Raster gleich passend
    const file = ledWallFile(s)
    expect(file.walls.map((w) => [w.id, w.name, w.data.widthM])).toEqual([
      ['a', 'Links', '2'],
      ['b', 'Rechts', '3']
    ])
    expect(file.walls[0].data).not.toHaveProperty('projectName')
    // wieder geöffnet: dieselben Daten
    expect(LED_WALL_FILE.apply(file, 3)).toBe(true)
    expect(digest(ledWallFile(useLedWall.getState()))).toBe(digest(file))
  })

  it('kaputte oder zu große Wand-Listen werden nicht übernommen', () => {
    expect(LED_WALL_FILE.apply({ walls: [] }, 3)).toBe(false)
    expect(LED_WALL_FILE.apply({ walls: 'x' }, 3)).toBe(false)
    expect(LED_WALL_FILE.apply({ walls: [{ id: 'a', data: {} }, 7] }, 3)).toBe(false)
    const many = Array.from({ length: 21 }, (_, i) => ({ id: `w${i}`, data: {} }))
    expect(LED_WALL_FILE.apply({ walls: many }, 3)).toBe(false)
    // jede Wand für sich erlaubt, zusammen zu viele Zellen
    const big = { moduleKey: 'rX3ioBF', widthM: '400', heightM: '300' }
    const huge = Array.from({ length: 3 }, (_, i) => ({ id: `w${i}`, data: big }))
    expect(LED_WALL_FILE.apply({ walls: huge }, 3)).toBe(false)
  })

  it('doppelte oder ungültige Kennungen werden eindeutig', () => {
    expect(
      LED_WALL_FILE.apply(
        {
          walls: [
            { id: 'a', data: {} },
            { id: 'a', data: {} },
            { id: 'Groß!', data: {} }
          ]
        },
        3
      )
    ).toBe(true)
    const ids = useLedWall.getState().walls.map((w) => w.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids[0]).toBe('a')
  })
})
