import { describe, expect, it } from 'vitest'
import { buildVersion, lfText, type BuildDatei } from './buildHash'

const BUILD: BuildDatei[] = [
  ['index.html', '<!doctype html><title>MottulBox</title>'],
  ['assets/index-abc.js', 'console.log(1)'],
  ['icons/icon-192.png', new Uint8Array([137, 80, 78, 71])],
  ['icons/icon-512.png', new Uint8Array([137, 80, 78, 72])]
]

describe('Kennung der Version aus dem Build', () => {
  it('ist 12 Zeichen hex', () => {
    expect(buildVersion(BUILD)).toMatch(/^[0-9a-f]{12}$/)
  })

  it('hängt nicht von der Reihenfolge der Dateien ab (Windows und CI liefern sie verschieden)', () => {
    const v = buildVersion(BUILD)
    expect(buildVersion([...BUILD].reverse())).toBe(v)
    expect(buildVersion([BUILD[2], BUILD[0], BUILD[3], BUILD[1]])).toBe(v)
  })

  it('ändert sich mit jedem Inhalt und jedem Namen', () => {
    const v = buildVersion(BUILD)
    const anders = (i: number, d: BuildDatei): BuildDatei[] => BUILD.map((x, j) => (j === i ? d : x))
    expect(buildVersion(anders(1, ['assets/index-abc.js', 'console.log(2)']))).not.toBe(v)
    expect(buildVersion(anders(1, ['assets/index-abd.js', 'console.log(1)']))).not.toBe(v)
    expect(buildVersion(anders(2, ['icons/icon-192.png', new Uint8Array([137, 80, 78, 70])]))).not.toBe(
      v
    )
    expect(buildVersion(BUILD.slice(1))).not.toBe(v)
  })

  it('verbindet keine zwei Dateilisten zum selben Text', () => {
    expect(buildVersion([['a', 'bc']])).not.toBe(buildVersion([['ab', 'c']]))
    expect(buildVersion([['a', 'b'], ['c', 'd']])).not.toBe(buildVersion([['a', 'bc'], ['', 'd']]))
  })

  it('index.html aus Windows (CRLF) und aus der CI (LF) ergibt dieselbe Kennung', () => {
    const lf = '<!doctype html>\n<html>\n  <head></head>\n</html>\n'
    const crlf = lf.replace(/\n/g, '\r\n')
    expect(lfText(crlf)).toBe(lf)
    expect(lfText(new TextEncoder().encode(crlf))).toBe(lf)
    expect(lfText(lf)).toBe(lf)
    expect(buildVersion([['index.html', lfText(crlf)]])).toBe(buildVersion([['index.html', lf]]))
  })

  it('Text und dieselben Bytes ergeben dieselbe Kennung (index.html kommt als Text oder Bytes)', () => {
    const text = 'Größe – „Neu laden“'
    expect(buildVersion([['index.html', text]])).toBe(
      buildVersion([['index.html', new TextEncoder().encode(text)]])
    )
  })
})
