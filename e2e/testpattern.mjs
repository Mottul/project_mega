// Testbild: Rasterlinien sind genau 2 px breit und liegen auf der Modulgrenze (letztes Pixel des
// einen + erstes Pixel des nächsten Moduls), im Raster-Muster wie im Mapping-Testbild.
// Das Ausgabebild liest seine Konfiguration nur beim Öffnen: für jede Variante `/` und dann
// `/output` neu öffnen. Geprüft wird per getImageData auf der Zeichenfläche.

import assert from 'node:assert/strict'
import { launchApp, openRoute, runSteps, sleep } from './harness.mjs'

const ctx = await launchApp()
const { page: w } = ctx

/** Konfiguration setzen, Ausgabe neu öffnen und die RGB-Werte an den Punkten lesen. */
async function pixels(config, points) {
  await w.evaluate((c) => window.api.patterns.update(c), config)
  await openRoute(w, '/')
  await sleep(300)
  await openRoute(w, '/output')
  await sleep(900)
  return w.evaluate((pts) => {
    const g = document.querySelector('canvas').getContext('2d')
    return pts.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)])
  }, points)
}

const white = (p) => p.every((v) => v > 240)
const black = (p) => p.every((v) => v < 15)
const base = {
  solid: 'white',
  gridSpacing: 64,
  gridScale: 1,
  cycleColors: ['#fff'],
  cycleSeconds: 2,
  scrollSpeed: 1,
  label: '',
  showInfo: false,
  width: 1920,
  height: 1080
}

try {
  await w.getByText('Video-Player').first().waitFor({ timeout: 30_000 })
  // Die Zeichenfläche der Ausgabe hat die Größe des Fensters: erst darauf stellen, sonst
  // liegen die Linien an anderen Pixeln.
  await w.setViewportSize({ width: 1920, height: 1080 })
  await runSteps('Testbild: 2-px-Rasterlinien', [
    [
      'Raster-Muster: senkrechte und waagerechte Linie genau Pixel 119 + 120',
      async () => {
        const g = await pixels({ ...base, pattern: 'grid' }, [
          ...[118, 119, 120, 121].map((x) => [x, 300]),
          ...[118, 119, 120, 121].map((y) => [300, y])
        ])
        for (const [a, b, c, d] of [g.slice(0, 4), g.slice(4)]) {
          assert.ok(black(a) && white(b) && white(c) && black(d), JSON.stringify(g))
        }
      }
    ],
    [
      'Mapping-Testbild: Linie genau Pixel 119 + 120',
      async () => {
        const m = await pixels(
          { ...base, pattern: 'mapping', mappingHidden: ['diagonals', 'labels'] },
          [
            [118, 400],
            [119, 400],
            [120, 400],
            [121, 400]
          ]
        )
        const bg = m[0].join()
        assert.ok(m[1].join() !== bg && m[2].join() !== bg && m[3].join() === bg, JSON.stringify(m))
      }
    ]
  ])
} finally {
  await ctx.close()
}
