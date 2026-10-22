import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { binaryVersion } from './binaryVersion'

// node selbst als Hilfsprogramm: läuft überall, wo die Tests laufen
const node = process.execPath
const opts = { timeoutMs: 10_000 }

describe('binaryVersion', () => {
  it('liefert die erste Zeile der Ausgabe', async () => {
    const v = await binaryVersion(node, ['-e', 'console.log("erste\\nzweite")'], opts)
    expect(v).toBe('erste')
  })

  it('liefert null, wenn es das Programm nicht gibt oder es mit Fehler endet', async () => {
    expect(await binaryVersion(join(tmpdir(), 'gibt-es-nicht.exe'), ['-version'], opts)).toBeNull()
    expect(await binaryVersion(node, ['-e', 'process.exit(3)'], opts)).toBeNull()
  })

  it('wartet nicht auf das Programm (der main-Prozess bleibt frei)', async () => {
    const t0 = Date.now()
    const v = binaryVersion(node, ['-e', 'setTimeout(() => console.log("spät"), 1000)'], opts)
    // Nur das Starten des Prozesses kostet Zeit, nicht seine Laufzeit
    expect(Date.now() - t0).toBeLessThan(500)
    expect(await v).toBe('spät')
  })

  it('merkt sich einen Fehlschlag nicht (Zeitlimit beim ersten Start)', async () => {
    const args = ['-e', 'setTimeout(() => console.log("langsam"), 1500)']
    expect(await binaryVersion(node, args, { timeoutMs: 300 })).toBeNull()
    // nächste Abfrage startet neu – mit genug Zeit klappt es
    expect(await binaryVersion(node, args, opts)).toBe('langsam')
  })

  it('startet für gleichzeitige Abfragen nur einen Prozess', () => {
    const args = ['-e', 'console.log("einmal")']
    expect(binaryVersion(node, args, opts)).toBe(binaryVersion(node, args, opts))
  })
})
