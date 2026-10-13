import { describe, expect, it } from 'vitest'
import { audioFrame, clampNdiSize, isAudioChunk, peakOf, videoFrame } from './ndiFrames'
import type { Grandiose } from './ndi'

const g = { FOURCC_BGRA: 11, FOURCC_FLTp: 22, FORMAT_TYPE_PROGRESSIVE: 1 } as Grandiose
const defaults = { name: 'Mottulbox Timer', width: 1920, height: 1080, fps: 30 }

describe('NDI-Frames', () => {
  it('begrenzt Name, Auflösung und Bildrate; Unbrauchbares wird zur Vorgabe', () => {
    expect(clampNdiSize({ name: '  Bühne ', width: 99999, height: 10, fps: 0 }, defaults)).toEqual({
      name: 'Bühne',
      width: 3840,
      height: 180,
      fps: 1
    })
    expect(clampNdiSize({ name: '', width: NaN, height: undefined, fps: 29.6 }, defaults)).toEqual({
      ...defaults,
      fps: 30
    })
    // Werte aus dem Renderer sind fremde Eingaben – auch ein falscher Typ darf nichts sprengen
    const odd = { name: 42, width: '800' } as unknown as Partial<typeof defaults>
    expect(clampNdiSize(odd, defaults)).toEqual(defaults)
    expect(clampNdiSize({ name: 'x'.repeat(300) }, defaults).name).toHaveLength(128)
  })

  it('Videoframe: BGRA, Schrittweite 4 Bytes je Pixel, Bildrate in Tausendsteln', () => {
    const data = Buffer.alloc(4 * 2 * 4)
    expect(videoFrame(g, 4, 2, 25, data)).toEqual({
      type: 'video',
      xres: 4,
      yres: 2,
      frameRateN: 25000,
      frameRateD: 1000,
      pictureAspectRatio: 2,
      frameFormatType: 1,
      lineStrideBytes: 16,
      fourCC: 11,
      data
    })
  })

  it('Tonblock: nur gleich lange Float32-Kanäle mit üblicher Abtastrate', () => {
    const ok = { sampleRate: 48000, channels: [new Float32Array(128), new Float32Array(128)] }
    expect(isAudioChunk(ok)).toBe(true)
    // ungleich lange Kanäle: das Binding läse über das Ende des kürzeren hinaus
    expect(isAudioChunk({ ...ok, channels: [new Float32Array(128), new Float32Array(64)] })).toBe(
      false
    )
    expect(isAudioChunk({ ...ok, channels: [] })).toBe(false)
    expect(isAudioChunk({ ...ok, channels: [[0.1, 0.2]] })).toBe(false)
    expect(isAudioChunk({ ...ok, channels: [new Float32Array(0)] })).toBe(false)
    expect(isAudioChunk({ ...ok, sampleRate: 0 })).toBe(false)
    expect(isAudioChunk({ ...ok, sampleRate: NaN })).toBe(false)
    expect(
      isAudioChunk({ ...ok, channels: Array.from({ length: 17 }, () => new Float32Array(8)) })
    ).toBe(false)
    expect(isAudioChunk(null)).toBe(false)
    expect(audioFrame(g, { sampleRate: 'x' })).toBeNull()
  })

  it('Audioframe: Kanäle nacheinander (planar), Schrittweite = Samples × 4', () => {
    const left = new Float32Array([0.5, -0.25])
    // Ausschnitt aus einem größeren Puffer: nur die eigenen Bytes dürfen hinein
    const right = new Float32Array([9, 0.75, 1, 9]).subarray(1, 3)
    const frame = audioFrame(g, { sampleRate: 44100.4, channels: [left, right] })
    expect(frame).toMatchObject({
      sampleRate: 44100,
      noChannels: 2,
      noSamples: 2,
      channelStrideBytes: 8,
      fourCC: 22
    })
    const data = frame?.data as Buffer
    expect(Array.from(new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4))).toEqual(
      [0.5, -0.25, 0.75, 1]
    )
  })

  it('Spitzenpegel über alle Kanäle', () => {
    expect(peakOf([new Float32Array([0.1, -0.6]), new Float32Array([0.3])])).toBeCloseTo(0.6)
    expect(peakOf([new Float32Array(4)])).toBe(0)
  })
})
