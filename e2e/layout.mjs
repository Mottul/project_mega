// Werkzeug-Muster: Kopfleiste (App-Menü links, Aktionen mit Text rechts), Ausgabe-Leiste
// (rot umrandet, solange live; Auftrag bernstein), Schublade links (gemerkt: offen/angeheftet)
// und der Monitorwechsel der Ausgabefenster (das neue Fenster darf nicht verloren gehen).
// Öffnet kurz Testbild- und Player-Ausgabe auf dem ersten Bildschirm.

import assert from 'node:assert/strict'
import { launchApp, openRoute, runSteps, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx

const bar = () => page.getByTestId('tool-bar')
const drawer = () => page.getByTestId('settings-drawer')
const settingsBtn = () => page.getByRole('button', { name: 'Einstellungen', exact: true })
const barActive = async () => (await bar().getAttribute('data-active')) === 'true'
const windowCount = () =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length).catch(() => -1)

async function tool(id) {
  await openRoute(page, '/')
  await openRoute(page, `/tool/${id}`)
  await bar().waitFor({ timeout: 15_000 })
}

try {
  const displays = await page.evaluate(() => window.api.screen.list())
  const displayId = displays[0].id

  await runSteps('Werkzeug-Muster', [
    [
      'Kopfleiste: App-Menü links, Werkzeug-Aktionen mit Text, keine Design-Knöpfe mehr',
      async () => {
        await tool('video-player')
        for (const name of ['Mottulbox', 'Start', 'Eigenes Fenster', 'Kundenansicht']) {
          assert.equal(await page.getByRole('button', { name, exact: true }).count(), 1, name)
        }
        assert.equal(await settingsBtn().getAttribute('aria-expanded'), 'true')
        assert.equal(await page.getByRole('button', { name: 'Akzentfarbe wählen' }).count(), 0)
      }
    ],
    [
      'App-Menü: 13 Akzentfarben, Auswahl wirkt sofort und wird gespeichert',
      async () => {
        await page.getByRole('button', { name: 'Mottulbox', exact: true }).click()
        const swatches = page.getByRole('group', { name: 'Akzentfarbe' }).getByRole('button')
        assert.equal(await swatches.count(), 13)
        const before = await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
        )
        await page.getByRole('button', { name: 'Indigo', exact: true }).click()
        assert.ok(
          await waitFor(
            async () => (await page.evaluate(() => window.api.getSettings())).accent === 'indigo'
          )
        )
        const after = await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
        )
        assert.notEqual(after, before)
        await page.getByRole('button', { name: 'Gold', exact: true }).click()
        await page.keyboard.press('Escape')
        await page.getByRole('dialog', { name: 'Einstellungen der ganzen App' }).waitFor({
          state: 'detached',
          timeout: 5_000
        })
      }
    ],
    [
      'Schublade: angeheftet -> gelöst (schwebt), schließen, Zustand bleibt je Werkzeug',
      async () => {
        await tool('stage-timer')
        await drawer().waitFor({ timeout: 10_000 })
        assert.equal(await drawer().getAttribute('data-pinned'), 'true')
        await page.getByRole('button', { name: 'Schublade lösen' }).click()
        assert.equal(await drawer().getAttribute('data-pinned'), 'false')
        assert.equal(await drawer().evaluate((el) => getComputedStyle(el).position), 'absolute')
        await page.getByRole('button', { name: 'Einstellungen schließen' }).click()
        assert.equal(await drawer().count(), 0)
        assert.equal(await settingsBtn().getAttribute('aria-expanded'), 'false')
        // anderes Werkzeug: eigene Schublade, weiter offen
        await tool('test-patterns')
        await drawer().waitFor({ timeout: 10_000 })
        // zurück: zu und gelöst gemerkt
        await tool('stage-timer')
        assert.equal(await drawer().count(), 0)
        await settingsBtn().click()
        await drawer().waitFor({ timeout: 5_000 })
        assert.equal(await drawer().getAttribute('data-pinned'), 'false')
        await page.getByRole('button', { name: 'Schublade anheften' }).click()
        assert.equal(await drawer().getAttribute('data-pinned'), 'true')
      }
    ],
    [
      'ⓘ zeigt die Erklärung statt eines Absatzes',
      async () => {
        await tool('video-player')
        await page.getByRole('button', { name: 'Erklärung zu „Gleichzeitige Importe“' }).click()
        await page.getByRole('tooltip').filter({ hasText: 'Während der Show lieber 1' }).waitFor({
          timeout: 5_000
        })
      }
    ],
    [
      'Testbild: Leiste wird live; Esc oder Schließen von außen beendet „Live“',
      async () => {
        await tool('test-patterns')
        assert.equal(await barActive(), false)
        const before = await windowCount()
        // Tastendruck wie vom Bediener: über die Eingabe-Pipeline des Ausgabefensters
        // (Playwrights keyboard.press erreicht 'before-input-event' nicht zuverlässig).
        const pressEsc = () =>
          app.evaluate(async ({ BrowserWindow }) => {
            const w = BrowserWindow.getAllWindows().find((x) =>
              x.webContents.getURL().endsWith('#/output')
            )
            if (!w) return false
            // Eingaben vor dem Laden gehen verloren -> erst fertig laden lassen
            if (w.webContents.isLoading()) {
              await new Promise((r) => w.webContents.once('did-finish-load', r))
            }
            w.focus()
            w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
            w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
            return true
          })
        const closeFromOutside = () =>
          app.evaluate(({ BrowserWindow }) => {
            BrowserWindow.getAllWindows()
              .find((x) => x.webContents.getURL().endsWith('#/output'))
              ?.close()
            return true
          })
        for (const end of [pressEsc, closeFromOutside]) {
          await page.getByRole('button', { name: 'Vollbild starten' }).click()
          assert.ok(await waitFor(barActive, 10_000), 'Leiste wird nicht live')
          // erst, wenn das Ausgabefenster seine Seite geladen hat (vorher gehen Eingaben verloren)
          assert.ok(
            await waitFor(
              () =>
                app
                  .evaluate(({ BrowserWindow }) =>
                    BrowserWindow.getAllWindows().some(
                      (x) =>
                        x.webContents.getURL().endsWith('#/output') && !x.webContents.isLoading()
                    )
                  )
                  .catch(() => false),
              10_000
            ),
            'Ausgabefenster lädt nicht'
          )
          assert.equal(await end(), true)
          assert.ok(await waitFor(async () => !(await barActive()), 10_000), 'bleibt live')
          assert.ok(await waitFor(async () => (await windowCount()) === before, 10_000))
        }
      }
    ],
    [
      'Testbild: Monitorwechsel verliert das neue Fenster nicht',
      async () => {
        const before = await windowCount()
        const cfg = await page.evaluate(() => window.api.patterns.current())
        await page.evaluate(([c, id]) => window.api.patterns.open(c, id), [cfg, displayId])
        await page.evaluate(([c, id]) => window.api.patterns.open(c, id), [cfg, displayId])
        // Das alte Fenster meldet 'closed' erst danach – der Zustand muss trotzdem „offen“ sein.
        await new Promise((r) => setTimeout(r, 800))
        assert.equal(await page.evaluate(() => window.api.patterns.isOpen()), true)
        assert.equal(await barActive(), true)
        await page.getByRole('button', { name: 'Vollbild beenden' }).click()
        assert.ok(await waitFor(async () => (await windowCount()) === before, 10_000))
        assert.ok(await waitFor(async () => !(await barActive()), 5_000))
      }
    ],
    [
      'Video-Player: Monitorwechsel verliert das Ausgabefenster nicht',
      async () => {
        await tool('video-player')
        const before = await windowCount()
        await page.evaluate((id) => window.api.player.openOutput(id), displayId)
        assert.ok(await waitFor(barActive, 10_000), 'Leiste wird nicht live')
        await page.evaluate((id) => window.api.player.openOutput(id), displayId)
        await new Promise((r) => setTimeout(r, 800))
        const state = await page.evaluate(() => window.api.player.getState())
        assert.equal(state.outputOpen, true)
        assert.equal(await barActive(), true)
        await page.getByRole('button', { name: 'Vollbild beenden' }).click()
        assert.ok(await waitFor(async () => (await windowCount()) === before, 10_000))
        assert.ok(await waitFor(async () => !(await barActive()), 5_000))
      }
    ],
    [
      'Video-Konverter: Auftrags-Leiste statt Ausgabe, „Konvertieren“ ohne Dateien gesperrt',
      async () => {
        await tool('hap-converter')
        assert.equal(await bar().getAttribute('data-kind'), 'job')
        assert.equal(
          await bar()
            .getByRole('button', { name: /^Konvertieren/ })
            .isDisabled(),
          true
        )
        assert.equal(await bar().getByRole('combobox', { name: 'Zielsystem' }).count(), 1)
      }
    ],
    [
      'keine Konsolenfehler',
      async () => {
        assert.deepEqual(ctx.errors, [])
      }
    ]
  ])
} finally {
  await ctx.close()
}
