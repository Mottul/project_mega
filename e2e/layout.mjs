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

/**
 * Fenster eines kleinen Werkzeugs im main: eine BrowserWindow-Methode aufrufen
 * (`toolWin(id, 'setContentSize', 400, 300)`, 'minimize', 'isMinimized', 'close' …) oder ohne
 * Methode Größe und Lage lesen. null, wenn keins offen ist. Ein Fenster, das gerade schließt,
 * steht noch in der Liste, deshalb beide isDestroyed-Prüfungen.
 */
const toolWin = (id, method, ...args) =>
  app.evaluate(
    ({ BrowserWindow, screen }, [i, m, a]) => {
      const w = BrowserWindow.getAllWindows().find(
        (v) =>
          !v.isDestroyed() &&
          !v.webContents.isDestroyed() &&
          v.webContents.getURL().includes(`#/tool/${i}?`)
      )
      if (!w) return null
      if (m == null) {
        return {
          content: w.getContentSize(),
          outer: w.getSize(),
          pos: w.getPosition(),
          visible: w.isVisible(),
          areaHeight: screen.getDisplayMatching(w.getBounds()).workArea.height
        }
      }
      // Tippfehler sollen auffallen, nicht als „erledigt“ durchgehen
      if (typeof w[m] !== 'function') throw new Error(`BrowserWindow.${m}() gibt es nicht`)
      return w[m](...a) ?? true
    },
    [id, method, args]
  )
const winInfo = (id) => toolWin(id)

/** Kleines Werkzeug öffnen (Vorgabe: über die Brücke) und warten, bis es sichtbar ist –
 *  main zeigt es erst, wenn die Höhe zum Inhalt passt. Ein von einem gescheiterten Schritt
 *  liegengebliebenes Fenster wird vorher geschlossen (sonst käme kein neues, Folgefehler). */
