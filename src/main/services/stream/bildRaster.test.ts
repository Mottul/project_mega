import { describe, expect, it } from 'vitest'
import { BildRaster, RASTER_ANLAUF_MS } from './bildRaster'

const RASTER = 1000 / 30
/** Ein glattes Vielfaches des Rasters seit 1970 als Ausgangspunkt */
const NULL = Math.round(1_795_000_000_000 / RASTER) * RASTER
/** ffmpeg lief da schon länger als der Anlauf */
const GESTARTET = NULL - RASTER_ANLAUF_MS - 1000

/** paints im Takt des Rasters mit fester Phase, geschrieben `schreiben` ms nach dem paint */
function laufen(r: BildRaster, phase: number, schreiben = 1, n = 60, ab = NULL): void {
  for (let k = 0; k < n; k++) {
    const paint = ab + k * RASTER + phase
    r.geschrieben(paint, paint + schreiben)
  }
}

describe('Wo ein Bild im Strom landet (fps-Raster von ffmpeg)', () => {
  it('kurz nach einem Rasterpunkt: das Bild landet davor – im Strom früher als sein paint', () => {
    const r = new BildRaster(30, GESTARTET)
    laufen(r, 5)
    expect(r.ms).toBe(-5)
  })

  it('kurz vor einem Rasterpunkt: das Bild landet danach – im Strom später', () => {
    const r = new BildRaster(30, GESTARTET)
    laufen(r, 25)
    expect(r.ms).toBe(8) // 33,3 − 25
  })

  it('die Zeit bis zum Schreiben zählt mit: sie schiebt das Bild über die Rundungsgrenze', () => {
    const r = new BildRaster(30, GESTARTET)
    laufen(r, 10, 8) // geschrieben bei 18 ms -> nächster Rasterpunkt
    expect(r.ms).toBe(23)
  })

  it('an der Rundungsgrenze: abwechselnd früher und später – das Mittel liegt dazwischen', () => {
    const r = new BildRaster(30, GESTARTET)
    for (let k = 0; k < 60; k++) {
      const paint = NULL + k * RASTER + 16
      r.geschrieben(paint, paint + (k % 2 ? 0 : 1.4)) // 16,0 bzw. 17,4 ms nach dem Rasterpunkt
    }
    expect(r.ms).toBe(1)
  })

  it('andere Bildrate: anderes Raster', () => {
    const r = new BildRaster(25, 1_795_000_000_000 - 10_000)
    for (let k = 0; k < 60; k++) {
      r.geschrieben(1_795_000_000_030 + k * 40, 1_795_000_000_031 + k * 40)
    }
    expect(r.ms).toBe(10) // Rasterpunkt bei …040
  })

  it('der Anlauf von ffmpeg zählt nicht: dort liest es die ersten Bilder spät', () => {
    // gerade gestartet: die Bilder kommen 45 ms spät in den Strom (so gemessen), danach pünktlich
    const r = new BildRaster(30, NULL)
    laufen(r, 5, 45, 59) // knapp zwei Sekunden Anlauf
    expect(r.ms).toBeNull()
    laufen(r, 5, 1, 60, NULL + 60 * RASTER)
    expect(r.ms).toBe(-5)
  })

  it('zu wenig Bilder: noch kein Wert; Unplausibles zählt nicht', () => {
    const r = new BildRaster(30, GESTARTET)
    laufen(r, 5, 1, 29)
    expect(r.ms).toBeNull()
    r.geschrieben(NULL, NULL + 2000) // zwei Sekunden bis in den Strom: Hänger
    r.geschrieben(NULL, Number.NaN)
    expect(r.ms).toBeNull()
    laufen(r, 5, 1, 1)
    expect(r.ms).toBe(-5)
  })

  it('späte Bilder an ffmpeg (Pipe unter Last): gezählt bis zum Abruf, auch über dem Messbereich', () => {
    const r = new BildRaster(30, GESTARTET)
    laufen(r, 5, 12, 40) // normal: 12 ms bis ffmpeg
    laufen(r, 5, 140, 3, NULL + 40 * RASTER) // drei Bilder 140 ms (der erste Blitz in main f810d49)
    r.geschrieben(NULL + 50 * RASTER, NULL + 50 * RASTER + 900) // Hänger: zählt auch
    expect(r.spaeteAbholen()).toEqual({ n: 4, maxMs: 900 })
    expect(r.spaeteAbholen()).toEqual({ n: 0, maxMs: 0 })
    // im Anlauf nach dem Start von ffmpeg zählt nichts
    const neu = new BildRaster(30, NULL)
    neu.geschrieben(NULL + 100, NULL + 300)
    expect(neu.spaeteAbholen()).toEqual({ n: 0, maxMs: 0 })
  })
})
