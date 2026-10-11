import { describe, expect, it } from 'vitest'
import { SMALL_TOOLS } from '@shared/toolWindows'
import { findPwaTool, PWA_TOOLS } from './tools'

describe('Werkzeuge der Rechner-PWA', () => {
  it('sind genau die kleinen Werkzeuge der App (neuer Rechner -> auch in src/pwa/tools.ts)', () => {
    expect(PWA_TOOLS.map((t) => t.id).sort()).toEqual(Object.keys(SMALL_TOOLS).sort())
  })

  it('findet Rechner nur über ihre id', () => {
    expect(findPwaTool('timecode')?.id).toBe('timecode')
    expect(findPwaTool('video-player')).toBeUndefined()
    expect(findPwaTool(undefined)).toBeUndefined()
  })
})
