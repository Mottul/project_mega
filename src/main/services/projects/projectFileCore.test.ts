import { describe, expect, it } from 'vitest'
import { PROJECT_JSON_NAME } from '@shared/projectFile'
import {
  backupName,
  backupsToDelete,
  emptyContainer,
  packProject,
  putSection,
  sectionInfos,
  sectionPayload,
  sectionSha,
  unpackProject,
  type ProjectContainer
} from './projectFileCore'
import { writeZip } from './zip'

const NOW = new Date('2026-10-16T10:00:00Z')
const LATER = new Date('2026-10-17T08:00:00Z')
const wall = { projectName: 'Messe', widthM: '4' }

function pack(c: ProjectContainer): Buffer {
  const r = packProject(c, NOW)
  if (!r.ok) throw new Error(r.reason)
  return r.buf
}

function withSection(c: ProjectContainer, key: string, data: unknown): ProjectContainer {
  const r = putSection(c.file, key, 2, data, null, false, NOW)
  if (!r.ok) throw new Error(r.reason)
  return { ...c, file: r.file }
}

describe('Projektdatei – Abschnitt einsetzen', () => {
  it('neuer Abschnitt bekommt rev 1 und sha256 über das kanonische JSON', () => {
    const r = putSection(emptyContainer(NOW).file, 'ledWall', 2, wall, null, false, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.section.rev).toBe(1)
    expect(r.section.sha256).toBe(sectionSha({ widthM: '4', projectName: 'Messe' }))
    expect(r.changed).toBe(true)
  })

  it('fremde Abschnitte bleiben unverändert', () => {
    const c = withSection(withSection(emptyContainer(NOW), 'anleitung', { x: 1 }), 'ledWall', wall)
    const before = c.file.abschnitte.anleitung
    const r = putSection(
      c.file,
      'ledWall',
      2,
      { ...wall, widthM: '5' },
      c.file.abschnitte.ledWall.sha256,
      false,
      LATER
    )
    expect(r.ok && r.file.abschnitte.anleitung).toBe(before)
  })

  it('rev zählt nur bei echter Änderung hoch', () => {
    const c = withSection(emptyContainer(NOW), 'ledWall', wall)
    const sha = c.file.abschnitte.ledWall.sha256
    const same = putSection(
      c.file,
      'ledWall',
      2,
      { widthM: '4', projectName: 'Messe' },
      sha,
      false,
      LATER
    )
    expect(same.ok && same.changed).toBe(false)
    expect(same.ok && same.section.rev).toBe(1)
    const changed = putSection(c.file, 'ledWall', 2, { ...wall, widthM: '6' }, sha, false, LATER)
    expect(changed.ok && changed.section.rev).toBe(2)
    expect(changed.ok && changed.section.geaendert).toBe(LATER.toISOString())
  })

  it('Konflikt, wenn der Abschnitt inzwischen anderswo geändert wurde', () => {
    const c = withSection(emptyContainer(NOW), 'ledWall', wall)
    const mine = { ...wall, widthM: '5' }
    const r = putSection(c.file, 'ledWall', 2, mine, 'f'.repeat(64), false, LATER)
    expect(r).toMatchObject({ ok: false, reason: 'konflikt', rev: 1 })
    // Hinzufügen erwartet, dass es den Abschnitt noch nicht gibt
    expect(putSection(c.file, 'ledWall', 2, mine, null, false, LATER)).toMatchObject({
      ok: false,
      reason: 'konflikt'
    })
    // bewusst überschreiben
    expect(putSection(c.file, 'ledWall', 2, { a: 1 }, null, true, LATER).ok).toBe(true)
  })

  it('kein Konflikt, wenn genau diese Fassung schon in der Datei steht (baseSha veraltet)', () => {
    const c = withSection(emptyContainer(NOW), 'ledWall', wall)
    const old = c.file.abschnitte.ledWall.sha256
    const mine = { ...wall, widthM: '5' }
    // gespeichert, aber die Antwort kam nie im Fenster an -> Bindung steht noch auf `old`
    const first = putSection(c.file, 'ledWall', 2, mine, old, false, LATER)
    if (!first.ok) throw new Error(first.reason)
    const again = putSection(first.file, 'ledWall', 2, mine, old, false, LATER)
    expect(again).toMatchObject({ ok: true, changed: false, section: { rev: 2 } })
  })

  it('Abschnitt einer neueren Mottulbox wird nie überschrieben – auch nicht erzwungen', () => {
    const c = emptyContainer(NOW)
    const r1 = putSection(c.file, 'ledWall', 3, wall, null, false, NOW)
    if (!r1.ok) throw new Error()
    expect(putSection(r1.file, 'ledWall', 2, wall, r1.section.sha256, true, LATER)).toMatchObject({
      ok: false,
      reason: 'neuer'
    })
  })
})

