// Die GEPACKTE App (electron-builder --dir, in der CI je Betriebssystem): Was nur im Paket schiefgeht,
// zeigt sich erst hier – Dateien im app.asar, Module daneben (asarUnpack: pdfjs-dist als ESM,
// better-sqlite3 nativ) und Ressourcen (ffmpeg aus extraResources). Nicht im Standardlauf von
// run.mjs; vorher `npm run package:dir`, dann `npm run e2e -- paket` bzw. `node e2e/run.mjs paket`.

import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, root, runSteps } from './harness.mjs'

/** Startdatei der entpackten App in dist/ (Namen aus electron-builder.yml und package.json) */
function paketPfad() {
  const dist = join(root, 'dist')
  if (process.platform === 'win32') return join(dist, 'win-unpacked', 'Mottulbox.exe')
  if (process.platform === 'linux') return join(dist, 'linux-unpacked', 'mottulbox')
  // macOS: dist/mac oder dist/mac-arm64 – je nach Architektur des Bau-Rechners
  const mac = existsSync(dist)
    ? readdirSync(dist).find(
        (d) => d.startsWith('mac') && existsSync(join(dist, d, 'Mottulbox.app'))
      )
    : undefined
  return mac
    ? join(dist, mac, 'Mottulbox.app', 'Contents', 'MacOS', 'Mottulbox')
    : join(dist, 'mac')
}

const exe = paketPfad()
if (!existsSync(exe))
  throw new Error(`Keine gepackte App unter ${exe} – vorher npm run package:dir`)

// ohne Prüfung auf ein neueres ffmpeg: Der Test soll das mitgelieferte aus dem Paket nehmen
const ctx = await launchApp({ executablePath: exe, settings: { ffmpegAutoUpdate: false } })
const { app, page } = ctx

try {
  await runSteps('Gepackte App', [
    [
      'startet aus dem app.asar: Titel und Startbildschirm',
      async () => {
        const info = await app.evaluate(({ app: a }) => ({
          packaged: a.isPackaged,
          appPath: a.getAppPath()
        }))
        assert.equal(info.packaged, true)
        assert.ok(info.appPath.endsWith('app.asar'), info.appPath)
        assert.equal(await page.title(), 'Mottulbox')
        await page.getByPlaceholder('Werkzeug suchen…').waitFor({ timeout: 15_000 })
      }
    ],
    [
      'ffmpeg aus dem Paket (extraResources) läuft',
      async () => {
        const s = await page.evaluate(() => window.api.ffmpeg.status())
        assert.equal(s.active.source, 'mitgeliefert')
        assert.match(s.active.version ?? '', /^ffmpeg version/)
      }
    ],
    [
      'PDF als Handbuch importieren und finden (pdfjs-dist entpackt, better-sqlite3)',
      async () => {
        const file = join(ctx.userData, 'paketprobe.pdf')
        await app.evaluate(({ dialog }, target) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
        }, file)
        const pdf = await page.evaluate(() =>
          window.api.util.exportPdf(
            '<!doctype html><meta charset="utf-8"><h1>Paketprobe</h1><p>Glasfaser Lager</p>',
            'paketprobe.pdf'
          )
        )
        assert.equal(pdf?.path, file)
        const r = await page.evaluate((p) => window.api.manuals.import([p]), file)
        assert.deepEqual([r.imported, r.failed], [1, []])
        // Treffer auf Seite 1 = Text aus dem PDF gelesen, nicht nur aus dem Titel
        const hits = await page.evaluate(() => window.api.manuals.search('Glasfaser'))
        assert.ok(
          hits.some((h) => h.pageNo === 1),
          JSON.stringify(hits)
        )
      }
    ],
    [
      'keine Fehler in der Konsole',
      async () => {
        assert.deepEqual(ctx.errors, [])
      }
    ]
  ])
} finally {
  await ctx.close()
}
