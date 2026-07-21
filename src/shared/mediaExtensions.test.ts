import { describe, expect, it } from 'vitest'
import {
  dotted,
  IMAGE_EXTENSIONS,
  MEDIA_EXTENSIONS,
  STILL_IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS
} from './mediaExtensions'

describe('mediaExtensions', () => {
  it('MEDIA = Video ∪ Bilder, ohne Dubletten', () => {
    expect(MEDIA_EXTENSIONS).toEqual([...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS])
    expect(new Set(MEDIA_EXTENSIONS).size).toBe(MEDIA_EXTENSIONS.length)
  })
  it('GIF zählt zu den Bildern, nicht zu den Standbildern', () => {
    expect(IMAGE_EXTENSIONS).toContain('gif')
    expect(STILL_IMAGE_EXTENSIONS).not.toContain('gif')
  })
  it('deckt die gängigen Profi-Formate ab (Regression gegen Drift)', () => {
    for (const ext of ['mxf', 'mpg', 'mpeg', 'wmv', 'mts', 'm2ts', 'ts', 'tif', 'tiff'])
      expect(MEDIA_EXTENSIONS).toContain(ext)
  })
  it('dotted() ergänzt den führenden Punkt', () => {
    expect(dotted(['mp4', 'jpg'])).toEqual(['.mp4', '.jpg'])
  })
})