describe('Projektdatei – packen und lesen', () => {
  it('runder Weg mit fremdem Abschnitt, Foto und unbekanntem Eintrag', () => {
    const c = withSection(emptyContainer(NOW), 'ledWall', wall)
    const hash = 'b'.repeat(64)
    // „packliste“ schreibt diese Version noch nicht – ein fremder Abschnitt mit Foto
    c.file.abschnitte.packliste = {
      version: 1,
      rev: 4,
      sha256: sectionSha({ t: 1 }),
      geaendert: NOW.toISOString(),
      fotos: [hash],
      data: { t: 1 }
    }
    c.fotos.set(hash, { ext: 'jpg', data: Buffer.from([1, 2, 3]) })
    c.fotos.set('c'.repeat(64), { ext: 'png', data: Buffer.from([9]) }) // nicht mehr benutzt
    c.extra.set('zukunft/info.txt', Buffer.from('aus einer neueren Version'))
    const r = unpackProject(pack(c))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.container.file.abschnitte).toEqual(c.file.abschnitte)
    expect([...r.container.fotos.keys()]).toEqual([hash])
    expect(r.container.extra.get('zukunft/info.txt')?.toString()).toBe('aus einer neueren Version')
    expect(sectionInfos(r.container.file).map((s) => [s.key, s.label, s.known])).toEqual([
      ['ledWall', 'LED-Wall-Planung', true],
      ['packliste', 'Packliste', false]
    ])
    expect(sectionPayload(r.container.file, 'ledWall')?.data).toEqual(wall)
    expect(sectionPayload(r.container.file, 'anleitung')).toBeNull()
  })

  it('fremde und kaputte Dateien', () => {
    expect(unpackProject(Buffer.from('{"type":"packing-list"}'))).toEqual({
      ok: false,
      reason: 'kein-projekt'
    })
    const other = writeZip([{ name: 'readme.txt', data: Buffer.from('x'), compress: false }])
    expect(unpackProject(other)).toEqual({ ok: false, reason: 'kein-projekt' })
    const newer = writeZip([
      {
        name: PROJECT_JSON_NAME,
        data: Buffer.from(JSON.stringify({ type: 'projektdatei', version: 99, abschnitte: {} })),
        compress: true
      }
    ])
    expect(unpackProject(newer)).toEqual({ ok: false, reason: 'neuer' })
    const zip = pack(emptyContainer(NOW))
    zip[zip.length - 30] ^= 0xff // Verzeichnis beschädigen
    expect(unpackProject(zip).ok).toBe(false)
  })
})

describe('Projektdatei – nur schreiben, was sich wieder öffnen lässt', () => {
  it('projekt.json kompakt: ein großes Raster wächst nicht über die Lesegrenze', () => {
    const grid = Array.from({ length: 150 }, () => Array.from({ length: 200 }, () => -1))
    const c = withSection(emptyContainer(NOW), 'ledWall', { sig: grid, pwr: grid })
    const r = unpackProject(pack(c))
    expect(r.ok && r.container.file.abschnitte.ledWall.data).toEqual({ sig: grid, pwr: grid })
  })

  it('über der Lesegrenze: zu groß statt einer Datei, die nie wieder aufgeht', () => {
    // 3 Mio. Zeichen, als UTF-8 aber 9 MB (> 8 MB für projekt.json)
    const c = withSection(emptyContainer(NOW), 'ledWall', { notiz: '€'.repeat(3_000_000) })
    expect(packProject(c, NOW)).toEqual({ ok: false, reason: 'zu-gross' })
  })

  it('was das Lesen ablehnen würde, wird nicht geschrieben (rev über der sicheren Grenze)', () => {
    const c = withSection(emptyContainer(NOW), 'ledWall', wall)
    c.file.abschnitte.ledWall.rev = Number.MAX_SAFE_INTEGER
    const put = putSection(
      c.file,
      'ledWall',
      2,
      { ...wall, widthM: '9' },
      sectionSha(wall),
      false,
      NOW
    )
    if (!put.ok) throw new Error(put.reason)
    expect(packProject({ ...c, file: put.file }, NOW)).toEqual({ ok: false, reason: 'ungueltig' })
  })

  it('Abschnitt „constructor“ aus einer fremden Datei: Name bleibt Text', () => {
    const c = withSection(emptyContainer(NOW), 'constructor', { x: 1 })
    const r = unpackProject(pack(c))
    expect(r.ok && sectionInfos(r.container.file)).toEqual([
      { key: 'constructor', label: 'constructor', version: 2, rev: 1, known: false }
    ])
  })
})

describe('Projektdatei – Sicherungen', () => {
  it('Name mit Zeitstempel', () => {
    expect(backupName('Messe', new Date(2026, 9, 16, 8, 5, 9))).toBe('Messe-20261016-080509.mottul')
  })

  it('löscht nur ältere Sicherungen genau dieses Namens', () => {
    const files = [
      ...Array.from({ length: 12 }, (_, i) => backupName('Messe', new Date(2026, 9, i + 1, 10))),
      ...Array.from({ length: 12 }, (_, i) =>
        backupName('Messe-2026', new Date(2026, 9, i + 1, 10))
      ),
      'Messe.mottul',
      'notiz.txt'
    ]
    const del = backupsToDelete(files, 'Messe', 10)
    expect(del).toEqual([
      backupName('Messe', new Date(2026, 9, 2, 10)),
      backupName('Messe', new Date(2026, 9, 1, 10))
    ])
    expect(backupsToDelete(files, 'Messe-2026', 10)).toHaveLength(2)
    expect(backupsToDelete(files, 'Messe', 20)).toEqual([])
  })
})
