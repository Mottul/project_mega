import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
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

const { approvePath, openProject, saveSection } = await import('./projectFiles')
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
afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

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

  it('Sicherungen gehören zur Datei: gleichnamige Dateien in anderen Ordnern löschen sie nicht', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    let t = new Date(2026, 9, 16, 10, 0, 0).getTime()
    const tick = (): void => {
      t += 1000
      vi.setSystemTime(t)
    }
    const paths = ['Kunde-A', 'Kunde-B'].map((k) => {
      mkdirSync(join(dir, k))
      const p = join(dir, k, 'Messe.mottul')
      approvePath(p)
      return p
    })
    const sha = new Map<string, string>()
    const save = async (p: string, widthM: string): Promise<void> => {
      tick()
      const r = await saveSection({ ...request(p), data: { widthM }, baseSha: sha.get(p) ?? null })
      if (!r.ok) throw new Error(r.reason)
      sha.set(p, r.sha256)
    }
    await save(paths[0], '1')
    await save(paths[0], '2') // eine Sicherung von A
    await save(paths[1], '1')
    for (let i = 2; i <= 13; i++) await save(paths[1], String(i)) // B: 12 Sicherungen -> 10
    const backups = readdirSync(join(sim.userData, 'Sicherungen'))
    const prefixes = new Set(backups.map((f) => f.slice(0, -'-20261016-100000.mottul'.length)))
    expect(prefixes.size).toBe(2)
    expect(backups).toHaveLength(11)
  })

  it('zweimal Speichern in derselben Sekunde behält die ältere Sicherung', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 16, 10, 0, 0))
    const path = join(dir, 'Schnell.mottul')
    approvePath(path)
    const r1 = await saveSection({ ...request(path), data: { widthM: '1' } })
    if (!r1.ok) throw new Error(r1.reason)
    const r2 = await saveSection({ ...request(path), data: { widthM: '2' }, baseSha: r1.sha256 })
    if (!r2.ok) throw new Error(r2.reason)
    const r3 = await saveSection({ ...request(path), data: { widthM: '3' }, baseSha: r2.sha256 })
    expect(r3.ok).toBe(true)
    const [backup, ...rest] = readdirSync(join(sim.userData, 'Sicherungen'))
    expect(rest).toEqual([])
    const saved = unpackProject(readFileSync(join(sim.userData, 'Sicherungen', backup)))
    expect(saved.ok && saved.container.file.abschnitte.ledWall.data).toEqual({ widthM: '1' })
  })
})

describe('Projektdatei – Fotos', () => {
  const bytes = (n: number): Buffer => Buffer.from(Array.from({ length: 64 }, (_, i) => i * n))
  const hashOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
  const fotoDir = (): string => join(sim.userData, 'Projektfotos')
  /** Foto in den Foto-Speicher legen, wie es das Einfügen täte */
  function stored(n: number): string {
    const b = bytes(n)
    mkdirSync(fotoDir(), { recursive: true })
    writeFileSync(join(fotoDir(), `${hashOf(b)}.jpg`), b)
    return hashOf(b)
  }
  const fotosIn = (path: string): string[] => {
    const r = unpackProject(readFileSync(path))
    if (!r.ok) throw new Error(r.reason)
    return [...r.container.fotos.keys()].sort()
  }

  it('Speichern holt benutzte Fotos aus dem Foto-Speicher; nicht mehr benutzte fallen weg', async () => {
    const path = join(dir, 'Fotos.mottul')
    approvePath(path)
    const [a, b] = [stored(1), stored(2)]
    const r1 = await saveSection({ ...request(path), data: { f: [a, b] }, fotos: [a, b, a] })
    if (!r1.ok) throw new Error(r1.reason)
    expect(fotosIn(path)).toEqual([a, b].sort())
    // Foto a ist inzwischen aus dem Speicher verschwunden – steht aber schon in der Datei
    rmSync(join(fotoDir(), `${a}.jpg`))
    const r2 = await saveSection({
      ...request(path),
      data: { f: [a] },
      fotos: [a],
      baseSha: r1.sha256
    })
    expect(r2.ok).toBe(true)
    expect(fotosIn(path)).toEqual([a])
  })

  it('fehlt ein Foto überall, wird nichts geschrieben', async () => {
    const path = join(dir, 'Fehlt.mottul')
    writeForeignFile(path)
    const before = readFileSync(path)
    approvePath(path)
    const r = await saveSection({ ...request(path), fotos: ['f'.repeat(64)] })
    expect(r).toEqual({ ok: false, reason: 'foto-fehlt' })
    expect(readFileSync(path).equals(before)).toBe(true)
  })

  it('ungültige Foto-Liste wird abgewiesen', async () => {
    const path = join(dir, 'Ungueltig.mottul')
    approvePath(path)
    const r = await saveSection({ ...request(path), fotos: ['../../etc/passwd'] })
    expect(r).toEqual({ ok: false, reason: 'ungueltig' })
    expect(existsSync(path)).toBe(false)
  })

  it('Öffnen legt die Fotos des Abschnitts ab – nur, wenn der Inhalt zum Hash passt', async () => {
    const good = bytes(3)
    const bad = bytes(4)
    const badHash = hashOf(bytes(5)) // Inhalt passt nicht zum Namen
    const c = emptyContainer(new Date())
    const put = putSection(c.file, 'ledWall', 2, { x: 1 }, null, false, new Date(), [
      hashOf(good),
      badHash
    ])
    if (!put.ok) throw new Error(put.reason)
    c.fotos.set(hashOf(good), { ext: 'jpg', data: good })
    c.fotos.set(badHash, { ext: 'png', data: bad })
    const packed = packProject({ ...c, file: put.file })
    if (!packed.ok) throw new Error(packed.reason)
    const path = join(dir, 'Kollege.mottul')
    writeFileSync(path, packed.buf)

    const r = await openProject(path, 'ledWall')
    expect(r.ok).toBe(true)
    expect(readdirSync(fotoDir())).toEqual([`${hashOf(good)}.jpg`])
  })
})
