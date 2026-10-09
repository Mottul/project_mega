// Werkzeug-Muster: Kopfleiste (App-Menü links, Aktionen mit Text rechts), Ausgabe-Leiste
// (rot umrandet, solange live; Auftrag bernstein), Schublade links (gemerkt: offen/angeheftet)
// und der Monitorwechsel der Ausgabefenster (das neue Fenster darf nicht verloren gehen).
// Öffnet kurz Testbild- und Player-Ausgabe auf dem ersten Bildschirm.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, openRoute, runSteps, Skip, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx

const bar = () => page.getByTestId('tool-bar')
const drawer = () => page.getByTestId('settings-drawer')
const settingsBtn = () => page.getByRole('button', { name: 'Einstellungen', exact: true })
const barActive = async () => (await bar().getAttribute('data-active')) === 'true'
/** Kleine Werkzeuge (shared/toolWindows: SMALL_TOOLS) und die zweispaltig geöffneten */
const SMALL = [
  'circle-calc',
  'dmx-address',
  'throw-ratio',
  'audio-delay',
  'projector-lumen',
  'timecode',
  'power-load',
  'camera-lens',
  'rigging'
]
const TWO_COLUMNS = ['power-load', 'camera-lens', 'rigging']

/** Fenster eines kleinen Werkzeugs im main (null = keins offen). Ein Fenster, das gerade
 *  schließt, steht noch in der Liste – deshalb beide isDestroyed-Prüfungen. */
const winInfo = (id) =>
  app.evaluate(({ BrowserWindow, screen }, i) => {
    const w = BrowserWindow.getAllWindows().find(
      (x) =>
        !x.isDestroyed() &&
        !x.webContents.isDestroyed() &&
        x.webContents.getURL().includes(`#/tool/${i}?`)
    )
    if (!w) return null
    return {
      content: w.getContentSize(),
      outer: w.getSize(),
      pos: w.getPosition(),
      visible: w.isVisible(),
      areaHeight: screen.getDisplayMatching(w.getBounds()).workArea.height
    }
  }, id)

/** Kleines Werkzeug öffnen (Vorgabe: über die Brücke) und warten, bis es sichtbar ist –
 *  main zeigt es erst, wenn die Höhe zum Inhalt passt. */
async function openSmall(
  id,
  trigger = () => page.evaluate((i) => window.api.openToolWindow(i), id)
) {
  const ev = app.waitForEvent('window')
  await trigger()
  const w = await ev
  await w.waitForLoadState()
  await w.getByTestId('tool-content').locator('h2').first().waitFor({ timeout: 10_000 })
  assert.ok(
    await waitFor(async () => (await winInfo(id))?.visible === true, 5_000),
    `${id} erscheint nicht`
  )
  return w
}

/** Die Fensterhöhe entspricht dem Inhalt: kein Scrollen und kein Leerraum – außer das Fenster
 *  ist bildschirmhoch (dann scrollt es) oder am Mindestmaß. */
async function assertFits(w, id) {
  let last = ''
  const ok = await waitFor(async () => {
    const need = await w.evaluate(() => {
      const header = document.querySelector('header')
      const page = document.querySelector('[data-testid=tool-content]')?.firstElementChild
      return Math.ceil(header.getBoundingClientRect().height + page.getBoundingClientRect().height)
    })
    const info = await winInfo(id)
    const h = info.content[1]
    const atScreen = info.outer[1] >= info.areaHeight - 1
    last = `Inhalt ${need} px, Fenster ${h} px`
    return Math.abs(h - need) <= 2 || (atScreen && need > h) || (h === 200 && need < 200)
  }, 5_000)
  assert.ok(ok, `${id}: ${last}`)
}

/** Erschien das Fenster gleich in passender Höhe? Muss main es ungemessen zeigen (die Seite
 *  meldete ihre Höhe nicht rechtzeitig), steht das im Debug-Log – geschrieben, BEVOR das
 *  Fenster sichtbar wird, also nach openSmall sicher da. */
