import { describe, expect, it } from 'vitest'
import { CPU_ENCODERS, PRORES_FAST } from '@shared/encoderChoice'
import type { ConverterEncoderStatus, EncoderInfo } from '@shared/types'
import { encoderView } from './encoder'

const nvenc: EncoderInfo = {
  id: 'h264_nvenc',
  label: 'NVIDIA NVENC (GPU)',
  hardware: true,
  compat: true
}
const vt: EncoderInfo = {
  id: 'h264_videotoolbox',
  label: 'Apple VideoToolbox (GPU)',
  hardware: true,
  compat: false
}
const vtProres: EncoderInfo = {
  id: 'prores_videotoolbox',
  label: 'Apple VideoToolbox (Hardware)',
  hardware: true
}

function status(h264: EncoderInfo[], prores: EncoderInfo[] = []): ConverterEncoderStatus {
  return {
    h264: [...h264, CPU_ENCODERS.h264],
    hevc: [CPU_ENCODERS.hevc],
    prores: [...prores, PRORES_FAST, CPU_ENCODERS.prores]
  }
}
const plain = { compat: false, keepAlpha: false }

describe('Encoder-Anzeige im Konverter', () => {
  it('Nur CPU steht ohne Erkennung fest, Automatisch wartet auf sie', () => {
    expect(encoderView(null, 'h264', 'cpu', plain).encoder).toBe(CPU_ENCODERS.h264)
    expect(encoderView(null, 'prores', 'cpu', plain).encoder).toBe(CPU_ENCODERS.prores)
    const loading = encoderView(null, 'hevc', 'auto', plain)
    expect(loading.encoder).toBeNull()
    expect(loading.hint).toMatch(/Prüfe/)
  })

  it('zeigt die GPU – oder warum es die CPU wird', () => {
    const gpu = encoderView(status([nvenc]), 'h264', 'auto', plain)
    expect(gpu.encoder).toBe(nvenc)
    expect(gpu.hint).toContain('NVIDIA NVENC (GPU)')
    const none = encoderView(status([]), 'hevc', 'auto', plain)
    expect(none.encoder).toBe(CPU_ENCODERS.hevc)
    expect(none.hint).toMatch(/Keine nutzbare GPU/)
    // Player-Boxen mit VideoToolbox: Grenzen nicht zusicherbar -> CPU, mit Begründung
    const box = encoderView(status([vt]), 'h264', 'auto', { compat: true, keepAlpha: false })
    expect(box.encoder).toBe(CPU_ENCODERS.h264)
    expect(box.hint).toMatch(/Player-Boxen.*Apple VideoToolbox/)
    expect(encoderView(status([vt]), 'h264', 'auto', plain).encoder).toBe(vt)
  })

  it('ProRes: schnell über Hardware bzw. prores_aw, Transparenz über die CPU', () => {
    const pc = encoderView(status([]), 'prores', 'auto', plain)
    expect(pc.encoder).toBe(PRORES_FAST)
    expect(pc.hint).toMatch(/über der ProRes-Datenrate/)
    const mac = encoderView(status([], [vtProres]), 'prores', 'auto', {
      compat: false,
      keepAlpha: true
    })
    expect(mac.encoder).toBe(vtProres)
    expect(mac.hint).toMatch(/Transparenz.*prores_aw/)
  })
})
