import { describe, expect, it } from 'vitest'
import { fotoHashesIn, fotoUrl, isFotoHash, replaceFotoUrls } from './fotos'

const A = 'a'.repeat(64)
const B = '0123456789abcdef'.repeat(4)

describe('Foto-Adressen', () => {
  it('Hash nur als 64 kleine Hex-Zeichen', () => {
    expect(isFotoHash(A)).toBe(true)
    expect(isFotoHash(A.toUpperCase())).toBe(false)
    expect(isFotoHash(A.slice(1))).toBe(false)
    expect(isFotoHash('../' + A.slice(3))).toBe(false)
    expect(isFotoHash(42)).toBe(false)
  })

  it('findet und ersetzt die Adressen im HTML', () => {
    const html = `<img src="${fotoUrl(A)}"><p>${fotoUrl(B)}</p><img src="${fotoUrl(A)}">`
    expect(fotoHashesIn(html)).toEqual([A, B])
    const out = replaceFotoUrls(html, (h) => (h === A ? `fotos/${h}.jpg` : null))
    expect(out).toBe(`<img src="fotos/${A}.jpg"><p>${fotoUrl(B)}</p><img src="fotos/${A}.jpg">`)
  })

  it('übersieht zu kurze oder großgeschriebene Hashes', () => {
    expect(fotoHashesIn(`foto://bild/${A.slice(1)} foto://bild/${A.toUpperCase()}`)).toEqual([])
  })
})