async function openSmall(
  id,
  trigger = () => page.evaluate((i) => window.api.openToolWindow(i), id)
) {
  if (await winInfo(id)) await closeToolWindow(id)
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
  await toolWin(id, 'close')
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
      'LED-Wall: Projekt-Leiste, Schublade, Darstellungen – Draufsicht nur mit Curving',
      async () => {
        await tool('led-wall')
        assert.equal(await bar().getAttribute('data-kind'), 'job')
        assert.equal(
          await bar()
            .getByRole('button', { name: /PDF exportieren/ })
            .count(),
          1
        )
        await drawer().waitFor({ timeout: 10_000 })
        const tab = (name) => page.getByRole('tab', { name, exact: true })
        const figures = page.getByRole('region', { name: 'Kennzahlen' })
        assert.equal(await tab('Ansicht').getAttribute('aria-selected'), 'true')
        // flaches Modul (Vorgabe): keine Draufsicht
        assert.equal(await tab('Draufsicht').count(), 0)
        // Größe in der Schublade -> Kennzahlen folgen (496-mm-Module: 6 m -> 12 Spalten)
        await drawer()
          .getByLabel(/^Breite/)
          .fill('6')
        await figures.getByText('12 × 5').waitFor({ timeout: 5_000 })
        // Curving-Modul: Draufsicht erscheint und zeigt die Kennzahlen der Form
        await drawer()
          .getByRole('radio', { name: /^uS2\+/ })
          .click()
        await tab('Draufsicht').click()
        await page.getByRole('tabpanel').getByText('Radius').waitFor({ timeout: 5_000 })
        // Signalplan: Modul anklicken weist es der Kette zu, der Ketten-Knopf zählt mit
        await tab('Signal').click()
        await page.getByRole('button', { name: 'Modul Zeile 1, Spalte 1', exact: true }).click()
        await page
          .getByRole('button', { name: 'Modul Zeile 1, Spalte 1 – S1', exact: true })
          .waitFor({ timeout: 5_000 })
        assert.equal(
          await page.getByRole('button', { name: 'Signal-Kette 1: 1 Module', exact: true }).count(),
          1
        )
        // zurück zum flachen Modul: aus der Draufsicht wird wieder die Ansicht
        await tab('Draufsicht').click()
        await drawer()
          .getByRole('radio', { name: /^496-2,0/ })
          .click()
        assert.equal(await tab('Draufsicht').count(), 0)
        assert.equal(await tab('Ansicht').getAttribute('aria-selected'), 'true')
      }
    ],
    [
      'NovaStar, Netzwerk-Scanner, YouTube-Downloader, Packliste: Leiste und Schublade wie alle',
      async () => {
        // [Leiste, Schublade?] – der Netzwerk-Scanner hat keine Einstellungen
        const expected = {
          novastar: ['output', true],
          netscan: ['job', false],
          'youtube-dl': ['job', true],
          'packing-list': ['job', true]
        }
        for (const [id, [kind, hasDrawer]] of Object.entries(expected)) {
          await tool(id)
          assert.equal(await bar().getAttribute('data-kind'), kind, id)
          assert.equal(await settingsBtn().count(), hasDrawer ? 1 : 0, id)
        }
        // NovaStar ohne Verbindung: nicht live, Blackout & Co. gesperrt
        await tool('novastar')
        assert.equal(await barActive(), false)
        for (const name of ['Blackout', 'Einfrieren', 'Fade to Black']) {
          assert.equal(await bar().getByRole('button', { name }).isDisabled(), true, name)
        }
        // yt-dlp (Version, Prüfen) steht jetzt wie ffmpeg im App-Menü
        await page.getByRole('button', { name: 'Mottulbox', exact: true }).click()
        await page.getByTestId('ytdlp-settings').waitFor({ timeout: 10_000 })
        await page.keyboard.press('Escape')
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
        await closeToolWindow('timecode')
        // ein niedriger Rechner: Ein hoher rückte auf kleinen Bildschirmen (CI, 1024 × 768)
        // beim Anpassen nach oben, damit er nicht unten herausragt – dann stimmte y nicht mehr
        await openSmall('circle-calc')
        await toolWin('circle-calc', 'setContentSize', 400, 300)
        await toolWin('circle-calc', 'setPosition', 40, 50)
        await closeToolWindow('circle-calc')
        const w = await openSmall('circle-calc')
        const info = await winInfo('circle-calc')
        assert.equal(info.content[0], 400)
        assert.deepEqual(info.pos, [40, 50])
        await assertFits(w, 'circle-calc')
        assertNoJump('circle-calc')
        await closeToolWindow('circle-calc')
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
      'Rechner: verknüpfte Felder – Eingabe wird Quelle, Fokus übernimmt den berechneten Wert',
      async () => {
        const w = await openSmall('circle-calc')
        const field = (label) => w.getByLabel(label, { exact: true })
        await field('Radius r').fill('2')
        assert.ok(await waitFor(async () => (await field('Durchmesser d').inputValue()) === '4'))
        // berechnete Felder tragen den Hinweis, die Quelle nicht
        assert.notEqual(await field('Durchmesser d').getAttribute('title'), null)
        assert.equal(await field('Radius r').getAttribute('title'), null)
        // Fokus auf ein berechnetes Feld: Wert bleibt stehen, das Feld wird zur Quelle
        await field('Umfang U').focus()
        const umfang = await field('Umfang U').inputValue()
        assert.match(umfang, /^12,566/)
        assert.equal(await field('Umfang U').getAttribute('title'), null)
        await field('Umfang U').fill('31,4159')
        assert.ok(await waitFor(async () => (await field('Radius r').inputValue()) === '5'))
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
          await toolWin(id, 'setContentSize', 320, (await winInfo(id)).content[1])
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
        // niedriger Rechner: ein bildschirmhoher könnte kompakt nicht niedriger werden
        const w = await openSmall('circle-calc')
        await assertFits(w, 'circle-calc')
        const normal = (await winInfo('circle-calc')).content[1]
        const compact = () =>
          w.evaluate(() => document.documentElement.classList.contains('ui-compact'))
        await page.evaluate(() => window.api.setSettings({ uiDensity: 'compact' }))
        assert.ok(await waitFor(compact, 5_000), 'Kompaktmodus kommt nicht an')
        await assertFits(w, 'circle-calc')
        const small = (await winInfo('circle-calc')).content[1]
        assert.ok(small < normal, `kompakt ${small} px, normal ${normal} px`)
        await page.evaluate(() => window.api.setSettings({ uiDensity: 'normal' }))
        assert.ok(await waitFor(async () => !(await compact()), 5_000))
        await assertFits(w, 'circle-calc')
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
        await toolWin('dmx-address', 'minimize')
        assert.ok(await waitFor(() => toolWin('dmx-address', 'isMinimized'), 5_000))
        await page.evaluate(() => window.api.setSettings({ uiDensity: 'compact' }))
        await new Promise((r) => setTimeout(r, 800))
        await toolWin('dmx-address', 'restore')
        assert.ok(await waitFor(async () => !(await toolWin('dmx-address', 'isMinimized'))))
        await assertFits(w, 'dmx-address')
        await page.evaluate(() => window.api.setSettings({ uiDensity: 'normal' }))
        await assertFits(w, 'dmx-address')
        await closeToolWindow('dmx-address')
      }
    ],
    [
      'Hauptfenster schließen nimmt die kleinen Fenster mit',
      async () => {
        assert.notEqual(await winInfo('circle-calc'), null)
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
