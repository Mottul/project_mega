// PDF-Export über die Brücke (services/pdf/htmlToPdf.ts): großes HTML mit Fotos – über der
// 2-MB-Grenze, an der die frühere data:-URL mit ERR_INVALID_URL abbrach –, Seitenformat A4, A5
// und quer, fremde Adressen (Server, Dateien außerhalb des Temp-Ordners) werden nie angefragt.
// Gegenprobe gegen den alten Weg (16.10.2026): Schritte 1 und 3 scheitern dort (der alte Weg
// fragte Stylesheet, Bilder und iframe beim Server an).

import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchApp, runSteps } from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx

/** Speichern-Dialog ersetzen und das HTML über die Brücke als PDF schreiben lassen */
async function exportPdf(html, name, opts) {
  const file = join(ctx.userData, name)
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
  }, file)
  const res = await page.evaluate(
    ([h, n, o]) => window.api.util.exportPdf(h, n, o),
    [html, name, opts]
  )
  assert.equal(res?.path, file)
  return readFileSync(file)
}

/** Seiten zählen und das Format der ersten Seite in pt lesen */
function pdfInfo(buf) {
  const s = buf.toString('latin1')
  const pages = (s.match(/\/Type\s*\/Page(?!s)/g) ?? []).length
  const m = s.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/)
  return { pages, w: m ? +m[1] : 0, h: m ? +m[2] : 0 }
}

/** Seitenformat in pt prüfen – Chromium rechnet über Pixel und liegt knapp daneben (595,9 × 842,9
 *  statt 595 × 842 für A4) */
function assertPage(info, w, h, was) {
  const ok = Math.abs(info.w - w) < 2 && Math.abs(info.h - h) < 2
  assert.ok(ok, `${was}: ${info.w} × ${info.h} pt statt ${w} × ${h}`)
}

const doc = (body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>img{width:100%;break-inside:avoid}</style></head><body>${body}</body></html>`

try {
  await runSteps('PDF-Export', [
    [
      'großes HTML mit Fotos (über 2 MB) – PDF mit allen Seiten',
      async () => {
        // Rauschen lässt sich kaum komprimieren: ein Foto mit gut 200 KB
        const b64 = await app.evaluate(({ nativeImage }) => {
          const w = 600
          const h = 450
          const buf = Buffer.alloc(w * h * 4)
          for (let i = 0; i < buf.length; i++)
            buf[i] = i % 4 === 3 ? 255 : (Math.random() * 256) | 0
          return nativeImage
            .createFromBitmap(buf, { width: w, height: h })
            .toJPEG(90)
            .toString('base64')
        })
        const count = Math.ceil((4 * 1024 * 1024) / b64.length) // gut 4 MB HTML
        const imgs = Array.from(
          { length: count },
          () => `<img src="data:image/jpeg;base64,${b64}">`
        ).join('')
        const html = doc(`<h1>Fotos</h1>${imgs}<p>ENDE</p>`)
        assert.ok(html.length > 4 * 1024 * 1024)
        const pdf = await exportPdf(html, 'gross.pdf')
        const info = pdfInfo(pdf)
        // je Foto eine Seite (fast seitenhoch, nicht teilbar) plus die Seite mit der Überschrift
        assert.ok(info.pages >= count, `${info.pages} Seiten für ${count} Fotos`)
        assert.ok(pdf.byteLength > (b64.length * 3) / 4, `PDF zu klein (${pdf.byteLength} Bytes)`)
        assert.equal(await app.evaluate(() => 'lebt'), 'lebt')
      }
    ],
    [
      'Seitenformat: A4 hoch (Vorgabe), A4 quer, A5',
      async () => {
        const html = doc('<p>Seite</p>')
        const a4 = pdfInfo(await exportPdf(html, 'a4.pdf'))
        assert.equal(a4.pages, 1)
        assertPage(a4, 595, 842, 'A4')
        assertPage(
          pdfInfo(await exportPdf(html, 'quer.pdf', { landscape: true })),
          842,
          595,
          'quer'
        )
        assertPage(pdfInfo(await exportPdf(html, 'a5.pdf', { pageSize: 'A5' })), 420, 595, 'A5')
        // Unbekanntes fällt auf A4 zurück
        const x = pdfInfo(await exportPdf(html, 'x.pdf', { pageSize: 'Letter' }))
        assertPage(x, 595, 842, 'Letter -> A4')
      }
    ],
    [
      'fremde Adressen werden nie angefragt (Server, Datei außerhalb)',
      async () => {
        const hits = []
        const server = createServer((req, res) => {
          hits.push(req.url)
          res.end()
        })
        await new Promise((r) => server.listen(0, '127.0.0.1', r))
        const base = `http://127.0.0.1:${server.address().port}`
        const outside = join(ctx.userData, 'aussen.svg')
        writeFileSync(outside, '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')
        try {
          const html =
            `<!doctype html><html><head><meta charset="utf-8">` +
            `<link rel="stylesheet" href="${base}/a.css"><style>body{background:url("${base}/b.png")}</style>` +
            `</head><body><p>Text</p><img src="${base}/c.png"><iframe src="${base}/d"></iframe>` +
            `<img src="${pathToFileURL(outside).href}"></body></html>`
          await exportPdf(html, 'fremd.pdf')
          assert.deepEqual(hits, [], `angefragt: ${hits.join(', ')}`)
          const log = readFileSync(join(ctx.userData, 'avtoolbox-debug.log'), 'utf8')
          assert.ok(log.includes('[pdf] Anfrage gesperrt: file:'), 'Datei außerhalb nicht gesperrt')
        } finally {
          server.close()
        }
      }
    ]
  ])
} finally {
  await ctx.close()
}
