// Fotos für Projektdateien (services/fotos, ipc/fotos.handlers.ts): Einfügen über den Dialog
// (verkleinert, nach EXIF aufgerichtet, Metadaten weg), Anzeige über foto://, Speichern in die
// Projektdatei und Zurückholen beim Öffnen, Einsetzen ins PDF. Dialoge werden im main ersetzt.

import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, runSteps } from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx
const fotoDir = join(ctx.userData, 'Projektfotos')

/** JPEG mit EXIF-Ausrichtung 6 (Handy hochkant gehalten): links rot, rechts blau, 3000 × 1500 */
async function handyFoto() {
  const b64 = await app.evaluate(({ nativeImage }) => {
    const w = 3000
    const h = 1500
    const buf = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        buf[i] = x < w / 2 ? 0 : 255 // B
        buf[i + 2] = x < w / 2 ? 255 : 0 // R
        buf[i + 3] = 255
      }
    return nativeImage.createFromBitmap(buf, { width: w, height: h }).toJPEG(90).toString('base64')
  })
  const jpg = Buffer.from(b64, 'base64')
  const tiff = Buffer.from([
    0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 1, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0
  ])
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, Buffer.alloc(4)])
  const len = Buffer.alloc(2)
  len.writeUInt16BE(payload.length + 2)
  return Buffer.concat([
    jpg.subarray(0, 2),
    Buffer.from([0xff, 0xe1]),
    len,
    payload,
    jpg.subarray(2)
  ])
}

/** Öffnen-Dialog liefert feste Dateien */
const pickReturns = (paths) =>
  app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p })
  }, paths)

/** Farbe (RGB) eines Pixels einer gespeicherten Bilddatei, gelesen im main */
const pixel = (path, x, y) =>
  app.evaluate(
    ({ nativeImage }, [p, px, py]) => {
      const img = nativeImage.createFromPath(p)
      const { width } = img.getSize()
      const bm = img.toBitmap()
      const i = (py * width + px) * 4
      return [bm[i + 2], bm[i + 1], bm[i]]
    },
    [path, x, y]
  )

let hash = ''

try {
  await runSteps('Fotos', [
    [
      'Einfügen: verkleinert, aufgerichtet, ohne EXIF; falsches Format wird gemeldet',
      async () => {
        const handy = join(ctx.userData, 'handy.jpg')
        writeFileSync(handy, await handyFoto())
        const fake = join(ctx.userData, 'kein-bild.jpg')
        writeFileSync(fake, 'das ist kein Bild')
        await pickReturns([handy, fake])
        const res = await page.evaluate(() => window.api.fotos.pick())
        assert.equal(res.length, 2)
        const [ok, bad] = res
        assert.ok(ok.ok, JSON.stringify(ok))
        // 3000 × 1500 -> 2000 × 1000, um 90° gedreht -> 1000 × 2000
        assert.deepEqual([ok.width, ok.height, ok.ext], [1000, 2000, 'jpg'])
        assert.deepEqual(bad, { ok: false, name: 'kein-bild.jpg', reason: 'format' })
        hash = ok.hash
        const stored = join(fotoDir, `${hash}.jpg`)
        assert.ok(existsSync(stored))
        // links rot liegt nach der Drehung oben, rechts blau unten
        const [top, bottom] = [await pixel(stored, 500, 100), await pixel(stored, 500, 1900)]
        assert.ok(top[0] > 200 && top[2] < 60, `oben ${top}`)
        assert.ok(bottom[2] > 200 && bottom[0] < 60, `unten ${bottom}`)
        assert.equal(readFileSync(stored).includes(Buffer.from('Exif\0\0', 'latin1')), false)
      }
    ],
    [
      'Anzeige über foto:// (unbekannter Hash: Fehler)',
      async () => {
        const load = (src) =>
          page.evaluate(
            (s) =>
              new Promise((resolve) => {
                const img = new Image()
                img.onload = () => resolve([img.naturalWidth, img.naturalHeight])
                img.onerror = () => resolve('fehler')
                img.src = s
              }),
            src
          )
        assert.deepEqual(await load(`foto://bild/${hash}`), [1000, 2000])
        assert.equal(await load(`foto://bild/${'0'.repeat(64)}`), 'fehler')
        assert.equal(await load(`foto://anders/${hash}`), 'fehler')
      }
    ],
    [
      'Projektdatei: Foto kommt in die Datei und beim Öffnen wieder in den Speicher',
      async () => {
        const file = join(ctx.userData, 'Fotos.mottul')
        await app.evaluate(({ dialog }, target) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
        }, file)
        const t = await page.evaluate(() =>
          window.api.projects.chooseTarget('ledWall', 'Fotos', true)
        )
        assert.ok(t?.ok)
        const r = await page.evaluate(
          ([path, h]) =>
            window.api.projects.save({
              path,
              section: 'ledWall',
              version: 2,
              data: { foto: h },
              baseSha: null,
              force: false,
              fotos: [h]
            }),
          [file, hash]
        )
        assert.ok(r.ok, JSON.stringify(r))
        assert.ok(readFileSync(file).includes(Buffer.from(`fotos/${hash}.jpg`)))
        rmSync(join(fotoDir, `${hash}.jpg`))
        const o = await page.evaluate((p) => window.api.projects.open('ledWall', p), file)
        assert.ok(o?.ok)
        assert.ok(existsSync(join(fotoDir, `${hash}.jpg`)), 'Foto nicht zurückgeholt')
      }
    ],
    [
      'PDF: Foto wird eingesetzt, ein fehlendes bricht nichts',
      async () => {
        const pdfFile = join(ctx.userData, 'fotos.pdf')
        await app.evaluate(({ dialog }, target) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
        }, pdfFile)
        const html = (h) =>
          `<!doctype html><html><body><img src="foto://bild/${h}" style="width:50%"><img src="foto://bild/${'1'.repeat(64)}"></body></html>`
        const res = await page.evaluate(
          ([h, n]) => window.api.util.exportPdf(h, n),
          [html(hash), 'fotos.pdf']
        )
        assert.equal(res?.path, pdfFile)
        const fotoBytes = readFileSync(join(fotoDir, `${hash}.jpg`)).length
        assert.ok(
          readFileSync(pdfFile).length > fotoBytes * 0.8,
          `PDF ${readFileSync(pdfFile).length} Bytes, Foto ${fotoBytes}`
        )
      }
    ]
  ])
} finally {
  await ctx.close()
}
