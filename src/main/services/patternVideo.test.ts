import { describe, expect, it, vi } from 'vitest'

// patternVideo zieht über den ffmpeg-Runner nur `electron` (app) herein
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false, getAppPath: () => '/x' }
}))

const { pngSize, yuvColor } = await import('./patternVideo')

describe('Testbild-Export', () => {
  it('PNG-Maße aus dem IHDR-Block', () => {
    const png = new Uint8Array(24)
    const dv = new DataView(png.buffer)
    dv.setUint32(16, 3840)
    dv.setUint32(20, 2160)
    expect(pngSize(png)).toEqual({ width: 3840, height: 2160 })
    expect(pngSize(new Uint8Array(10))).toBeNull()
  })

  it('RGB -> YUV mit festgelegter Matrix: HD Rec. 709, SD Rec. 601 (per setparams gekennzeichnet)', () => {
    expect(yuvColor(1080)).toBe(
      'scale=out_color_matrix=bt709:out_range=tv,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,format=yuv420p'
    )
    expect(yuvColor(576)).toContain('out_color_matrix=bt601')
    expect(yuvColor(576)).toContain('colorspace=bt470bg')
  })
})
