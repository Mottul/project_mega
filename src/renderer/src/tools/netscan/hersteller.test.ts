import { describe, expect, it } from 'vitest'
import { herstellerSuchbegriff } from './hersteller'

describe('Hersteller als Handbuch-Suche', () => {
  it('ohne Rechtsform, Branchenwort und Stadt vorne', () => {
    expect(herstellerSuchbegriff("Xi'an NovaStar Tech Co., Ltd.")).toBe('NovaStar')
    expect(herstellerSuchbegriff('Brompton Technology Ltd')).toBe('Brompton')
    expect(herstellerSuchbegriff('Shenzhen Colorlight Cloud Tech. Co., Ltd')).toBe('Colorlight')
    expect(herstellerSuchbegriff('Apple, Inc.')).toBe('Apple')
    expect(herstellerSuchbegriff('Blackmagic Design Pty Ltd')).toBe('Blackmagic')
  })
  it('nur Füllwörter oder leer: das Erste bzw. nichts', () => {
    expect(herstellerSuchbegriff('Tech Co.')).toBe('Tech')
    expect(herstellerSuchbegriff('   ')).toBe('')
  })
})
