import { describe, expect, it } from 'vitest'
import { vendorFor } from './oui'

describe('oui – vendorFor', () => {
  it('erkennt bekannte OUIs (erste drei Oktette)', () => {
    expect(vendorFor('b8:27:eb:11:22:33')).toBe('Raspberry Pi')
    expect(vendorFor('7c:2e:0d:aa:bb:cc')).toBe('Blackmagic Design')
    expect(vendorFor('00:40:8c:00:00:01')).toBe('Axis Communications')
  })
  it('liefert null für Unbekanntes/leeres', () => {
    expect(vendorFor('ff:ff:ff:00:00:00')).toBeNull()
    expect(vendorFor(null)).toBeNull()
  })
})
