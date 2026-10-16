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
    expect(out.presets[0].data).toMatchObject({ widthM: '6', sigMeta: {}, feed: 'bottom-center' })
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
})
