import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fileUrlInDir } from './fileUrlInDir'

const dir = join(tmpdir(), 'mottulbox-pdf-abc123')
const url = (...parts: string[]): string => pathToFileURL(join(dir, ...parts)).href

describe('fileUrlInDir', () => {
  it('lässt Dateien im Ordner zu, auch in Unterordnern und mit Umlauten/Leerzeichen', () => {
    expect(fileUrlInDir(url('seite.html'), dir)).toBe(true)
    expect(fileUrlInDir(url('fotos', 'ab12.jpg'), dir)).toBe(true)
    expect(fileUrlInDir(url('Foto mit Ü.jpg'), dir)).toBe(true)
  })

  it('sperrt den Ordner selbst, Pfade außerhalb und Nachbarordner mit gleichem Anfang', () => {
    expect(fileUrlInDir(pathToFileURL(dir).href, dir)).toBe(false)
    expect(fileUrlInDir(pathToFileURL(join(dir, '..', 'x.png')).href, dir)).toBe(false)
    expect(fileUrlInDir(pathToFileURL(dir + '-anders/x.png').href, dir)).toBe(false)
    // „..“ in der Adresse selbst löst schon der URL-Parser auf
    expect(fileUrlInDir(url('seite.html').replace('/seite.html', '/../x.png'), dir)).toBe(false)
  })

  it('sperrt fremde Hosts (UNC-Freigaben) und andere Schemata', () => {
    expect(fileUrlInDir('file://server/freigabe/x.png', dir)).toBe(false)
    expect(fileUrlInDir('file://127.0.0.1/c$/x.png', dir)).toBe(false)
    expect(fileUrlInDir('https://example.com/x.png', dir)).toBe(false)
    expect(fileUrlInDir('data:image/png;base64,AAAA', dir)).toBe(false)
  })
})
