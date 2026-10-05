import { describe, expect, it } from 'vitest'
import { CPU_ENCODERS, PRORES_FAST, pickEncoder } from './encoderChoice'
import type { EncoderInfo } from './types'

const nvenc: EncoderInfo = { id: 'h264_nvenc', label: 'NVENC', hardware: true, compat: true }
const vtH264: EncoderInfo = { id: 'h264_videotoolbox', label: 'VT', hardware: true, compat: false }
const vtProres: EncoderInfo = { id: 'prores_videotoolbox', label: 'VT', hardware: true }

describe('Encoder-Wahl', () => {
  it('Automatisch = schnellster geprüfter, Nur CPU = klassischer Encoder', () => {
    const list = [nvenc, CPU_ENCODERS.h264]
    expect(pickEncoder(list, 'h264', 'auto')).toBe(nvenc)
    expect(pickEncoder(list, 'h264', 'cpu')).toBe(CPU_ENCODERS.h264)
    // ohne GPU (oder noch leere Liste) immer die CPU
    expect(pickEncoder([CPU_ENCODERS.hevc], 'hevc', 'auto')).toBe(CPU_ENCODERS.hevc)
    expect(pickEncoder([], 'hevc', 'auto')).toBe(CPU_ENCODERS.hevc)
  })

  it('Player-Boxen: nur Encoder, die Level und Bitraten-Deckel einhalten', () => {
    const list = [vtH264, CPU_ENCODERS.h264]
    expect(pickEncoder(list, 'h264', 'auto')).toBe(vtH264)
    expect(pickEncoder(list, 'h264', 'auto', { compat: true })).toBe(CPU_ENCODERS.h264)
    expect(pickEncoder([nvenc, CPU_ENCODERS.h264], 'h264', 'auto', { compat: true })).toBe(nvenc)
  })

  it('ProRes: schnell (Hardware, sonst prores_aw), mit Alpha nie über Hardware', () => {
    const mac = [vtProres, PRORES_FAST, CPU_ENCODERS.prores]
    expect(pickEncoder(mac, 'prores', 'auto')).toBe(vtProres)
    expect(pickEncoder(mac, 'prores', 'auto', { alpha: true })).toBe(PRORES_FAST)
    expect(pickEncoder(mac, 'prores', 'cpu', { alpha: true })).toBe(CPU_ENCODERS.prores)
    const pc = [PRORES_FAST, CPU_ENCODERS.prores]
    expect(pickEncoder(pc, 'prores', 'auto')).toBe(PRORES_FAST)
    expect(pickEncoder(pc, 'prores', 'cpu')).toBe(CPU_ENCODERS.prores)
  })
})
