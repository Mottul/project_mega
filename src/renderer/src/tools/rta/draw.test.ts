import { describe, expect, it } from 'vitest'
import { heatLut, mitFarbe, type Theme } from './draw'

const th: Theme = {
  fg: '0 0% 98%',
  muted: '240 5% 65%',
  border: '240 4% 18%',
  card: '240 6% 10%',
  primary: '46 100% 59%',
  success: '158 64% 52%',
  warning: '43 96% 56%',
  danger: '0 91% 71%'
}

describe('RTA-Farbe', () => {
  it('Akzent bleibt, neutral nimmt die Schriftfarbe (Weiß bzw. im hellen Design Schwarz)', () => {
    expect(mitFarbe(th, 'akzent')).toBe(th)
    expect(mitFarbe(th, 'neutral')).toEqual({ ...th, primary: th.fg })
  })

  it('der Wasserfall wird neutral grau statt farbig', () => {
    // bei drei Vierteln der Skala steht der Akzent bzw. neutral die Schriftfarbe
    const spreizung = (lut: Uint8ClampedArray): number => {
      const i = Math.round(0.75 * 255) * 4
      const rgb = [lut[i], lut[i + 1], lut[i + 2]]
      return Math.max(...rgb) - Math.min(...rgb)
    }
    expect(spreizung(heatLut(mitFarbe(th, 'neutral')))).toBeLessThan(6)
    expect(spreizung(heatLut(th))).toBeGreaterThan(30)
  })
})
