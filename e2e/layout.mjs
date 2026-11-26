// Werkzeug-Muster: Kopfleiste (App-Menü links, Aktionen mit Text rechts), Ausgabe-Leiste
// (rot umrandet, solange live; Auftrag bernstein), Schublade links (gemerkt: offen/angeheftet)
// und der Monitorwechsel der Ausgabefenster (das neue Fenster darf nicht verloren gehen).
// Öffnet kurz Testbild- und Player-Ausgabe auf dem ersten Bildschirm.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, openRoute, runSteps, Skip, sleep, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx

const bar = () => page.getByTestId('tool-bar')
const drawer = () => page.getByTestId('settings-drawer')
const settingsBtn = () => page.getByRole('button', { name: 'Einstellungen', exact: true })
const barActive = async () => (await bar().getAttribute('data-active')) === 'true'
/** Anzahl abwarten statt sofort zählen: Auf macOS in der CI sind Leiste und Schublade direkt
 *  nach dem Öffnen oder einem Klick oft noch nicht nachgezogen. */
async function expectCount(locator, n, what) {
  assert.ok(
    await waitFor(async () => (await locator.count()) === n, 5_000),
    `${what}: ${await locator.count()}× statt ${n}×`
  )
}
/** Attribut abwarten statt sofort lesen (gleicher Grund) */
async function expectAttr(locator, name, value, what) {
  assert.ok(
    await waitFor(async () => (await locator.getAttribute(name)) === value, 5_000),
    `${what}: ${name}=${await locator.getAttribute(name)} statt ${value}`
  )
}
/** Wert einer Ergebniszeile (`Readout`) eines Rechners: die Zeile neben ihrer Beschriftung,
 *  „–“ ohne Ergebnis, sonst Zahl und Einheit („3.600lm“) */
const readout = (w, label) =>
  w.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]')
/** Text wörtlich in einem regulären Ausdruck („Bridle (2 Stränge)“) */
const woertlich = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Kopf einer zuklappbaren Karte (`FoldCard`) eines Rechners: der Knopf, der mit ihrem Titel
 *  beginnt – dahinter steht die Kurzfassung */
const kartenKopf = (w, titel) =>
  w.getByTestId('tool-content').getByRole('button', { name: new RegExp('^' + woertlich(titel)) })
/** Knopf einer Knopfgruppe (`Segmented`) eines Rechners */
const knopf = (w, gruppe, name) =>
  w.getByRole('group', { name: gruppe, exact: true }).getByRole('button', { name, exact: true })
/** Oberkante eines Elements im Fenster (px) */
const oberkante = async (loc) => (await loc.boundingBox()).y
/** Die Antwort einer Karte (Beschriftung ihres `Readout`; mit ⓘ als Teiltext, das ⓘ zählt
 *  sonst mit) steht über ihrem ersten Feld */
async function antwortZuerst(w, antwort, feld, { mitInfo = false } = {}) {
  const a = await oberkante(w.getByText(antwort, { exact: !mitInfo }))
  const f = await oberkante(w.getByLabel(feld, { exact: true }))
  assert.ok(a < f, `${antwort} bei ${a} px, erstes Feld „${feld}“ bei ${f} px`)
}
/** Zuklappbare Karten des Rechners (das ⓘ trägt auch aria-expanded, steht aber nicht im Titel) */
const kartenKoepfe = (w) => w.getByTestId('tool-content').locator('h2 > button[aria-expanded]')
/** Keine Liste mit bis zu vier Möglichkeiten (die sind Knopfgruppen) – je Liste die Zahl der
 *  Einträge, wenn eine zu kurz ist */
async function keineKurzeListe(w, id) {
  const eintraege = await w.locator('select').evaluateAll((els) => els.map((e) => e.length))
  assert.ok(
    eintraege.every((n) => n > 4),
    `${id}: Liste mit bis zu vier Möglichkeiten (${eintraege})`
  )
}
/** Breite eines kleinen Fensters setzen, schließen und wieder öffnen – es öffnet in der
 *  gemerkten Breite, die Karten im Zustand „ab Werk“ für diese Breite */
async function mitBreite(id, breite) {
  await toolWin(id, 'setContentSize', breite, (await winInfo(id)).content[1])
  await closeToolWindow(id)
  const w = await openSmall(id)
  assert.equal((await winInfo(id)).content[0], breite)
  return w
}
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
  'rigging',
  'rta',
  'tone-generator'
]
const TWO_COLUMNS = ['power-load', 'camera-lens', 'rigging', 'rta']

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
  // Inhalt geladen (lazy): eine Kartenüberschrift oder – der Testtongenerator hat keine, seine
  // Felder tragen die Beschriftung – ein Knopf
  await w.getByTestId('tool-content').locator('h2, button').first().waitFor({ timeout: 10_000 })
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

/** Fenstergrößen: Unter 1100 px Breite schwebt die Schublade immer, darüber gilt „angeheftet“.
 *  Die Bildschirme der CI unter Windows und macOS sind nur etwa 1024 px breit – wer anheften
 *  will, stellt deshalb erst ein breites Fenster ein. */
const BREIT = { width: 1366, height: 768 }
const SCHMAL = { width: 1024, height: 600 }

/** Klick in die Arbeitsfläche oben rechts, auf den Rand des Inhalts – dort liegt kein
 *  Bedienelement und nicht die Schublade (vorher geprüft, sonst löste der Klick etwas aus) */
async function klickInArbeitsflaeche() {
  const box = await page.getByTestId('tool-main').boundingBox()
  const [x, y] = [box.x + box.width - 30, box.y + 6]
  const ziel = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return {
        inArbeitsflaeche: !!el?.closest('[data-testid="tool-main"]'),
        bedienbar: !!el?.closest('button, a, input, select, textarea, [role], [tabindex]')
      }
    },
    [x, y]
  )
  assert.ok(
    ziel.inArbeitsflaeche && !ziel.bedienbar,
    `Klickpunkt ${Math.round(x)}, ${Math.round(y)} ungeeignet: ${JSON.stringify(ziel)}`
  )
  await page.mouse.click(x, y)
}

