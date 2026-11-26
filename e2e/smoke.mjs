// Rauchtest der gebauten App: Startbildschirm, Werkzeugsuche, ein Werkzeug öffnen, Rückkehr.
// Start: `npm run e2e` (baut vorher). Weitere Skripte je Werkzeug gleich aufbauen und
// `launchApp` aus harness.mjs verwenden.

import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, openRoute, runSteps, Skip, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { page } = ctx

/** Höhen aller Kacheln des Startbildschirms (gerundet) */
const kachelHoehen = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[aria-describedby^="tool-desc-"]')].map((e) =>
      Math.round(e.getBoundingClientRect().height)
    )
  )

/** Kachelgröße über den Umschalter im Kopf wählen und warten, bis sie gilt */
async function kachelgroesse(name) {
  const knopf = page.getByRole('button', { name, exact: true })
  await knopf.click()
  const gilt = await waitFor(
    async () => (await knopf.getAttribute('aria-pressed')) === 'true',
    5_000
  )
  assert.ok(gilt, `${name} nicht gewählt`)
}

/** Kacheln, deren Name abgeschnitten ist: breiter als sein Feld oder mehr als zwei Zeilen */
const abgeschnitteneNamen = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[aria-describedby^="tool-desc-"]')].flatMap((kachel) => {
      const h3 = kachel.querySelector('h3')
      const zeilen = Math.round(h3.scrollHeight / parseFloat(getComputedStyle(h3).lineHeight))
      const zuBreit = h3.scrollWidth > h3.clientWidth + 1
      const zuHoch = h3.scrollHeight > h3.clientHeight + 1 || zeilen > 2
      if (!zuBreit && !zuHoch) return []
      return [`${kachel.getAttribute('aria-label')} (${h3.scrollWidth} px, ${zeilen} Zeilen)`]
    })
  )

/** Kacheln mit abgeschnittener Beschreibung; `sortierbar`: nur die mit Pfeilen (Favoriten) */
const abgeschnitteneBeschreibungen = (sortierbar = false) =>
  page.evaluate(
    (sortierbar) =>
      [...document.querySelectorAll('[aria-describedby^="tool-desc-"]')]
        .filter((kachel) => !sortierbar || kachel.querySelector('[aria-label$="verschieben"]'))
        .flatMap((kachel) => {
          const p = kachel.querySelector('p[id^="tool-desc-"]')
          return p.scrollHeight > p.clientHeight + 1 ? [kachel.getAttribute('aria-label')] : []
        }),
    sortierbar
  )

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
        const heights = await kachelHoehen()
        assert.ok(heights.length > 10, 'zu wenige Kacheln: ' + heights.length)
        assert.ok(
          Math.max(...heights) - Math.min(...heights) <= 1,
          [...new Set(heights)].join(', ')
        )
      }
    ],
    [
      'Kacheln: kein Name abgeschnitten (1366 × 768, mittlere und große Kacheln)',
      async () => {
        // Mittel ist die Vorgabe; am 14.11.2026 hieß es dort „LED-Wall-Konfigura…“,
        // „Projektionsverhä…“, „Stromlast & Absi…“ (Paket B6)
        await page.setViewportSize({ width: 1366, height: 768 })
        for (const groesse of ['Mittlere Kacheln', 'Große Kacheln']) {
          await kachelgroesse(groesse)
          // ohne Kacheln wären beide Prüfungen leer grün
          const hoehen = await kachelHoehen()
          assert.ok(hoehen.length > 10, `${groesse}: nur ${hoehen.length} Kacheln`)
          assert.deepEqual(await abgeschnitteneNamen(), [], groesse)
          // jede Kachel hält zwei Zeilen für den Namen frei -> gleich hoch, auch über Kategorien
          assert.ok(
            Math.max(...hoehen) - Math.min(...hoehen) <= 1,
            `${groesse}: ${[...new Set(hoehen)].join(', ')}`
          )
        }
        await kachelgroesse('Mittlere Kacheln')
      }
    ],
    [
      'Kacheln: keine Beschreibung abgeschnitten (1366 × 768, mittel), auch in den Favoriten',
      async () => {
        // Die knappste Beschreibung (Kameraobjektiv) hat in Segoe UI 15 % Luft, in einer Schrift
        // mit den Maßen von DejaVu Sans (Linux) nur 1 % – geprüft wird deshalb unter Windows
        if (process.platform !== 'win32') throw new Skip('nur unter Windows (Schrift Segoe UI)')
        await page.setViewportSize({ width: 1366, height: 768 })
        assert.ok((await kachelHoehen()).length > 10, 'zu wenige Kacheln')
        assert.deepEqual(await abgeschnitteneBeschreibungen(), [])
        // Favoriten zeigen Pfeile zum Sortieren; bis B6 hielt die Beschreibung ihnen den Platz
        // frei und endete mit „…“ (am neuen Text von Kameraobjektiv, LED-Wall, Testtongenerator)
        const namen = ['Kameraobjektiv', 'LED-Wall-Konfigurator', 'Testtongenerator']
        for (const name of namen)
          await page
            .getByRole('button', { name, exact: true })
            .getByTitle('Zu Favoriten hinzufügen')
            .click()
        const sortierbar = page.locator('[aria-describedby^="tool-desc-"]', {
          has: page.locator('[aria-label$="verschieben"]')
        })
        assert.ok(
          await waitFor(async () => (await sortierbar.count()) === namen.length, 5_000),
          'Favoriten erscheinen nicht'
        )
        assert.deepEqual(await abgeschnitteneBeschreibungen(true), [])
        assert.deepEqual(await abgeschnitteneNamen(), [])
        // wieder ohne Favoriten, wie in einem frischen Profil
        for (let i = 0; i < namen.length; i++)
          await page.getByTitle('Aus Favoriten entfernen').first().click()
        assert.ok(await waitFor(async () => (await sortierbar.count()) === 0, 5_000))
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
