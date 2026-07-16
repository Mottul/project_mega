import { describe, expect, it } from 'vitest'
import { classify } from './ports'

const base = {
  ports: [] as number[],
  vendor: null as string | null,
  services: [] as { type: string }[]
}

describe('ports – classify', () => {
  it('NovaStar an Port 5200', () => {
    expect(classify({ ...base, ports: [80, 5200] })).toBe('novastar')
  })
  it('ATEM per UDP-Flag oder Blackmagic-Hersteller', () => {
    expect(classify({ ...base, atem: true })).toBe('atem')
    expect(classify({ ...base, vendor: 'Blackmagic Design' })).toBe('atem')
  })
  it('Projektor an PJLink 4352', () => {
    expect(classify({ ...base, ports: [4352, 80] })).toBe('projector')
  })
  it('Kamera per RTSP oder Kamera-Hersteller mit Web', () => {
    expect(classify({ ...base, ports: [554] })).toBe('camera')
    expect(classify({ ...base, ports: [80], vendor: 'Axis Communications' })).toBe('camera')
    expect(classify({ ...base, services: [{ type: '_rtsp._tcp' }] })).toBe('camera')
  })
  it('Computer per RDP/SMB/VNC', () => {
    expect(classify({ ...base, ports: [3389, 445] })).toBe('computer')
    expect(classify({ ...base, ports: [5900] })).toBe('computer')
  })
  it('Drucker per IPP/PDL-Dienst (auch mit Web)', () => {
    expect(classify({ ...base, ports: [80], services: [{ type: '_ipp._tcp' }] })).toBe('printer')
    expect(classify({ ...base, services: [{ type: '_pdl-datastream._tcp' }] })).toBe('printer')
  })
  it('Web-Gerät als Rückfall bei HTTP', () => {
    expect(classify({ ...base, ports: [80, 443] })).toBe('web')
  })
  it('Unbekannt ohne Merkmale', () => {
    expect(classify({ ...base, ports: [23] })).toBe('unknown')
  })
})
