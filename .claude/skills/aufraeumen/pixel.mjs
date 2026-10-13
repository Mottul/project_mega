// Pixelvergleich zweier Screenshots (Vorher/Nachher beim Aufteilen): Anzahl abweichender Pixel,
// größte Abweichung je Kanal (0–255) und das umschließende Rechteck. Dekodiert mit Electrons
// nativeImage über die E2E-Harness (kein Zusatzpaket). Liegt das Rechteck genau auf einer Kachel,
// die gerade ihren Hover-Zustand ausblendet, ist es kein Unterschied der Darstellung.
//
//   node .claude/skills/aufraeumen/pixel.mjs vorher.png nachher.png

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const [a, b] = process.argv.slice(2)
if (!a || !b) {
  console.error('Aufruf: pixel.mjs vorher.png nachher.png')
  process.exit(2)
}
const h = await import(pathToFileURL(join(root, 'e2e/harness.mjs')).href)
const ctx = await h.launchApp()
try {
  const res = await ctx.app.evaluate(
    ({ nativeImage }, [pa, pb]) => {
      const ia = nativeImage.createFromBuffer(Buffer.from(pa, 'base64'))
      const ib = nativeImage.createFromBuffer(Buffer.from(pb, 'base64'))
      const sa = ia.getSize()
      const sb = ib.getSize()
      if (sa.width !== sb.width || sa.height !== sb.height) return { size: [sa, sb] }
      const da = ia.toBitmap()
      const db = ib.toBitmap()
      let pixels = 0
      let maxDiff = 0
      let box = null
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(
          Math.abs(da[i] - db[i]),
          Math.abs(da[i + 1] - db[i + 1]),
          Math.abs(da[i + 2] - db[i + 2])
        )
        if (!d) continue
        pixels++
        maxDiff = Math.max(maxDiff, d)
        const x = (i / 4) % sa.width
        const y = Math.floor(i / 4 / sa.width)
        box = box
          ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]
          : [x, y, x, y]
      }
      return { pixels, maxDiff, box }
    },
    [readFileSync(a).toString('base64'), readFileSync(b).toString('base64')]
  )
  console.log(
    res.size
      ? `verschiedene Größen: ${JSON.stringify(res.size)}`
      : res.pixels === 0
        ? 'gleich'
        : `${res.pixels} Pixel verschieden, höchstens ${res.maxDiff}/255, Rechteck ${res.box.join(', ')}`
  )
} finally {
  await ctx.close()
}