async function tool(id) {
  await openRoute(page, '/')
  // openRoute setzt nur den Hash: Erst warten, bis die Leiste des vorigen Werkzeugs weg ist (die
  // Startseite hat keine) – sonst liest der Schritt auf langsamen Runnern noch die alte Leiste
  // (macOS-CI: Video-Konverter meldete data-kind „output“ des Video-Players)
  await bar().waitFor({ state: 'detached', timeout: 15_000 })
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
        // anheften lässt sie sich nur im breiten Fenster; die folgenden Schritte bleiben dabei
        await page.setViewportSize(BREIT)
        await tool('stage-timer')
        await drawer().waitFor({ timeout: 10_000 })
        assert.equal(await drawer().getAttribute('data-pinned'), 'true')
        await page.getByRole('button', { name: 'Schublade lösen' }).click()
        assert.equal(await drawer().getAttribute('data-pinned'), 'false')
        assert.equal(await drawer().evaluate((el) => getComputedStyle(el).position), 'absolute')
        await page.getByRole('button', { name: 'Einstellungen schließen' }).click()
        await expectCount(drawer(), 0, 'Schublade nach dem Schließen')
        assert.equal(await settingsBtn().getAttribute('aria-expanded'), 'false')
        // anderes Werkzeug: eigene Schublade, weiter offen
        await tool('test-patterns')
        await drawer().waitFor({ timeout: 10_000 })
        // zurück: zu und gelöst gemerkt
        await tool('stage-timer')
        await expectCount(drawer(), 0, 'Schublade beim Zurückkehren')
        await settingsBtn().click()
        await drawer().waitFor({ timeout: 5_000 })
        assert.equal(await drawer().getAttribute('data-pinned'), 'false')
        await page.getByRole('button', { name: 'Schublade anheften' }).click()
        assert.equal(await drawer().getAttribute('data-pinned'), 'true')
      }
    ],
    [
      'Schmales Fenster: angeheftete Schublade schwebt, breiter wieder angeheftet – ohne die Nadel',
      async () => {
        // Stand aus dem vorigen Schritt: Stage-Timer, Schublade offen und angeheftet
        await tool('stage-timer')
        await drawer().waitFor({ timeout: 10_000 })
        await expectAttr(drawer(), 'data-pinned', 'true', '1366 px, angeheftet')
        try {
          await page.setViewportSize(SCHMAL)
          await expectAttr(drawer(), 'data-pinned', 'false', '1024 px, angeheftet gemerkt')
          assert.equal(await drawer().evaluate((el) => getComputedStyle(el).position), 'absolute')
          // die Arbeitsfläche hat die ganze Breite, die Schublade liegt darüber
          const breite = await page
            .getByTestId('tool-main')
            .evaluate((el) => el.getBoundingClientRect().width)
          assert.ok(breite >= SCHMAL.width - 1, `Arbeitsfläche nur ${breite} px breit`)
          await page.setViewportSize(BREIT)
          await expectAttr(drawer(), 'data-pinned', 'true', 'wieder 1366 px')
          assert.equal(await drawer().evaluate((el) => getComputedStyle(el).position), 'relative')
        } finally {
          await page.setViewportSize(BREIT)
        }
      }
    ],
    [
      'Schmales Fenster: Nadel ausgegraut mit Hinweis, ein Klick darauf ändert nichts',
      async () => {
        await drawer().waitFor({ timeout: 10_000 })
        try {
          await page.setViewportSize(SCHMAL)
          await expectAttr(drawer(), 'data-pinned', 'false', '1024 px')
          const nadel = drawer().getByRole('button', { name: 'Schublade anheften' })
          assert.equal(await nadel.getAttribute('aria-disabled'), 'true')
          assert.equal(await nadel.isDisabled(), true)
          const hinweis = (await nadel.getAttribute('title')) ?? ''
          assert.match(hinweis, /schmalen Fenster/, `Hinweis: „${hinweis}“`)
          assert.match(hinweis, /angeheftet ist sie wieder/, `Hinweis: „${hinweis}“`)
          // Ausgegraut heißt halb durchsichtig (wie gesperrte Knöpfe)
          const deckkraft = await nadel.evaluate((el) => Number(getComputedStyle(el).opacity))
          assert.ok(deckkraft < 1, `Nadel nicht ausgegraut (opacity ${deckkraft})`)
          // trotzdem geklickt: Der gemerkte Wert bleibt
          await nadel.click({ force: true })
          await sleep(300)
          assert.equal(await drawer().getAttribute('data-pinned'), 'false')
          await page.setViewportSize(BREIT)
          await expectAttr(drawer(), 'data-pinned', 'true', 'nach dem Klick auf die graue Nadel')
          const offen = drawer().getByRole('button', { name: 'Schublade lösen' })
          assert.equal(await offen.getAttribute('aria-disabled'), null)
        } finally {
          await page.setViewportSize(BREIT)
        }
      }
    ],
    [
      'Klick in die Arbeitsfläche schließt nur die schwebende Schublade',
      async () => {
        await drawer().waitFor({ timeout: 10_000 })
        try {
          // breit und angeheftet: bleibt offen
          await expectAttr(drawer(), 'data-pinned', 'true', '1366 px')
          await klickInArbeitsflaeche()
          await sleep(300)
          assert.equal(await drawer().count(), 1, 'angeheftete Schublade ging zu')
          // schmal: schwebt – ein Klick daneben schließt sie
          await page.setViewportSize(SCHMAL)
          await expectAttr(drawer(), 'data-pinned', 'false', '1024 px')
          await klickInArbeitsflaeche()
          await expectCount(drawer(), 0, 'schwebende Schublade nach dem Klick daneben')
          assert.equal(await settingsBtn().getAttribute('aria-expanded'), 'false')
          // breit und gelöst: schwebt ebenfalls und geht ebenso zu
          await page.setViewportSize(BREIT)
          await settingsBtn().click()
          await drawer().waitFor({ timeout: 5_000 })
          await expectAttr(drawer(), 'data-pinned', 'true', 'angeheftet bleibt gemerkt')
          await page.getByRole('button', { name: 'Schublade lösen' }).click()
          await expectAttr(drawer(), 'data-pinned', 'false', 'gelöst')
          await klickInArbeitsflaeche()
          await expectCount(drawer(), 0, 'gelöste Schublade nach dem Klick daneben')
        } finally {
          // wie vorher: offen und angeheftet
          await page.setViewportSize(BREIT)
          if ((await drawer().count()) === 0) await settingsBtn().click()
          await drawer().waitFor({ timeout: 5_000 })
          if ((await drawer().getAttribute('data-pinned')) !== 'true') {
            await page.getByRole('button', { name: 'Schublade anheften' }).click()
          }
        }
      }
    ],
    [
      'Klick daneben übernimmt ein angefangenes Feld der Schublade, bevor sie zugeht',
      async () => {
        // Video-Player: „Breite“ der Wand ist ein Zahlenfeld, das erst beim Verlassen übernimmt
        await tool('video-player')
        await drawer().waitFor({ timeout: 10_000 })
        const breite = () => drawer().getByRole('textbox', { name: 'Breite', exact: true })
        const wand = async () => (await page.evaluate(() => window.api.getSettings())).player
        const vorher = (await wand()).wallWidth
        try {
          await page.setViewportSize(SCHMAL)
          await expectAttr(drawer(), 'data-pinned', 'false', '1024 px')
          await breite().fill('1600')
          await klickInArbeitsflaeche()
          await expectCount(drawer(), 0, 'Schublade nach dem Klick daneben')
          assert.ok(
            await waitFor(async () => (await wand()).wallWidth === 1600, 5_000),
            `Breite der Wand ${(await wand()).wallWidth} statt 1600 – das Feld ging verloren`
          )
        } finally {
          // zurück wie ein Nutzer: über das Feld (setSettings erreicht dieses Fenster nicht)
          await page.setViewportSize(BREIT)
          if ((await drawer().count()) === 0) await settingsBtn().click()
          await drawer().waitFor({ timeout: 5_000 })
          await breite().fill(String(vorher))
          await breite().press('Tab')
          assert.ok(await waitFor(async () => (await wand()).wallWidth === vorher, 5_000))
        }
      }
    ],
    [
      'ⓘ zeigt die Erklärung statt eines Absatzes; ein Klick daneben schließt sie',
      async () => {
        await tool('video-player')
        const info = page.getByRole('button', { name: 'Erklärung zu „Gleichzeitige Importe“' })
        const tip = page.getByRole('tooltip').filter({ hasText: 'Während der Show lieber 1' })
        await info.click()
        await tip.waitFor({ timeout: 5_000 })
        // daneben: am Handy kommt dabei oft kein blur – die Blase blieb sonst stehen
        await page.getByRole('heading', { level: 1 }).click()
        await tip.waitFor({ state: 'detached', timeout: 5_000 })
        // ein Tipp öffnet, ein zweiter auf dasselbe ⓘ schließt (Finger: ohne Darüberfahren)
        await info.dispatchEvent('click')
        await tip.waitFor({ timeout: 5_000 })
        await info.dispatchEvent('click')
        await tip.waitFor({ state: 'detached', timeout: 5_000 })
      }
    ],
    [
      'Testbild: Leiste wird live; zweimal Esc oder Schließen von außen beendet „Live“, einmal Esc nicht',
      async () => {
        await tool('test-patterns')
        assert.equal(await barActive(), false)
        const before = await windowCount()
        // Tastendruck wie vom Bediener: über die Eingabe-Pipeline des Ausgabefensters
        // (Playwrights keyboard.press erreicht 'before-input-event' nicht zuverlässig).
        const esc = () =>
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
        // Ein einzelner Druck lässt die Ausgabe stehen (shared/ausgabe.ts, eine Sekunde); nach der
        // Pause zählt der nächste wieder als erster – erst der übernächste schließt
        const pressEsc = async () => {
          assert.equal(await esc(), true)
          await new Promise((r) => setTimeout(r, 1300))
          assert.equal(await barActive(), true, 'ein einzelnes Esc hat geschlossen')
          assert.equal(await windowCount(), before + 1, 'ein einzelnes Esc hat geschlossen')
          assert.equal(await esc(), true)
          return esc()
        }
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
      'Ausgabe „Als Fenster“: kein Vollbild; Knopf und Mauszeiger nur bei Mausbewegung',
      async () => {
        await tool('test-patterns')
        const before = await windowCount()
        await bar().getByLabel('Ausgabe-Monitor').selectOption('fenster')
        await bar().getByRole('button', { name: 'Im Fenster starten' }).click()
        assert.ok(await waitFor(barActive, 10_000), 'Leiste wird nicht live')
        const out = await waitFor(
          async () => app.windows().find((p) => p.url().endsWith('#/output')) ?? null,
          10_000
        )
        assert.ok(out, 'Ausgabefenster fehlt')
        const vollbild = await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((x) => !x.isDestroyed() && x.webContents.getURL().endsWith('#/output'))
            ?.isFullScreen()
        )
        assert.equal(vollbild, false, 'als Fenster, nicht im Vollbild')
        // Der Knopf steht nie im Bild, solange die Maus ruht (auch im NDI-Bild des Timers)
        const knopf = out.getByTestId('ausgabe-schliessen')
        await knopf.waitFor({ state: 'attached', timeout: 10_000 })
        const deckkraft = () => knopf.evaluate((el) => getComputedStyle(el).opacity)
        const zeiger = () => out.evaluate(() => document.documentElement.style.cursor)
        assert.ok(
          await waitFor(async () => (await deckkraft()) === '0', 8_000),
          'Knopf bleibt ohne Mausbewegung sichtbar'
        )
        assert.equal(await zeiger(), 'none', 'Mauszeiger bleibt ohne Bewegung sichtbar')
        await out.mouse.move(40, 40)
        await out.mouse.move(60, 60)
        assert.ok(
          await waitFor(async () => (await deckkraft()) === '1', 3_000),
          'Knopf erscheint bei Mausbewegung nicht'
        )
        assert.equal(await zeiger(), '')
        await bar().getByRole('button', { name: 'Fenster schließen' }).click()
        assert.ok(await waitFor(async () => (await windowCount()) === before, 10_000))
        assert.ok(await waitFor(async () => !(await barActive()), 5_000))
        // die folgenden Schritte erwarten wieder einen Monitor
        await bar().getByLabel('Ausgabe-Monitor').selectOption({ index: 0 })
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
        await expectCount(
          bar().getByRole('button', { name: 'Drucken / PDF' }),
          1,
          '„Drucken / PDF“ in der Leiste'
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
        await expectCount(
          page.getByRole('button', { name: 'Signal-Kette 1: 1 Module', exact: true }),
          1,
          'Ketten-Knopf'
        )
        // zurück zum flachen Modul: aus der Draufsicht wird wieder die Ansicht
        await tab('Draufsicht').click()
        await drawer()
          .getByRole('radio', { name: /^496-2,0/ })
          .click()
        await expectCount(tab('Draufsicht'), 0, 'Reiter „Draufsicht“ beim flachen Modul')
        await expectAttr(tab('Ansicht'), 'aria-selected', 'true', 'Reiter „Ansicht“')
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
        // Adapter-Namen: ohne Befehl (Linux ohne nmcli) leer, aber nie ein Fehler; unter Windows
        // sieht nur dieser Lauf, ob die PowerShell-Abfrage wirklich durchgeht
        const namen = await page.evaluate(() => window.api.netscan.interfaceNames())
        assert.equal(typeof namen, 'object')
        if (process.platform === 'win32') {
          assert.ok(Object.keys(namen).length > 0, 'keine Adapter-Namen')
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
      'Packliste: langer Blocktitel nutzt die Breite, Farbe je Block, Drucken in der Leiste',
      async () => {
        await tool('packing-list')
        const block = page.getByTestId('pack-block').first()
        const name = block.getByRole('textbox', { name: 'Name des Blocks' })
        await name.fill('Kabel, Stecker und Adapter für Bühne, Regie und FOH-Platz')
        await name.press('Enter')
        // früher auf 240 px begrenzt, obwohl daneben Platz war
        const breite = await name.evaluate((el) => el.getBoundingClientRect().width)
        assert.ok(breite > 260, `Titel nur ${Math.round(breite)} px breit`)
        await block.getByRole('button', { name: /^Farbe für/ }).click()
        await page.getByRole('option', { name: 'Farbe #22c55e' }).click()
        assert.ok(
          await waitFor(
            async () => (await block.getAttribute('style'))?.includes('rgb(34, 197, 94)'),
            3_000
          ),
          await block.getAttribute('style')
        )
        await bar().getByRole('button', { name: 'Drucken / PDF' }).waitFor({ timeout: 5_000 })
      }
    ],
    [
      'Fernsteuerung überall gleich: „Handy“ in der Leiste, Port und QR-Code in der Schublade',
      async () => {
        const toggles = {
          'video-player': 'Handy',
          'jingle-player': 'Handy',
          'osc-control': 'Handy',
          'stage-timer': 'Handy & Browser'
        }
        for (const [id, name] of Object.entries(toggles)) {
          await tool(id)
          // warten statt sofort zählen: Auf langsamen Rechnern (macOS in der CI) ist die
          // Schublade beim ersten Blick noch nicht gefüllt
          const toggle = bar().getByRole('button', { name, exact: true })
          assert.ok(
            await waitFor(async () => (await toggle.count()) === 1, 5_000),
            `${id}: „${name}“ in der Leiste ${await toggle.count()}×`
          )
          await drawer().waitFor({ timeout: 5_000 })
          const section = drawer().getByRole('button', { name: /^Fernsteuerung/ })
          assert.ok(
            await waitFor(async () => (await section.count()) === 1, 5_000),
            `${id}: Bereich „Fernsteuerung“ ${await section.count()}× in der Schublade`
          )
        }
        // Jingle-Player wirklich ein- und ausschalten – auf eigenem Port, damit eine laufende
        // Mottulbox nicht stört
        await tool('jingle-player')
        const section = drawer().getByRole('button', { name: /^Fernsteuerung/ })
        if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click()
        const port = drawer().getByLabel('Port', { exact: true })
        await port.fill('18089')
        await port.press('Enter')
        const handy = bar().getByRole('button', { name: 'Handy', exact: true })
        await handy.click()
        assert.ok(
          await waitFor(async () => (await handy.getAttribute('aria-pressed')) === 'true', 10_000),
          'Fernsteuerung startet nicht'
        )
        const st = await page.evaluate(() => window.api.jingles.remoteStatus())
        assert.equal(st.port, 18089)
        // Zusammenfassung und Zugang (QR-Code, Adressen) folgen dem Status. Gezeigt wird die
        // Adresse in der Fernsteuer-App, sonst die direkte.
        await drawer().getByText('Port 18089 · an').waitFor({ timeout: 5_000 })
        const shown = st.app?.urls?.[0] ?? st.urls[0]
        await drawer().getByText(shown, { exact: true }).first().waitFor({ timeout: 5_000 })
        await handy.click()
        assert.ok(
          await waitFor(async () => (await handy.getAttribute('aria-pressed')) === 'false', 10_000),
          'Fernsteuerung stoppt nicht'
        )
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
      'Rechner: Fehleingabe ist markiert (aria-invalid) – leere Felder und Zahlen nicht',
      async () => {
        const w = await openSmall('circle-calc')
        const field = (label) => w.getByLabel(label, { exact: true })
        await field('Radius r').fill('abc')
        await expectAttr(field('Radius r'), 'aria-invalid', 'true', 'Radius „abc“')
        // die berechneten Felder bleiben dann leer – leer ist kein Fehler
        assert.equal(await field('Durchmesser d').inputValue(), '')
        assert.equal(await field('Durchmesser d').getAttribute('aria-invalid'), null)
        await field('Radius r').fill('')
        await expectAttr(field('Radius r'), 'aria-invalid', null, 'Radius leer')
        await field('Radius r').fill('2,5')
        await expectAttr(field('Radius r'), 'aria-invalid', null, 'Radius 2,5')
        assert.ok(await waitFor(async () => (await field('Durchmesser d').inputValue()) === '5'))
        await closeToolWindow('circle-calc')
        // eigene Schreibweise: Timecodes liest das Feld mit parseTc (25 fps: Frames 0 bis 24) –
        // das Feld der ersten Karte, die zweite („Dauer“) ist im schmalen Fenster ab Werk zu
        const tc = await openSmall('timecode')
        const tcFeld = tc.getByLabel('Timecode', { exact: true })
        assert.equal(await tcFeld.getAttribute('aria-invalid'), null)
        await tcFeld.fill('01:00:00:25')
        await expectAttr(tcFeld, 'aria-invalid', 'true', 'Timecode „01:00:00:25“')
        await tcFeld.fill('01:00:00:24')
        await expectAttr(tcFeld, 'aria-invalid', null, 'Timecode „01:00:00:24“')
        await closeToolWindow('timecode')
      }
    ],
    [
      'Rechner: lesbar, aber nicht rechenbar ist rot und ergibt nichts – leer rechnet mit der Vorgabe',
      async () => {
        const w = await openSmall('projector-lumen')
        const gain = w.getByLabel('Leinwand-Gain', { exact: true })
        const bedarf = readout(w, 'Lumen-Bedarf')
        assert.match(await bedarf.textContent(), /^3\.600/)
        // Gain 0 rechnete früher still mit 1
        await gain.fill('0')
        await expectAttr(gain, 'aria-invalid', 'true', 'Gain „0“')
        assert.ok(
          await waitFor(async () => (await bedarf.textContent()) === '–'),
          `Lumen-Bedarf bei Gain 0: ${await bedarf.textContent()}`
        )
        // leer rechnet mit 1 und zeigt sie als Platzhalter
        await gain.fill('')
        await expectAttr(gain, 'aria-invalid', null, 'Gain leer')
        assert.equal(await gain.getAttribute('placeholder'), '1')
        assert.ok(await waitFor(async () => /^3\.600/.test(await bedarf.textContent())))
        // die Bewertung (Statusstufen) prüft der Schritt „Beamer-Lumen (K6)“: Ihre Karte ist
        // im 520-px-Fenster ab Werk zu
        await closeToolWindow('projector-lumen')

        // Rigging: negatives Eigengewicht senkte früher die Kräfte; leer zählt es als 0
        const r = await openSmall('rigging')
        const eigen = r.getByLabel('Eigengewicht', { exact: true })
        await eigen.fill('-10')
        await expectAttr(eigen, 'aria-invalid', 'true', 'Eigengewicht „-10“')
        assert.ok(await waitFor(async () => (await readout(r, 'Punkt A').textContent()) === '–'))
        await eigen.fill('')
        assert.equal(await eigen.getAttribute('placeholder'), '0')
        assert.ok(await waitFor(async () => /^75/.test(await readout(r, 'Punkt A').textContent())))
        // die Winkel-Warnung (Vorgabe 45°) als Hinweis mit Titel, ohne „⚠“ im Text
        const warnung = r.getByRole('status').filter({ hasText: 'Flacher Winkel' })
        await warnung.waitFor({ timeout: 5_000 })
        assert.ok(!(await warnung.textContent()).includes('⚠'), await warnung.textContent())
        await closeToolWindow('rigging')
      }
    ],
    [
      'Rechner-Tastaturen: Timecode nur aus Ziffern (paarweise von rechts), Temperatur mit Minus',
      async () => {
        const w = await openSmall('timecode')
        const tc = w.getByLabel('Timecode', { exact: true })
        // Zifferntastatur: Am Handy gibt es dort keinen Doppelpunkt
        assert.equal(await tc.getAttribute('inputmode'), 'numeric')
        await tc.fill('01020312')
        const frames = w.getByLabel('Frames (gesamt)', { exact: true })
        // 25 fps: 3.723 s × 25 + 12
        assert.ok(
          await waitFor(async () => (await frames.inputValue()) === '93087'),
          `Frames bei „01020312“: ${await frames.inputValue()}`
        )
        assert.equal(await tc.getAttribute('aria-invalid'), null)
        // negative Frames sind lesbar, aber nicht rechenbar
        await frames.fill('-5')
        await expectAttr(frames, 'aria-invalid', 'true', 'Frames „-5“')
        // gebrochene ebenso (Befund 18: „1,5“ rechnete früher still mit Frame 2)
        await frames.fill('1,5')
        await expectAttr(frames, 'aria-invalid', 'true', 'Frames „1,5“')
        assert.equal(await tc.inputValue(), '', 'Timecode bei Frames „1,5“')
        await closeToolWindow('timecode')

        const a = await openSmall('audio-delay')
        // volle Tastatur: Die Dezimaltastatur des iPhones hat kein Minus
        const temp = a.getByLabel('Temperatur', { exact: true })
        assert.equal(await temp.getAttribute('inputmode'), 'text')
        await temp.fill('-5')
        await expectAttr(temp, 'aria-invalid', null, 'Temperatur „-5“')
        await closeToolWindow('audio-delay')
      }
    ],
    [
      'DMX-Dip-Schalter: Schalter sagen, ob sie an sind; die Adresse steht nur im Feld',
      async () => {
        const w = await openSmall('dmx-address')
        // Adresse = Summe der eingeschalteten Werte: Vorgabe 1 heißt Schalter 1 an, wie am Gerät
        const s1 = w.getByRole('button', { name: 'Schalter 1, Wert 1', exact: true })
        assert.equal(await s1.getAttribute('aria-pressed'), 'true')
        const s3 = w.getByRole('button', { name: 'Schalter 3, Wert 4', exact: true })
        assert.equal(await s3.getAttribute('aria-pressed'), 'false')
        await s3.click()
        await expectAttr(s3, 'aria-pressed', 'true', 'Schalter 3 umgelegt')
        const adresse = w.getByLabel('Startadresse', { exact: true })
        assert.equal(await adresse.inputValue(), '5')
        // nur noch Schalter 3: Adresse 4; alle aus ist keine Adresse – das Feld bleibt leer
        await s1.click()
        await expectAttr(s1, 'aria-pressed', 'false', 'Schalter 1 ausgeschaltet')
        assert.equal(await adresse.inputValue(), '4')
        await s3.click()
        assert.ok(await waitFor(async () => (await adresse.inputValue()) === ''), 'alle aus')
        // kein zweites Ergebnis „Adresse“ unter den Schaltern
        assert.equal(await w.getByText('Adresse', { exact: true }).count(), 0)
        await closeToolWindow('dmx-address')
      }
    ],
    [
      'Stromlast (Pilot Muster 2): Antwort zuerst, Wahl per Knopfgruppe, zweite Karte zu und gemerkt',
      async () => {
        const id = 'power-load'
        // Kopf einer zuklappbaren Karte: der Knopf, der mit ihrem Titel beginnt (dahinter die
        // Kurzfassung)
        const karte = (w, titel) =>
          w.getByTestId('tool-content').getByRole('button', { name: new RegExp(`^${titel}`) })
        const wahl = (w, gruppe, knopf) =>
          w
            .getByRole('group', { name: gruppe, exact: true })
            .getByRole('button', { name: knopf, exact: true })
        const oben = async (loc) => (await loc.boundingBox()).y
        // die Antwort der Karte „Geräte pro Stromkreis“ steht über ihrem ersten Feld
        const antwortZuerst = async (w) => {
          const antwort = await oben(w.getByText('Max. Geräte', { exact: true }))
          const feld = await oben(w.getByLabel('Leistung je Gerät', { exact: true }))
          assert.ok(antwort < feld, `Antwort bei ${antwort} px, erstes Feld bei ${feld} px`)
        }

        // ab Werk im eigenen Fenster (880 px): Karten nebeneinander, beide offen
        let w = await openSmall(id)
        assert.equal((await winInfo(id)).content[0], 880)
        // zwei zuklappbare Karten (das ⓘ trägt auch aria-expanded, steht aber nicht im Titel)
        const koepfe = w.getByTestId('tool-content').locator('h2 > button[aria-expanded]')
        await expectCount(koepfe, 2, 'zuklappbare Karten')
        await expectAttr(karte(w, 'Last'), 'aria-expanded', 'true', 'Last, breit')
        const geraete = () => karte(w, 'Geräte pro Stromkreis')
        await expectAttr(geraete(), 'aria-expanded', 'true', 'Geräte, breit')
        // keine Liste mehr: Anschluss, Absicherung und Auslastung sind Knopfgruppen
        assert.equal(await w.locator('select').count(), 0, 'noch eine Liste')
        await antwortZuerst(w)

        // eine Spalte wie am Handy: ab Werk nur die erste Karte offen, die zweite zeigt ihre
        // Antwort als Kurzfassung
        await toolWin(id, 'setContentSize', 393, (await winInfo(id)).content[1])
        await closeToolWindow(id)
        w = await openSmall(id)
        assert.equal((await winInfo(id)).content[0], 393)
        await expectAttr(geraete(), 'aria-expanded', 'false', 'Geräte, schmal')
        assert.match(await geraete().textContent(), /7 Geräte je Kreis$/)
        await expectAttr(karte(w, 'Last'), 'aria-expanded', 'true', 'Last, schmal')
        assert.match(await karte(w, 'Last').textContent(), /3\.680 W · 16 A$/)
        await assertFits(w, id)

        // aufklappen: Antwort zuerst; jede Wahl ein Tipp (K7: 500 W an 3∼ 32 A = 42 Geräte)
        await geraete().click()
        await expectAttr(geraete(), 'aria-expanded', 'true', 'Geräte, aufgeklappt')
        await antwortZuerst(w)
        const max = readout(w, 'Max. Geräte')
        assert.equal(await max.textContent(), '7')
        await wahl(w, 'Anschluss', '3∼ 400 V').click()
        await expectAttr(wahl(w, 'Anschluss', '3∼ 400 V'), 'aria-pressed', 'true', '3∼')
        await wahl(w, 'Absicherung', '32 A').click()
        assert.ok(await waitFor(async () => (await max.textContent()) === '42'), 'nicht 42')
        await wahl(w, 'Auslastung', '80 % Dauer').click()
        assert.ok(await waitFor(async () => (await max.textContent()) === '33'), 'nicht 33')
        assert.match(await geraete().textContent(), /33 Geräte je Kreis$/)
        assert.match(await karte(w, 'Last').textContent(), /3∼ · 11\.085 W · 16 A$/)

        // Fenster zu und wieder auf: die aufgeklappte Karte ist noch offen
        await closeToolWindow(id)
        w = await openSmall(id)
        await expectAttr(geraete(), 'aria-expanded', 'true', 'Geräte, wieder geöffnet')
        await assertFits(w, id)
        // Breite wie ab Werk: „alle kleinen Werkzeuge“ erwartet die Karten nebeneinander
        await toolWin(id, 'setContentSize', 880, (await winInfo(id)).content[1])
        await closeToolWindow(id)
      }
    ],
    [
      'Rigging-Last (K6 wie der Pilot): breit beide Karten offen, schmal „Bridle“ zu mit Antwort',
      async () => {
        // ab Werk 880 px, beide Karten offen nebeneinander
        const id = 'rigging'
        let w = await openSmall(id)
        await expectCount(kartenKoepfe(w), 2, `${id}: zuklappbare Karten`)
        const traverse = () => kartenKopf(w, 'Traverse auf zwei Punkten')
        const bridle = () => kartenKopf(w, 'Bridle (2 Stränge)')
        await expectAttr(traverse(), 'aria-expanded', 'true', 'Traverse, breit')
        await expectAttr(bridle(), 'aria-expanded', 'true', 'Bridle, breit')
        await keineKurzeListe(w, id)
        // die Antwort zuerst, die Winkel-Warnung (Vorgabe 45°) direkt darunter
        await antwortZuerst(w, 'Punkt A', 'Spannweite A–B')
        await antwortZuerst(w, 'Kraft je Strang', 'Last')
        const flach = await oberkante(w.getByText('Flacher Winkel', { exact: true }))
        assert.ok(flach > (await oberkante(w.getByText('Kraft je Strang', { exact: true }))))
        assert.ok(flach < (await oberkante(w.getByLabel('Last', { exact: true }))), 'Warnung')

        // eine Spalte wie am Handy: nur die erste Karte offen, die zweite sagt ihre Antwort
        w = await mitBreite(id, 393)
        await expectAttr(bridle(), 'aria-expanded', 'false', 'Bridle, schmal')
        assert.match(await bridle().textContent(), /141 kg je Strang · 45°$/)
        await expectAttr(traverse(), 'aria-expanded', 'true', 'Traverse, schmal')
        assert.match(await traverse().textContent(), /A 115 kg · B 85 kg$/)
        await assertFits(w, id)
        // aufklappen: Antwort zuerst; flacher angeschlagen wird die Warnung rot (63°)
        await bridle().click()
        await expectAttr(bridle(), 'aria-expanded', 'true', 'Bridle, aufgeklappt')
        await antwortZuerst(w, 'Kraft je Strang', 'Last')
        await w.getByLabel('Punktabstand', { exact: true }).fill('8')
        await w.getByText('So nicht anschlagen', { exact: true }).waitFor({ timeout: 5_000 })
        assert.match(await readout(w, 'Kraft je Strang').textContent(), /^223,6/)
        assert.match(await bridle().textContent(), /224 kg je Strang · 63°$/)
        // Fenster zu und wieder auf: die aufgeklappte Karte ist noch offen
        await closeToolWindow(id)
        w = await openSmall(id)
        await expectAttr(bridle(), 'aria-expanded', 'true', 'Bridle, wieder geöffnet')
        await assertFits(w, id)
        // Breite wie ab Werk: „alle kleinen Werkzeuge“ erwartet die Karten nebeneinander
        await toolWin(id, 'setContentSize', 880, (await winInfo(id)).content[1])
        await closeToolWindow(id)
      }
    ],
    [
      'Kameraobjektiv (K6): Telekonverter per Knopf, schmal „Kamera & Objektiv“ zu, Antwort zuerst',
      async () => {
        // „Kamera & Objektiv“ stellt man einmal ein – am Handy zu, mit Sensor und Brennweite als
        // Kurzfassung; die Frage ist „Motiv & Bildausschnitt“
        const id = 'camera-lens'
        let w = await openSmall(id)
        await expectCount(kartenKoepfe(w), 2, `${id}: zuklappbare Karten`)
        const kamera = () => kartenKopf(w, 'Kamera & Objektiv')
        const motiv = () => kartenKopf(w, 'Motiv & Bildausschnitt')
        await expectAttr(kamera(), 'aria-expanded', 'true', 'Kamera, breit')
        await expectAttr(motiv(), 'aria-expanded', 'true', 'Motiv, breit')
        // der Sensor bleibt eine Liste (acht Einträge), der Telekonverter ist eine Knopfgruppe
        await keineKurzeListe(w, id)
        assert.equal(await knopf(w, 'Telekonverter', 'keiner').getAttribute('aria-pressed'), 'true')
        await antwortZuerst(w, 'Totale (ganze Person + Luft)', 'Entfernung zur Person', {
          mitInfo: true
        })

        w = await mitBreite(id, 393)
        await expectAttr(kamera(), 'aria-expanded', 'false', 'Kamera, schmal')
        assert.match(await kamera().textContent(), /Vollformat · 200 mm$/)
        await expectAttr(motiv(), 'aria-expanded', 'true', 'Motiv, schmal')
        assert.match(await motiv().textContent(), /Totale · 100 %$/)
        await assertFits(w, id)
        // ein Tipp auf „2×“: 400 mm, ab dem Knie – beide Kurzfassungen ziehen mit
        await kamera().click()
        await expectAttr(kamera(), 'aria-expanded', 'true', 'Kamera, aufgeklappt')
        await knopf(w, 'Telekonverter', '2×').click()
        await expectAttr(knopf(w, 'Telekonverter', '2×'), 'aria-pressed', 'true', '2×')
        assert.ok(
          await waitFor(async () => /Vollformat · 200 mm · 2×$/.test(await kamera().textContent())),
          await kamera().textContent()
        )
        assert.match(await readout(w, 'Effektive Brennweite').textContent(), /^400/)
        assert.match(await motiv().textContent(), /Amerikanisch · 86 %$/)
        await closeToolWindow(id)
        w = await openSmall(id)
        await expectAttr(kamera(), 'aria-expanded', 'true', 'Kamera, wieder geöffnet')
        await assertFits(w, id)
        await toolWin(id, 'setContentSize', 880, (await winInfo(id)).content[1])
        await closeToolWindow(id)
      }
    ],
    [
      'Timecode-Rechner (K6): Framerate per Knopf, „Dauer“ zu, solange die Karten untereinander stehen',
      async () => {
        // ab Werk ein schmales Fenster (520 px): Die Karten stehen untereinander, „Dauer“ ist
        // zu; erst nebeneinander ist sie ab Werk offen
        const id = 'timecode'
        let w = await openSmall(id)
        assert.equal((await winInfo(id)).content[0], 520)
        await expectCount(kartenKoepfe(w), 2, `${id}: zuklappbare Karten`)
        const umrechnen = () => kartenKopf(w, 'Timecode ↔ Frames ↔ Echtzeit')
        const dauer = () => kartenKopf(w, 'Dauer zwischen zwei Timecodes')
        await expectAttr(umrechnen(), 'aria-expanded', 'true', 'Umrechnen, 520 px')
        await expectAttr(dauer(), 'aria-expanded', 'false', 'Dauer, 520 px')
        assert.match(await dauer().textContent(), /00:05:30:00$/)
        // die zehn Bildraten als Knopfgruppe statt als Liste
        assert.equal(await w.locator('select').count(), 0, `${id}: noch eine Liste`)
        assert.equal(await knopf(w, 'Framerate', '25').getAttribute('aria-pressed'), 'true')
        // breiter gezogen: nebeneinander, die zweite Karte folgt und geht auf
        await toolWin(id, 'setContentSize', 880, (await winInfo(id)).content[1])
        await expectAttr(dauer(), 'aria-expanded', 'true', 'Dauer, 880 px')
        await antwortZuerst(w, 'Dauer (Timecode)', 'Timecode A (In)')

        w = await mitBreite(id, 393)
        await expectAttr(dauer(), 'aria-expanded', 'false', 'Dauer, schmal')
        assert.match(await umrechnen().textContent(), /01:00:00:00 · 25 fps$/)
        await assertFits(w, id)
        await dauer().click()
        await expectAttr(dauer(), 'aria-expanded', 'true', 'Dauer, aufgeklappt')
        await antwortZuerst(w, 'Dauer (Timecode)', 'Timecode A (In)')
        // Drop-Frame per Tipp: Semikolon, 01:00:00;00 sind 107.892 Frames
        await knopf(w, 'Framerate', '29,97 DF').click()
        assert.ok(
          await waitFor(async () =>
            /01:00:00;00 · 29,97 DF$/.test(await umrechnen().textContent())
          ),
          await umrechnen().textContent()
        )
        assert.equal(await w.getByLabel('Frames (gesamt)', { exact: true }).inputValue(), '107892')
        assert.match(await dauer().textContent(), /00:05:30;00$/)
        await closeToolWindow(id)
        w = await openSmall(id)
        await expectAttr(dauer(), 'aria-expanded', 'true', 'Dauer, wieder geöffnet')
        await assertFits(w, id)
        await toolWin(id, 'setContentSize', 520, (await winInfo(id)).content[1])
        await closeToolWindow(id)
      }
    ],
    [
      'Beamer-Lumen (K6): Umgebungslicht per Knopf mit Erklärung, „Vorhandener Beamer“ zu mit Bewertung',
      async () => {
        // ab Werk 520 px: Die Karten stehen untereinander, „Vorhandener Beamer“ ist zu
        const id = 'projector-lumen'
        let w = await openSmall(id)
        assert.equal((await winInfo(id)).content[0], 520)
        await expectCount(kartenKoepfe(w), 2, `${id}: zuklappbare Karten`)
        const projektion = () => kartenKopf(w, 'Projektion')
        const beamer = () => kartenKopf(w, 'Vorhandener Beamer')
        const erklaerung = () => w.getByTestId('umgebungslicht-text')
        await expectAttr(projektion(), 'aria-expanded', 'true', 'Projektion, 520 px')
        await expectAttr(beamer(), 'aria-expanded', 'false', 'Beamer, 520 px')
        assert.match(await projektion().textContent(), /3\.600 lm$/)
        // ohne Beamer keine Bewertung: Die Kurzfassung sagt „–“
        assert.match(await beamer().textContent(), /–$/)
        // Umgebungslicht per Knopf statt Liste, die Erklärung der gewählten Stufe darunter
        assert.equal(await w.locator('select').count(), 0, `${id}: noch eine Liste`)
        assert.equal(
          await knopf(w, 'Umgebungslicht', 'Gedimmt').getAttribute('aria-pressed'),
          'true'
        )
        assert.equal(await erklaerung().textContent(), 'Vortragssaal · Ziel 400 lx')
        await antwortZuerst(w, 'Lumen-Bedarf', 'Bildbreite')
        // breiter gezogen: nebeneinander, die zweite Karte folgt und geht auf
        await toolWin(id, 'setContentSize', 880, (await winInfo(id)).content[1])
        await expectAttr(beamer(), 'aria-expanded', 'true', 'Beamer, 880 px')
        await antwortZuerst(w, 'Bewertung', 'Beamer-Lichtstrom')

        w = await mitBreite(id, 393)
        await expectAttr(beamer(), 'aria-expanded', 'false', 'Beamer, schmal')
        await assertFits(w, id)
        await beamer().click()
        await expectAttr(beamer(), 'aria-expanded', 'true', 'Beamer, aufgeklappt')
        await antwortZuerst(w, 'Bewertung', 'Beamer-Lichtstrom')
        // die Bewertung in den Statusstufen der App, ohne ✓ und ✗ im Text
        await w.getByLabel('Beamer-Lichtstrom', { exact: true }).fill('6500')
        const bewertung = readout(w, 'Bewertung')
        assert.ok(await waitFor(async () => (await bewertung.textContent()) === 'ausreichend'))
        assert.equal(await bewertung.locator('svg').count(), 1)
        assert.match(await beamer().textContent(), /6\.500 lm · ausreichend$/)
        // ein Tipp auf „Tageslicht“: 1.100 lx × 9 m² = 9.900 lm – der Beamer ist zu dunkel
        await knopf(w, 'Umgebungslicht', 'Tageslicht').click()
        await expectAttr(knopf(w, 'Umgebungslicht', 'Tageslicht'), 'aria-pressed', 'true', 'Tag')
        assert.equal(await erklaerung().textContent(), 'Schaufenster, Zelt · Ziel 1.100 lx')
        assert.ok(await waitFor(async () => (await bewertung.textContent()) === 'zu dunkel'))
        assert.match(await readout(w, 'Lumen-Bedarf').textContent(), /^9\.900/)
        assert.match(await beamer().textContent(), /6\.500 lm · zu dunkel$/)
        // Fenster zu und wieder auf: die aufgeklappte Karte ist noch offen
        await closeToolWindow(id)
        w = await openSmall(id)
        await expectAttr(beamer(), 'aria-expanded', 'true', 'Beamer, wieder geöffnet')
        await assertFits(w, id)
        await toolWin(id, 'setContentSize', 520, (await winInfo(id)).content[1])
        await closeToolWindow(id)
      }
    ],
    [
      'Audio-Delay & SPL (K6): „Pegel über Distanz“ zu mit Antwort, offen die Antwort zuerst',
      async () => {
        const id = 'audio-delay'
        let w = await openSmall(id)
        assert.equal((await winInfo(id)).content[0], 520)
        await expectCount(kartenKoepfe(w), 2, `${id}: zuklappbare Karten`)
        const delay = () => kartenKopf(w, 'Delay (Laufzeit)')
        const pegel = () => kartenKopf(w, 'Pegel über Distanz')
        await expectAttr(delay(), 'aria-expanded', 'true', 'Delay, 520 px')
        await expectAttr(pegel(), 'aria-expanded', 'false', 'Pegel, 520 px')
        assert.match(await delay().textContent(), /10 m · 29,1 ms$/)
        assert.match(await pegel().textContent(), /80 dB in 10 m$/)
        await toolWin(id, 'setContentSize', 880, (await winInfo(id)).content[1])
        await expectAttr(pegel(), 'aria-expanded', 'true', 'Pegel, 880 px')
        await antwortZuerst(w, 'Pegel in Ziel-Distanz', 'Pegel (Referenz)')

        w = await mitBreite(id, 393)
        await expectAttr(pegel(), 'aria-expanded', 'false', 'Pegel, schmal')
        await assertFits(w, id)
        await pegel().click()
        await expectAttr(pegel(), 'aria-expanded', 'true', 'Pegel, aufgeklappt')
        await antwortZuerst(w, 'Pegel in Ziel-Distanz', 'Pegel (Referenz)')
        // doppelte Entfernung, 6 dB weniger
        await w.getByLabel('Ziel-Distanz', { exact: true }).fill('20')
        assert.ok(
          await waitFor(async () => /74 dB in 20 m$/.test(await pegel().textContent())),
          await pegel().textContent()
        )
        assert.match(await readout(w, 'Pegel in Ziel-Distanz').textContent(), /^74/)
        await closeToolWindow(id)
        w = await openSmall(id)
        await expectAttr(pegel(), 'aria-expanded', 'true', 'Pegel, wieder geöffnet')
        await assertFits(w, id)
        await toolWin(id, 'setContentSize', 520, (await winInfo(id)).content[1])
        await closeToolWindow(id)
      }
    ],
    [
      'Projektionsverhältnis (K6): Seitenverhältnis per Knopf, „Objektiv & Abstand“ zu, solange die Karten untereinander stehen',
      async () => {
        // ab Werk 520 px: Die Karten stehen untereinander, „Objektiv & Abstand“ ist zu und sagt
        // seine Werte (zuklappbar wie alle Rechner, entschieden am 26. November 2026)
        const id = 'throw-ratio'
        let w = await openSmall(id)
        assert.equal((await winInfo(id)).content[0], 520)
        await expectCount(kartenKoepfe(w), 2, `${id}: zuklappbare Karten`)
        const leinwand = () => kartenKopf(w, 'Leinwand')
        const objektiv = () => kartenKopf(w, 'Objektiv & Abstand')
        await expectAttr(leinwand(), 'aria-expanded', 'true', 'Leinwand, 520 px')
        await expectAttr(objektiv(), 'aria-expanded', 'false', 'Objektiv, 520 px')
        assert.match(await objektiv().textContent(), /TR 1,6 · 8 m$/)
        assert.match(await leinwand().textContent(), /16 : 9 · 5 × 2,81 m$/)
        assert.equal(await w.locator('select').count(), 0, `${id}: noch eine Liste`)
        const seiten = (name) => knopf(w, 'Seitenverhältnis', name)
        assert.equal(await seiten('16 : 9').getAttribute('aria-pressed'), 'true')
        // „(Cinemascope)“ steht hinter dem ⓘ, der Knopf bleibt kurz
        assert.equal(await seiten('2,35 : 1').count(), 1)
        // breiter gezogen: nebeneinander, die zweite Karte folgt und geht auf
        await toolWin(id, 'setContentSize', 880, (await winInfo(id)).content[1])
        await expectAttr(objektiv(), 'aria-expanded', 'true', 'Objektiv, 880 px')

        // so schmal wie das Handy: wieder zu, aufgeklappt bleibt sie nach Schließen und Öffnen offen
        w = await mitBreite(id, 393)
        await expectAttr(objektiv(), 'aria-expanded', 'false', 'Objektiv, schmal')
        await assertFits(w, id)
        await objektiv().click()
        await expectAttr(objektiv(), 'aria-expanded', 'true', 'Objektiv, aufgeklappt')
        // ein Tipp auf 4 : 3: 5 m breit -> 3,75 m hoch; die Kurzfassung der Leinwand zieht mit
        await seiten('4 : 3').click()
        await expectAttr(seiten('4 : 3'), 'aria-pressed', 'true', '4 : 3')
        const hoehe = w.getByLabel('Bildhöhe', { exact: true })
        assert.ok(await waitFor(async () => (await hoehe.inputValue()) === '3,75'), 'Bildhöhe')
        assert.match(await leinwand().textContent(), /4 : 3 · 5 × 3,75 m$/)
        await closeToolWindow(id)
        w = await openSmall(id)
        await expectAttr(objektiv(), 'aria-expanded', 'true', 'Objektiv, wieder geöffnet')
        // so schmal wie das schmalste Fenster: zwei Reihen zu je drei Knöpfen
        await toolWin(id, 'setContentSize', 320, (await winInfo(id)).content[1])
        const reihen = async () =>
          w
            .getByRole('group', { name: 'Seitenverhältnis', exact: true })
            .evaluate((g) => [...g.children].map((r) => r.children.length))
        assert.ok(
          await waitFor(async () => JSON.stringify(await reihen()) === '[3,3]'),
          `Reihen bei 320 px: ${JSON.stringify(await reihen())}`
        )
        await assertFits(w, id)
        await toolWin(id, 'setContentSize', 520, (await winInfo(id)).content[1])
        await closeToolWindow(id)
      }
    ],
    [
      'RTA (K6): Einstellungen in den Karten per Knopf statt Liste – nur „Eingang“ bleibt eine Liste',
      async () => {
        const id = 'rta'
        const w = await openSmall(id)
        // die Karten unter dem Spektrum aufklappen (ab Werk zu; der Zustand bleibt gemerkt)
        for (const titel of ['Feedback-Finder', 'Eingang & Kalibrierung', 'Anzeige']) {
          const kopf = kartenKopf(w, titel)
          if ((await kopf.getAttribute('aria-expanded')) !== 'true') await kopf.click()
          await expectAttr(kopf, 'aria-expanded', 'true', titel)
        }
        // nur der Eingang ist eine Liste: Geräte gibt es beliebig viele, mit langen Namen
        const listen = await w
          .locator('select')
          .evaluateAll((els) => els.map((e) => e.labels?.[0]?.textContent ?? '?'))
        assert.deepEqual(listen, ['Eingang'], `Listen: ${listen}`)
        const gruppen = ['Empfindlichkeit', 'Kanal', 'Kalibrator', 'Mittelung', 'Spitzen']
        gruppen.push('Pegelmesser', 'Skala', 'Farbe', 'Spektrogramm')
        for (const g of gruppen) {
          await expectCount(w.getByRole('group', { name: g, exact: true }), 1, `Knopfgruppe ${g}`)
        }
        assert.equal(await knopf(w, 'Kalibrator', '94 dB').getAttribute('aria-pressed'), 'true')
        // ein Tipp, und die Kurzfassung der Karte zieht mit
        const anzeige = () => kartenKopf(w, 'Anzeige')
        await knopf(w, 'Mittelung', 'Langsam').click()
        assert.ok(
          await waitFor(async () => /Mittelung langsam$/.test(await anzeige().textContent())),
          await anzeige().textContent()
        )
        await knopf(w, 'Mittelung', 'Schnell').click()
        await expectAttr(knopf(w, 'Mittelung', 'Schnell'), 'aria-pressed', 'true', 'zurück')
        // vier Knöpfe: im breiten Fenster eine Reihe, bei 320 px zwei – nichts ragt heraus
        const reihen = async () =>
          w
            .getByRole('group', { name: 'Mittelung', exact: true })
            .evaluate((g) => [...g.children].map((r) => r.children.length))
        assert.deepEqual(await reihen(), [4])
        await toolWin(id, 'setContentSize', 320, (await winInfo(id)).content[1])
        assert.ok(
          await waitFor(async () => JSON.stringify(await reihen()) === '[2,2]'),
          `Reihen bei 320 px: ${JSON.stringify(await reihen())}`
        )
        await toolWin(id, 'setContentSize', 880, (await winInfo(id)).content[1])
        await closeToolWindow(id)
      }
    ],
    [
      'alle kleinen Werkzeuge: Höhe folgt dem Inhalt, zweispaltig wo vorgesehen, bis 320 px schmal',
      async () => {
        for (const id of SMALL) {
          const w = await openSmall(id)
          await assertFits(w, id)
          assertNoJump(id)
          // ab Werk ist kein Feld als Fehleingabe markiert (auch kein Timecode)
          const rot = await w.locator('[aria-invalid="true"]').count()
          assert.equal(rot, 0, `${id}: ${rot} Feld(er) ab Werk als Fehleingabe markiert`)
          if (TWO_COLUMNS.includes(id)) {
            const tops = await w
              .getByTestId('tool-content')
              .locator('h2')
              .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
            // die ersten beiden Karten nebeneinander (der RTA hat vier unter dem Spektrum)
            assert.ok(tops.length >= 2, id)
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
