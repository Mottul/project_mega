import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Dateisystem echt (Ordner im tmp), nur stat lässt sich einmalig stören: so wie ein Netzlaufwerk,
// das kurz hakt, oder eine Datei, die ein Kollege genau zwischen Lesen und Anlegen schreibt.
const sim = vi.hoisted(() => ({ statError: null as string | null, userData: '' }))

vi.mock('electron', () => ({ app: { getPath: () => sim.userData } }))
vi.mock('../log', () => ({ logLine: vi.fn() }))
vi.mock('../store', () => {
  let recent: string[] = []
  return {
    getSettings: () => ({ projects: { dir: '', recent } }),
    setSettings: (p: { projects?: { recent?: string[] } }) => {
      if (p.projects?.recent) recent = p.projects.recent
    }
  }
})
vi.mock('node:fs/promises', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...orig,
    stat: async (...args: Parameters<typeof orig.stat>) => {
      const code = sim.statError
      if (code) {
        sim.statError = null
        throw Object.assign(new Error(`${code}: simuliert`), { code })
      }
      return orig.stat(...args)
    }
  }
})

const { approvePath, saveSection } = await import('./projectFiles')
const { emptyContainer, packProject, putSection, unpackProject } = await import('./projectFileCore')

let dir = ''

/** Projektdatei mit einem fremden Abschnitt (Anleitung) auf die Platte legen */
function writeForeignFile(path: string): void {
  const c = emptyContainer(new Date())
  const put = putSection(
    c.file,
    'anleitung',
    1,
    { titel: 'So bedienst du' },
    null,
    false,
    new Date()
  )
  if (!put.ok) throw new Error(put.reason)
  const packed = packProject({ ...c, file: put.file })
  if (!packed.ok) throw new Error(packed.reason)
  writeFileSync(path, packed.buf)
}

function sectionsOf(path: string): string[] {
  const r = unpackProject(readFileSync(path))
  if (!r.ok) throw new Error(r.reason)
  return Object.keys(r.container.file.abschnitte).sort()
}

const request = (path: string) => ({
  path,
  section: 'ledWall',
  version: 2,
  data: { projectName: 'Messe' },
  baseSha: null,
  force: false
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mottul-projekte-'))
  sim.userData = join(dir, 'userData')
  sim.statError = null
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('Projektdatei speichern – Dateisystem', () => {
  it('ein Lesefehler ist kein „fehlt“: die vorhandene Datei bleibt, wie sie ist', async () => {
    const path = join(dir, 'Messe.mottul')
    writeForeignFile(path)
    const before = readFileSync(path)
    approvePath(path)
    sim.statError = 'ETIMEDOUT'
    expect(await saveSection(request(path))).toEqual({ ok: false, reason: 'fehler' })
    expect(readFileSync(path).equals(before)).toBe(true)
  })

  it('taucht die Datei zwischen Lesen und Anlegen auf, wird sie ergänzt statt ersetzt', async () => {
    const path = join(dir, 'Kollege.mottul')
    writeForeignFile(path)
    approvePath(path)
    sim.statError = 'ENOENT' // beim Lesen „noch nicht da“, beim Anlegen schon
    const r = await saveSection(request(path))
    expect(r.ok).toBe(true)
    expect(sectionsOf(path)).toEqual(['anleitung', 'ledWall'])
  })

  it('neue Datei wird angelegt', async () => {
    const path = join(dir, 'Unterordner', 'Neu.mottul')
    approvePath(path)
    expect(await saveSection(request(path))).toMatchObject({ ok: true, rev: 1, name: 'Neu' })
    expect(sectionsOf(path)).toEqual(['ledWall'])
  })

  it('zu große Daten werden nicht geschrieben (die Datei ließe sich nie wieder öffnen)', async () => {
    const path = join(dir, 'Riesig.mottul')
    writeForeignFile(path)
    const before = readFileSync(path)
    approvePath(path)
    // 3 Mio. Zeichen bestehen die Prüfung der Abschnittslänge, sind als UTF-8 aber 9 MB
    const r = await saveSection({ ...request(path), data: { notiz: '€'.repeat(3_000_000) } })
    expect(r).toEqual({ ok: false, reason: 'zu-gross' })
    expect(readFileSync(path).equals(before)).toBe(true)
  })
})
