// Die GEPACKTE App (electron-builder --dir, in der CI je Betriebssystem): Was nur im Paket schiefgeht,
// zeigt sich erst hier – Dateien im app.asar, Module daneben (asarUnpack: pdfjs-dist als ESM,
// better-sqlite3 nativ) und Ressourcen (ffmpeg aus extraResources). Nicht im Standardlauf von
// run.mjs; vorher `npm run package:dir`, dann `npm run e2e -- paket` bzw. `node e2e/run.mjs paket`.

import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { startAtemFake } from './atemFake.mjs'
import { launchApp, root, runSteps, waitFor } from './harness.mjs'

/**
 * Startdatei der App: Vorgabe ist die entpackte App in dist/ (Namen aus electron-builder.yml und
 * package.json). `MOTTULBOX_PAKET_EXE` zeigt stattdessen auf eine aus dem Installer installierte
 * App (Ablauf „Installer bauen“).
 */
function paketPfad() {
  if (process.env.MOTTULBOX_PAKET_EXE) return process.env.MOTTULBOX_PAKET_EXE
  const dist = join(root, 'dist')
  if (process.platform === 'win32') return join(dist, 'win-unpacked', 'Mottulbox.exe')
  if (process.platform === 'linux') return join(dist, 'linux-unpacked', 'mottulbox')
  // macOS: dist/mac-arm64 bzw. dist/mac (x64) – zuerst das, was auf diesem Rechner nativ läuft
  // (die CI baut beide; ein Intel-Paket auf Apple Silicon bräuchte Rosetta)
  const reihenfolge =
    process.arch === 'arm64' ? ['mac-arm64', 'mac-universal', 'mac'] : ['mac', 'mac-universal']
  const vorhanden = existsSync(dist) ? readdirSync(dist) : []
  const mac = [...reihenfolge, ...vorhanden.filter((d) => d.startsWith('mac'))].find((d) =>
    existsSync(join(dist, d, 'Mottulbox.app'))
  )
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
        // Der erste Start der frisch gepackten Binary dauert unter macOS länger als das Zeitlimit
        // der App (10 s) – die nächste Abfrage fragt neu (binaryVersion merkt sich kein null)
        let s = null
        await waitFor(async () => {
          s = await page.evaluate(() => window.api.ffmpeg.status())
          return s.active.version !== null
        }, 60_000)
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
      'ATEM: Socket-Thread aus dem app.asar, echter Handshake, Befehl mit Rückmeldung',
      async () => {
        const mischer = await startAtemFake()
        try {
          const r = await app.evaluate(async (_e, port) => {
            const lade = process.mainModule.require.bind(process.mainModule)
            const { Atem } = lade('atem-connection')
            const { ThreadedClassManager } = lade('threadedclass')
            const atem = new Atem({})
            const fehler = []
            atem.on('error', (m) => fehler.push(m))
            const verbunden = new Promise((resolve) => atem.once('connected', resolve))
            await atem.connect('127.0.0.1', port)
            await Promise.race([verbunden, new Promise((resolve) => setTimeout(resolve, 10_000))])
            const antwort = {
              modus: ThreadedClassManager.getThreadMode(),
              threads: ThreadedClassManager.getThreadCount(),
              produkt: atem.state?.info?.productIdentifier,
              fehler
            }
            await atem.changeProgramInput(3).catch((e) => fehler.push(String(e)))
            await new Promise((resolve) => setTimeout(resolve, 300))
            antwort.programm = atem.state?.video?.mixEffects?.[0]?.programInput
            await atem.destroy()
            return antwort
          }, mischer.port)
          assert.deepEqual(r, {
            modus: 'worker_threads',
            threads: 1,
            produkt: 'ATEM Mini Extreme',
            fehler: [],
            programm: 3
          })
          assert.deepEqual(mischer.empfangen, [{ name: 'CPgI', me: 0, quelle: 3 }])
        } finally {
          await mischer.close()
        }
      }
    ],
    [
      'FreeType zeichnet eine Multiview-Beschriftung (natives Modul, Schrift aus dem app.asar)',
      async () => {
        const r = await app.evaluate(async () => {
          const lade = process.mainModule.require.bind(process.mainModule)
          const beschriftung = lade('atem-connection/dist/lib/multiviewLabel')
          const schrift = await beschriftung.loadFont()
          const bild = beschriftung.generateMultiviewerLabel(schrift, 1, 'Kamera 1', {
            UHD8K: false,
            UHD4K: false,
            HD1080: true,
            HD720: false
          })
          return { bytes: bild.length, gezeichnet: bild.filter((b) => b !== 0).length }
        })
        assert.equal(r.bytes, 16_000)
        assert.ok(r.gezeichnet > 1000, JSON.stringify(r))
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
