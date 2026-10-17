import { describe, expect, it } from 'vitest'
import { digest } from '@shared/projectFile'
import { MINI_MANUAL_FILE, beschreibe } from './fileSection'
import { fotosIn } from './model'
import { migrateMiniManual, useMiniManual } from './store'
import { neueAnleitung } from './vorlage'

describe('Mini-Manual – gespeicherter Stand', () => {
  it('unbrauchbarer Stand -> neue Anleitung, Bindung nur wenn gültig', () => {
    expect(migrateMiniManual(null)).toEqual({ anleitung: neueAnleitung(), file: null })
    expect(migrateMiniManual({ anleitung: 'kaputt', file: { path: 'x' } })).toEqual({
      anleitung: neueAnleitung(),
      file: null
    })
    const b = {
      path: 'C:/p/a.mottul',
      name: 'a',
      baseSha: 'a'.repeat(64),
      rev: 2,
      savedDigest: 'x'
    }
    expect(migrateMiniManual({ anleitung: neueAnleitung(), file: b }).file).toEqual(b)
  })

  it('die Datei enthält nur die Anleitung, keinen Bedienzustand und keine Bindung', () => {
    const s = useMiniManual.getState()
    const data = MINI_MANUAL_FILE.data(s) as Record<string, unknown>
    expect(Object.keys(data).sort()).toEqual(Object.keys(neueAnleitung()).sort())
    expect(data).not.toHaveProperty('file')
  })

  it('eine unberührte neue Anleitung hat nichts zu verlieren; eine Änderung schon', () => {
    useMiniManual.getState().replace(neueAnleitung())
    expect(MINI_MANUAL_FILE.isEmpty(useMiniManual.getState())).toBe(true)
    useMiniManual.getState().update((a) => ({ ...a, deckblatt: { ...a.deckblatt, projekt: 'X' } }))
    expect(MINI_MANUAL_FILE.isEmpty(useMiniManual.getState())).toBe(false)
    expect(digest(MINI_MANUAL_FILE.blank())).toBe(digest(neueAnleitung()))
  })

  it('übernimmt Daten aus der Datei geprüft; beschreibt sie für Rückfragen; meldet Fotos', () => {
    const a = neueAnleitung()
    a.deckblatt = { ...a.deckblatt, projekt: 'Messe', kunde: 'Kunde', foto: 'f'.repeat(64) }
    expect(MINI_MANUAL_FILE.apply({ ...a, titel: 42 }, 1)).toBe(true)
    const s = useMiniManual.getState().anleitung
    expect(s.titel).toBe('So bedienst du deine LED-Wall')
    expect(beschreibe(s)).toBe('Messe · Kunde')
    expect(MINI_MANUAL_FILE.fotos?.(s)).toEqual(fotosIn(s))
    expect(MINI_MANUAL_FILE.apply('kein Objekt', 1)).toBe(false)
  })
})
