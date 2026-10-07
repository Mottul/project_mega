// Rauchtest der gebauten App: Startbildschirm, Werkzeugsuche, ein Werkzeug öffnen, Rückkehr.
// Start: `npm run e2e` (baut vorher). Weitere Skripte je Werkzeug gleich aufbauen und
// `launchApp` aus harness.mjs verwenden.

import assert from 'node:assert/strict'
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
      'Werkzeug öffnet sich über die Route /tool/timecode',
      async () => {
        await openRoute(page, '/tool/timecode')
        await page.getByText('Drop-Frame', { exact: false }).first().waitFor({ timeout: 10_000 })
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
      'keine Konsolenfehler im Hauptfenster',
      async () => {
        assert.deepEqual(ctx.errors, [])
      }
    ]
  ])
} finally {
  await ctx.close()
}
