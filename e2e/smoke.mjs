// Rauchtest der gebauten App: Startbildschirm, Werkzeugsuche, ein Werkzeug öffnen, Rückkehr.
// Start: `npm run e2e` (baut vorher). Weitere Skripte je Werkzeug gleich aufbauen und
// `launchApp` aus harness.mjs verwenden.

import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, openRoute, runSteps } from './harness.mjs'

const ctx = await launchApp()
const { page } = ctx

try {
  await runSteps('Rauchtest', [
    [
      'Hauptfenster startet mit Titel „Mottulbox“',
      async () => {
        assert.equal(await page.title(), 'Mottulbox')
      }
    ],
    [
      'Startbildschirm zeigt das Suchfeld',
      async () => {
        await page.getByPlaceholder('Werkzeug suchen…').waitFor({ timeout: 15_000 })
      }
    ],
    [
      'Alle Kacheln gleich hoch',
      async () => {
        await page.setViewportSize({ width: 1400, height: 1000 })
        const heights = await page.evaluate(() =>
          [...document.querySelectorAll('[aria-describedby^="tool-desc-"]')].map((e) =>
            Math.round(e.getBoundingClientRect().height)
          )
        )
        assert.ok(heights.length > 10, 'zu wenige Kacheln: ' + heights.length)
        assert.ok(
          Math.max(...heights) - Math.min(...heights) <= 1,
          [...new Set(heights)].join(', ')
        )
      }
    ],
    [
      'Suche „timecode“ findet das Werkzeug',
      async () => {
        await page.getByPlaceholder('Werkzeug suchen…').fill('timecode')
        await page.getByText('Timecode-Rechner').first().waitFor({ timeout: 5_000 })
      }
    ],
    [
      'Werkzeug öffnet sich über die Route /tool/media-info',
      async () => {
        await openRoute(page, '/tool/media-info')
        await page
          .getByText('Videodateien oder Ordner hier ablegen')
          .first()
          .waitFor({ timeout: 10_000 })
      }
    ],
    [
      'Zurück zum Startbildschirm',
      async () => {
        await openRoute(page, '/')
        await page.getByPlaceholder('Werkzeug suchen…').waitFor({ timeout: 10_000 })
      }
    ],
    [
      'Programmbrücke (window.api) ist im Renderer vorhanden',
      async () => {
        const has = await page.evaluate(() => typeof window.api?.getSettings === 'function')
        assert.equal(has, true)
      }
    ],
    [
      'Datei-Dialoge starten im zuletzt benutzten Ordner (Electron öffnet sonst „Downloads“)',
      async () => {
        const medien = join(ctx.userData, 'medien')
        const exporte = join(ctx.userData, 'exporte')
        mkdirSync(medien)
        mkdirSync(exporte)
        // Dialoge ersetzen: liefern feste Pfade und merken sich den übergebenen Startpfad
        await ctx.app.evaluate(
          ({ dialog }, { medien, exporte }) => {
            const seen = (globalThis.__dialogStarts = [])
            const opts = (args) => args[args.length - 1]
            dialog.showOpenDialog = async (...args) => {
              seen.push(opts(args).defaultPath ?? null)
              return { canceled: false, filePaths: [medien + '/clip.mp4'] }
            }
            dialog.showSaveDialog = async (...args) => {
              seen.push(opts(args).defaultPath ?? null)
              return { canceled: false, filePath: exporte + '/liste.json' }
            }
          },
          { medien, exporte }
        )
        for (let i = 0; i < 2; i++) {
          await page.evaluate(() => window.api.selectPaths({ title: 'Dateien' }))
          await page.evaluate(() => window.api.util.saveText('{}', 'neu.json'))
        }
        const starts = await ctx.app.evaluate(() => globalThis.__dialogStarts)
        assert.deepEqual(starts, [null, 'neu.json', medien, join(exporte, 'neu.json')])
        const dirs = (await page.evaluate(() => window.api.getSettings())).dialogDirs
        assert.equal(dirs.dateien, medien)
        assert.equal(dirs.speichern, exporte)
      }
    ],
    [
      'keine Konsolenfehler im Hauptfenster',
      async () => {
        assert.deepEqual(ctx.errors, [])
      }
    ]
  ])
} finally {
  await ctx.close()
}
