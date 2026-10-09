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
/** Inhaltsgröße des Fensters eines kleinen Werkzeugs (null = keins offen) */
const contentSize = (id) =>
  app.evaluate(({ BrowserWindow }, i) => {
    const w = BrowserWindow.getAllWindows().find(
      (x) =>
        !x.isDestroyed() &&
        !x.webContents.isDestroyed() &&
        x.webContents.getURL().includes(`#/tool/${i}?`)
    )
    return w ? w.getContentSize() : null
  }, id)
/** Fenster eines kleinen Werkzeugs schließen wie der Bediener (main merkt sich die Lage) */
const closeToolWindow = async (id) => {
  await app.evaluate(({ BrowserWindow }, i) => {
    BrowserWindow.getAllWindows()
      .find(
        (x) =>
          !x.isDestroyed() &&
          !x.webContents.isDestroyed() &&
          x.webContents.getURL().includes(`#/tool/${i}?`)
      )
      ?.close()
  }, id)
  assert.ok(
    await waitFor(async () => (await contentSize(id)) === null, 5_000),
    `${id} bleibt offen`
  )
}
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
      'Kleines Werkzeug: Kachel öffnet ein eigenes, kleines Fenster; das Hauptfenster bleibt',
      async () => {
        await openRoute(page, '/')
        await page.getByPlaceholder('Werkzeug suchen…').waitFor({ timeout: 10_000 })
        const ev = app.waitForEvent('window')
        await page.getByRole('button', { name: 'Timecode-Rechner', exact: true }).click()
        const w = await ev
        await w.waitForLoadState()
        assert.match(w.url(), /#\/tool\/timecode\?fenster=1$/)
        assert.match(page.url(), /#\/$/)
        await w.getByText('Drop-Frame', { exact: false }).first().waitFor({ timeout: 10_000 })
        const size = await contentSize('timecode')
        assert.equal(size[0], 600)
        assert.ok(size[1] >= 400 && size[1] <= 800, String(size))
        // schlanke Kopfleiste: kein Weg zum Startbildschirm, kein App-Menü
        assert.equal(await w.getByRole('button', { name: 'Start', exact: true }).count(), 0)
        assert.equal(await w.getByRole('button', { name: 'Mottulbox', exact: true }).count(), 0)
      }
    ],
    [
      'zweiter Klick holt dasselbe Fenster nach vorn – kein zweites',
      async () => {
        const before = await windowCount()
        await page.getByRole('button', { name: 'Timecode-Rechner', exact: true }).click()
        await new Promise((r) => setTimeout(r, 800))
        assert.equal(await windowCount(), before)
      }
    ],
    [
      'Route im Hauptfenster leitet ins eigene Fenster um',
      async () => {
        const ev = app.waitForEvent('window')
        await openRoute(page, '/tool/circle-calc')
        const w = await ev
        await w.waitForLoadState()
        assert.match(w.url(), /#\/tool\/circle-calc\?fenster=1$/)
        assert.ok(await waitFor(async () => /#\/$/.test(page.url()), 5_000), page.url())
        await closeToolWindow('circle-calc')
      }
    ],
    [
      'Größe und Lage bleiben gemerkt',
      async () => {
        await app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find(
            (x) =>
              !x.isDestroyed() &&
              !x.webContents.isDestroyed() &&
              x.webContents.getURL().includes('#/tool/timecode?')
          )
          w.setContentSize(520, 600)
          w.setPosition(40, 50)
        })
        await closeToolWindow('timecode')
        const ev = app.waitForEvent('window')
        await page.evaluate(() => window.api.openToolWindow('timecode'))
        await (await ev).waitForLoadState()
        assert.deepEqual(await contentSize('timecode'), [520, 600])
        const pos = await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find(
              (x) =>
                !x.isDestroyed() &&
                !x.webContents.isDestroyed() &&
                x.webContents.getURL().includes('#/tool/timecode?')
            )
            .getPosition()
        )
        assert.deepEqual(pos, [40, 50])
        await closeToolWindow('timecode')
      }
    ],
    [
      'alle kleinen Werkzeuge passen in ihr Fenster (außer bewusst scrollenden)',
      async () => {
        const ids = [
          'circle-calc',
          'dmx-address',
          'throw-ratio',
          'audio-delay',
          'projector-lumen',
          'power-load'
        ]
        const workHeight = await app.evaluate(
          ({ screen }) => screen.getPrimaryDisplay().workArea.height
        )
        for (const id of ids) {
          const ev = app.waitForEvent('window')
          await page.evaluate((i) => window.api.openToolWindow(i), id)
          const w = await ev
          await w.waitForLoadState()
          const content = w.getByTestId('tool-content')
          await content.locator('h2').first().waitFor({ timeout: 10_000 })
          await new Promise((r) => setTimeout(r, 300))
          const over = await content.evaluate((el) => el.scrollHeight - el.clientHeight)
          // Auf kleinen Bildschirmen (CI) kürzt main das Fenster auf die Arbeitsfläche – dann
          // darf es scrollen.
          const [, height] = await contentSize(id)
          const clamped = height >= workHeight - 61
          assert.ok(over >= 0 && (over <= 2 || clamped), `${id} scrollt um ${over} px`)
          await closeToolWindow(id)
        }
      }
    ],
    [
      'Hauptfenster schließen nimmt die kleinen Fenster mit (App endet)',
      async () => {
        const ev = app.waitForEvent('window')
        await page.evaluate(() => window.api.openToolWindow('dmx-address'))
        await (await ev).waitForLoadState()
        const exited = new Promise((r) => app.process().once('exit', () => r(true)))
        await app.evaluate(({ BrowserWindow }) => {
          setTimeout(() => {
            BrowserWindow.getAllWindows()
              .find((x) => !x.isDestroyed() && x.webContents.getURL().endsWith('#/'))
              ?.close()
          }, 50)
        })
        const timeout = new Promise((r) => setTimeout(() => r(false), 10_000))
        assert.equal(await Promise.race([exited, timeout]), true, 'App läuft weiter')
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
