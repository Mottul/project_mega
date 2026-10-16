import { describe, expect, it } from 'vitest'
import {
  canonicalJson,
  digest,
  isProjectPath,
  parseProjectJson,
  projectDisplayName,
  projectFileName,
  PROJECT_VERSION
} from './projectFile'

const SHA = 'a'.repeat(64)

const file = (abschnitte: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: 'mottulbox',
    type: 'projektdatei',
    version: 1,
    geaendert: '2026-10-16T10:00:00Z',
    abschnitte,
    ...extra
  })

const section = (p: Record<string, unknown> = {}) => ({
  version: 2,
  rev: 3,
  sha256: SHA,
  geaendert: '2026-10-16T10:00:00Z',
  fotos: [],
  data: { a: 1 },
  ...p
})

describe('Projektdatei – kanonisches JSON und Prüfsumme', () => {
  it('Schlüsselreihenfolge spielt keine Rolle, Listenreihenfolge schon', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe(
      '{"a":{"c":"x","d":[1,2]},"b":1}'
    )
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }))
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]))
  })

  it('undefined fällt weg wie bei JSON.stringify', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}')
    expect(canonicalJson([undefined, 1])).toBe('[null,1]')
    expect(canonicalJson(undefined)).toBe('null')
  })

  it('digest: gleicher Inhalt -> gleich, Änderung -> anders', () => {
    expect(digest({ a: 1, b: [1, 2] })).toBe(digest({ b: [1, 2], a: 1 }))
    expect(digest({ a: 1 })).not.toBe(digest({ a: 2 }))
    expect(digest('Wand')).not.toBe(digest('wand'))
  })
})

describe('Projektdatei – Inhalt prüfen', () => {
  it('gültige Datei mit Abschnitt', () => {
    const r = parseProjectJson(file({ ledWall: section() }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.file.abschnitte.ledWall).toEqual(section())
  })

  it('unbekannte Abschnitte bleiben erhalten', () => {
    const r = parseProjectJson(file({ ledWall: section(), anleitung: section({ rev: 9 }) }))
    expect(r.ok && Object.keys(r.file.abschnitte)).toEqual(['ledWall', 'anleitung'])
  })

  it('fremde, neuere und kaputte Dateien', () => {
    expect(parseProjectJson('nicht json')).toEqual({ ok: false, reason: 'kein-json' })
    expect(parseProjectJson(JSON.stringify({ type: 'packing-list' }))).toEqual({
      ok: false,
      reason: 'fremd'
    })
    expect(parseProjectJson(file({}, { version: PROJECT_VERSION + 1 }))).toEqual({
      ok: false,
      reason: 'neuer'
    })
    // ein kaputter Abschnitt macht alles ungültig – sonst ginge er beim Speichern verloren
    for (const bad of [
      section({ sha256: 'xyz' }),
      section({ rev: -1 }),
      section({ fotos: ['../etc/passwd'] }),
      { version: 1, rev: 1, sha256: SHA, geaendert: '', fotos: [] }
    ]) {
      expect(parseProjectJson(file({ ledWall: bad }))).toEqual({ ok: false, reason: 'kaputt' })
    }
    expect(parseProjectJson(file({ '../x': section() }))).toEqual({ ok: false, reason: 'kaputt' })
  })
})

describe('Projektdatei – Pfade und Namen', () => {
  it('nur absolute .mottul-Pfade', () => {
    expect(isProjectPath('C:\\Projekte\\Messe.mottul')).toBe(true)
    expect(isProjectPath('/home/a/Messe.MOTTUL')).toBe(true)
    expect(isProjectPath('Messe.mottul')).toBe(false)
    expect(isProjectPath('C:\\Projekte\\Messe.json')).toBe(false)
    expect(isProjectPath('http://x/Messe.mottul')).toBe(false)
  })

  it('Dateiname aus dem Projektnamen', () => {
    expect(projectFileName('Messe Dornbirn 2026')).toBe('Messe Dornbirn 2026.mottul')
    expect(projectFileName('A/B: "C"?')).toBe('A B C.mottul')
    expect(projectFileName('   ')).toBe('Projekt.mottul')
    expect(projectFileName('Ende...')).toBe('Ende.mottul')
  })

  it('Anzeigename ohne Ordner und Endung', () => {
    expect(projectDisplayName('C:\\P\\Messe Dornbirn.mottul')).toBe('Messe Dornbirn')
    expect(projectDisplayName('/p/x.MOTTUL')).toBe('x')
  })
})
