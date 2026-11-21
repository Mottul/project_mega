import { describe, expect, it } from 'vitest'
import { Bildweg } from './bildweg'

/** paints im Takt von 33,3 ms, je Übergabe ein paint `weg` ms später */
function laufen(w: Bildweg, weg: number, n = 60, ab = 1_000_000): number {
  let t = ab
  for (let i = 0; i < n; i++) {
    const uebergabe = t
    w.paint(uebergabe + weg)
    w.uebergaben([uebergabe])
    t += 1000 / 30
  }
  return t
}

describe('Weg des Bildes vom Spiegel bis in den main', () => {
  it('misst den Abstand zwischen Übergabe und dem paint danach', () => {
    const w = new Bildweg()
    laufen(w, 19)
    expect(w.ms).toBe(19)
  })

  it('zu wenig Proben: noch kein Wert', () => {
    const w = new Bildweg()
    laufen(w, 9, 5)
    expect(w.ms).toBeNull()
  })

  it('Übergaben kommen gesammelt mit dem nächsten Tonblock – der paint war schon da', () => {
    const w = new Bildweg()
    const uebergaben: number[] = []
    let t = 1_000_000
    for (let i = 0; i < 30; i++) {
      w.paint(t + 12)
      uebergaben.push(t)
      t += 1000 / 30
    }
    w.uebergaben(uebergaben)
    expect(w.ms).toBe(12)
  })

  it('Hänger: ein paint fehlt oder kommt viel später – der Median bleibt', () => {
    const w = new Bildweg()
    const t = laufen(w, 10, 40)
    // fünf Übergaben ohne passenden paint, dann ein paint 800 ms später
    for (let i = 0; i < 5; i++) w.uebergaben([t + i * 33])
    w.paint(t + 800)
    expect(w.ms).toBe(10)
  })

  it('neues Fenster: alte Messungen gelten nicht mehr', () => {
    const w = new Bildweg()
    laufen(w, 25)
    w.zuruecksetzen()
    expect(w.ms).toBeNull()
    laufen(w, 8, 20, 2_000_000)
    expect(w.ms).toBe(8)
  })
})