function assertNoJump(id) {
  let log = ''
  try {
    log = readFileSync(join(ctx.userData, 'avtoolbox-debug.log'), 'utf8')
  } catch {
    /* noch kein Log */
  }
  assert.ok(!log.includes(`zeige ungemessen: ${id}`), `${id} erschien ungemessen und sprang`)
}

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
  assert.ok(await waitFor(async () => (await winInfo(id)) === null, 5_000), `${id} bleibt offen`)
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
        const w = await openSmall('timecode', () =>
          page.getByRole('button', { name: 'Timecode-Rechner', exact: true }).click()
        )
        assert.match(w.url(), /#\/tool\/timecode\?fenster=1$/)
        assert.match(page.url(), /#\/$/)
        assert.equal((await winInfo('timecode')).content[0], 520)
        await assertFits(w, 'timecode')
        assertNoJump('timecode')
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
      'Breite und Lage bleiben gemerkt, die Höhe richtet sich wieder nach dem Inhalt',
      async () => {
        await app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find(
            (x) =>
              !x.isDestroyed() &&
              !x.webContents.isDestroyed() &&
              x.webContents.getURL().includes('#/tool/timecode?')
          )
          w.setContentSize(400, 300)
          w.setPosition(40, 50)
        })
        await closeToolWindow('timecode')
        const w = await openSmall('timecode')
        const info = await winInfo('timecode')
        assert.equal(info.content[0], 400)
        assert.deepEqual(info.pos, [40, 50])
        await assertFits(w, 'timecode')
        assertNoJump('timecode')
        await closeToolWindow('timecode')
      }
    ],
    [
      'Route im Hauptfenster leitet ins eigene Fenster um',
      async () => {
        const w = await openSmall('circle-calc', () => openRoute(page, '/tool/circle-calc'))
        assert.match(w.url(), /#\/tool\/circle-calc\?fenster=1$/)
        assert.ok(await waitFor(async () => /#\/$/.test(page.url()), 5_000), page.url())
        await closeToolWindow('circle-calc')
      }
    ],
    [
      'alle neun Rechner: Höhe folgt dem Inhalt, zweispaltig wo vorgesehen, bis 320 px schmal',
      async () => {
        for (const id of SMALL) {
          const w = await openSmall(id)
          await assertFits(w, id)
          assertNoJump(id)
          if (TWO_COLUMNS.includes(id)) {
            const tops = await w
              .getByTestId('tool-content')
              .locator('h2')
              .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
            assert.equal(tops.length, 2, id)
            assert.ok(Math.abs(tops[0] - tops[1]) <= 1, `${id}: Karten nicht nebeneinander ${tops}`)
          }
          // schmalste Breite: nichts ragt seitlich heraus, die Höhe wächst mit
          await app.evaluate(({ BrowserWindow }, i) => {
            const x = BrowserWindow.getAllWindows().find(
              (v) =>
                !v.isDestroyed() &&
                !v.webContents.isDestroyed() &&
                v.webContents.getURL().includes(`#/tool/${i}?`)
            )
            x.setContentSize(320, x.getContentSize()[1])
          }, id)
          assert.ok(
            await waitFor(async () => (await winInfo(id)).content[0] === 320, 5_000),
            `${id}: nicht auf 320 px`
          )
          const wide = await w.evaluate(() => {
            const el = document.querySelector('[data-testid=tool-content]')
            const root = document.documentElement
            return Math.max(el.scrollWidth - el.clientWidth, root.scrollWidth - root.clientWidth)
          })
          assert.ok(wide <= 0, `${id}: ragt bei 320 px um ${wide} px heraus`)
          await assertFits(w, id)
          await closeToolWindow(id)
        }
      }
    ],
    [
      'Kompaktmodus: ein offenes kleines Fenster folgt sofort und wird niedriger',
      async () => {
        const w = await openSmall('audio-delay')
        await assertFits(w, 'audio-delay')
        const normal = (await winInfo('audio-delay')).content[1]
        const compact = () =>
          w.evaluate(() => document.documentElement.classList.contains('ui-compact'))
        await page.evaluate(() => window.api.setSettings({ uiDensity: 'compact' }))
        assert.ok(await waitFor(compact, 5_000), 'Kompaktmodus kommt nicht an')
        await assertFits(w, 'audio-delay')
        const small = (await winInfo('audio-delay')).content[1]
        assert.ok(small < normal, `kompakt ${small} px, normal ${normal} px`)
        await page.evaluate(() => window.api.setSettings({ uiDensity: 'normal' }))
        assert.ok(await waitFor(async () => !(await compact()), 5_000))
        await assertFits(w, 'audio-delay')
      }
    ],
    [
      'minimiert umgestellt: die Höhe passt nach dem Wiederherstellen',
      async () => {
        // Linux ohne Fenstermanager (CI) minimiert nicht verlässlich; macOS zeichnet minimierte
        // Fenster nicht neu
        if (process.platform !== 'win32') throw new Skip('nur unter Windows')
        const w = await openSmall('dmx-address')
        await assertFits(w, 'dmx-address')
        const byId = ({ BrowserWindow }, [i, action]) => {
          const x = BrowserWindow.getAllWindows().find(
            (v) =>
              !v.isDestroyed() &&
              !v.webContents.isDestroyed() &&
              v.webContents.getURL().includes(`#/tool/${i}?`)
          )
          if (action === 'minimize') x.minimize()
          if (action === 'restore') x.restore()
          return x.isMinimized()
        }
        await app.evaluate(byId, ['dmx-address', 'minimize'])
        assert.ok(await waitFor(() => app.evaluate(byId, ['dmx-address', 'state']), 5_000))
        await page.evaluate(() => window.api.setSettings({ uiDensity: 'compact' }))
        await new Promise((r) => setTimeout(r, 800))
        await app.evaluate(byId, ['dmx-address', 'restore'])
        assert.ok(await waitFor(async () => !(await app.evaluate(byId, ['dmx-address', 'state']))))
        await assertFits(w, 'dmx-address')
        await page.evaluate(() => window.api.setSettings({ uiDensity: 'normal' }))
        await assertFits(w, 'dmx-address')
        await closeToolWindow('dmx-address')
      }
    ],
    [
      'Hauptfenster schließen nimmt die kleinen Fenster mit',
      async () => {
        assert.notEqual(await winInfo('audio-delay'), null)
        const exited = new Promise((r) => app.process().once('exit', () => r(true)))
        await app.evaluate(({ BrowserWindow }) => {
          setTimeout(() => {
            BrowserWindow.getAllWindows()
              .find((x) => !x.isDestroyed() && x.webContents.getURL().endsWith('#/'))
              ?.close()
          }, 50)
        })
        if (process.platform === 'darwin') {
          // macOS beendet die App mit dem letzten Fenster bewusst nicht (Dock)
          assert.ok(
            await waitFor(async () => (await windowCount()) === 0, 10_000),
            'kleine Fenster bleiben offen'
          )
        } else {
          const timeout = new Promise((r) => setTimeout(() => r(false), 10_000))
          assert.equal(await Promise.race([exited, timeout]), true, 'App läuft weiter')
        }
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
