// ATEM-Steuerung in der gebauten App. Zwei Wege: der Probebetrieb für die Oberfläche, und der
// Schein-Mischer (atemFake.mjs) für den echten Weg über atem-connection, UDP und den Socket-Thread.
// Am Schein-Mischer lässt sich steuern, wann er antwortet: Nur so zeigt sich, dass ein Knopf erst
// nach der Rückmeldung leuchtet, dass fremde Änderungen erscheinen und ein Verlust auffällt.

import assert from 'node:assert/strict'
import { startAtemFake } from './atemFake.mjs'
import { join } from 'node:path'
import { launchApp, openRoute, root, runSteps, sleep, Skip, waitFor } from './harness.mjs'

/** Absolut: In der Entwicklungs-App gehört process.mainModule zu Electron, nicht zum Projekt */
const THREADS = join(root, 'node_modules', 'threadedclass', 'dist', 'parent-process', 'manager.js')

const ctx = await launchApp()
const { app, page } = ctx
const proc = app.process()
const mischer = await startAtemFake()

const knopf = (bus, id) => page.getByTestId(`atem-${bus}-${id}`)
const bar = () => page.getByTestId('tool-bar')
const aufTrennen = () => bar().getByRole('button', { name: 'Trennen' })
const hebel = () => page.getByTestId('atem-hebel')
const hebelWert = async () => Number(await hebel().getAttribute('aria-valuenow'))
const empfangen = (name) => mischer.empfangen.filter((c) => c.name === name)

async function zeigt(bus, id, zustand = 'an') {
  const ok = await waitFor(
    async () => (await knopf(bus, id).getAttribute('data-zustand')) === zustand
  )
  assert.ok(
    ok,
    `${bus} ${id} ist nicht ${zustand}: ${await knopf(bus, id).getAttribute('data-zustand')}`
  )
}

/** Knopf mit Rückmeldung (Keyer, Makro …): Zustand nach `data-zustand` */
async function schaltet(testId, zustand = 'an') {
  const k = page.getByTestId(testId)
  const ok = await waitFor(async () => (await k.getAttribute('data-zustand')) === zustand)
  assert.ok(ok, `${testId} ist nicht ${zustand}: ${await k.getAttribute('data-zustand')}`)
}

async function reiter(name) {
  await page.getByRole('tab', { name, exact: true }).click()
  assert.ok(
    await waitFor(
      async () =>
        (await page.getByRole('tab', { name, exact: true }).getAttribute('aria-selected')) ===
        'true'
    )
  )
}

/** Auswahlliste zeigt den gemeldeten Stand: warten, bis er ankommt */
async function waehlt(label, wert) {
  const feld = page.getByLabel(label, { exact: true })
  await feld.selectOption(wert)
  assert.ok(await waitFor(async () => (await feld.inputValue()) === wert), `${label} bleibt`)
}

/**
 * Hebel mit der Maus ziehen, `bis` als Weg ab der Ruhelage: 0 Ruhelage, 1 anderes Ende. Die
 * Ruhelage wechselt nach jedem fertigen Übergang, auch nach Auto.
 */
async function ziehe(bis, schritte = 12) {
  await hebel().scrollIntoViewIfNeeded()
  const box = await hebel().boundingBox()
  assert.ok(box)
  const oben = (await hebel().getAttribute('data-oben')) === 'true'
  const x = box.x + box.width / 2
  const y = (weg) => box.y + box.height * (oben ? weg : 1 - weg)
  await page.mouse.move(x, y(0.05))
  await page.mouse.down()
  const nach = (weg, s) => page.mouse.move(x, y(weg), { steps: s })
  await nach(bis, schritte)
  return { nach, los: () => page.mouse.up() }
}

/** Ein Modell des Probebetriebs starten, eine laufende Verbindung vorher trennen */
async function probebetrieb(modell) {
  if (await aufTrennen().count()) {
    await aufTrennen().click()
    await bar().getByRole('button', { name: 'Probebetrieb' }).waitFor()
  }
  await page.getByTestId('settings-drawer').locator('select').selectOption(modell)
  await bar().getByRole('button', { name: 'Probebetrieb' }).click()
  await knopf('programm', 1).waitFor()
}

try {
  await runSteps('ATEM-Steuerung', [
    [
      'startet getrennt: Probebetrieb da, Verbinden ohne Adresse gesperrt',
      async () => {
        await openRoute(page, '/tool/atem-control')
        await bar().getByRole('button', { name: 'Probebetrieb' }).waitFor()
        assert.match(await bar().textContent(), /getrennt/)
        assert.equal(await bar().getByRole('button', { name: 'Verbinden' }).isDisabled(), true)
        assert.equal(await knopf('programm', 1).count(), 0)
      }
    ],
    [
      'Probebetrieb: Reihen kommen aus dem Modell, Programm rot, Vorschau grün',
      async () => {
        await probebetrieb('mini-extreme')
        assert.match(await bar().textContent(), /ATEM Mini Extreme · Probebetrieb/)
        assert.equal(await knopf('programm', 8).count(), 1)
        await zeigt('programm', 1)
        await zeigt('vorschau', 2)
        const farbe = await knopf('programm', 1).evaluate(
          (e) => getComputedStyle(e).backgroundColor
        )
        const aus = await knopf('programm', 2).evaluate((e) => getComputedStyle(e).backgroundColor)
        assert.notEqual(farbe, aus)
      }
    ],
    [
      'Vorschau wählen, Cut tauscht, Auto läuft und endet',
      async () => {
        await knopf('vorschau', 3).click()
        await zeigt('vorschau', 3)
        await page.getByTestId('atem-cut').click()
        await zeigt('programm', 3)
        await zeigt('vorschau', 1)
        // 2 s statt 1 s: Der Klick allein dauert auf dem macOS-Runner spürbar
        await page.evaluate(() =>
          window.api.atem.command({ type: 'rate', me: 0, stil: 'mix', rate: 50 })
        )
        await page.getByTestId('atem-auto').click()
        assert.ok(
          await waitFor(
            async () =>
              (await page.getByTestId('atem-auto').getAttribute('data-laeuft')) === 'true',
            5000,
            20
          ),
          'Auto läuft nicht'
        )
        await zeigt('programm', 1)
        await zeigt('vorschau', 3)
        assert.ok(
          await waitFor(
            async () =>
              (await page.getByTestId('atem-auto').getAttribute('data-laeuft')) === 'false'
          )
        )
        await page.evaluate(() =>
          window.api.atem.command({ type: 'rate', me: 0, stil: 'mix', rate: 25 })
        )
      }
    ],
    [
      'Kleines Fenster mit Schublade: Übergang und Felder liegen nicht übereinander',
      async () => {
        // Auf dem kleinen Bildschirm der CI lag das Dauer-Feld über den Stil-Knöpfen, lokal und
        // unter Linux (1920 × 1080) fiel das nicht auf
        const [breite, hoehe] = await page.evaluate(() => [innerWidth, innerHeight])
        await page.setViewportSize({ width: 1024, height: 700 })
        try {
          const stil = page.getByRole('group', { name: 'Übergang' })
          const felder = ['Dauer in Bildern', 'FTB in Bildern'].map((n) => page.getByLabel(n))
          const a = await stil.boundingBox()
          for (const feld of felder) {
            const b = await feld.boundingBox()
            const getrennt =
              a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y
            assert.ok(getrennt, `überlappt: ${JSON.stringify({ a, b })}`)
          }
          for (const knopf of await stil.getByRole('button').all()) {
            await knopf.click({ trial: true, timeout: 5000 })
          }
        } finally {
          await page.setViewportSize({ width: breite, height: hoehe })
        }
      }
    ],
    [
      'Übergang: Stil und Dauer, Sekunden zur Bildrate',
      async () => {
        const stil = page.getByRole('group', { name: 'Übergang' })
        await stil.getByRole('button', { name: 'Wipe' }).click()
        assert.ok(
          await waitFor(
            async () =>
              (await stil.getByRole('button', { name: 'Wipe' }).getAttribute('aria-pressed')) ===
              'true'
          )
        )
        const dauer = page.getByLabel('Dauer in Bildern')
        // Extreme im Probebetrieb: 1080p50, 25 je Sekunde am Zähler sind 50 echte Bilder
        assert.equal(await dauer.inputValue(), '50')
        assert.match(await page.textContent('fieldset'), /1,00 s/)
        await dauer.fill('100')
        await dauer.press('Tab')
        assert.ok(await waitFor(async () => /2,00 s/.test(await page.textContent('fieldset'))))
        // Der Mischer zählt in Schritten von zwei Bildern: Ungerades rundet das Feld selbst
        await dauer.fill('49')
        await dauer.press('Tab')
        assert.equal(await dauer.inputValue(), '50')
        assert.ok(await waitFor(async () => /1,00 s/.test(await page.textContent('fieldset'))))
        await stil.getByRole('button', { name: 'Mix' }).click()
      }
    ],
    [
      'Fade to Black verlangt den zweiten Klick und blendet zurück',
      async () => {
        const ftb = page.getByTestId('atem-ftb')
        await ftb.click()
        assert.equal(await ftb.getAttribute('data-scharf'), 'true')
        await sleep(200)
        assert.equal(await ftb.getAttribute('data-schwarz'), 'false')
        await ftb.click()
        assert.ok(
          await waitFor(async () => (await ftb.getAttribute('data-schwarz')) === 'true'),
          'Mischer wird nicht schwarz'
        )
        await ftb.click()
        await ftb.click()
        assert.ok(await waitFor(async () => (await ftb.getAttribute('data-schwarz')) === 'false'))
      }
    ],
    [
      'Hebel: Mitte läuft, Ende tauscht und dreht die Ruhelage, zurückziehen dreht nichts',
      async () => {
        await zeigt('programm', 1)
        const griff = page.getByTestId('atem-hebel-griff')
        const lage = async () => Number.parseFloat(await griff.evaluate((e) => e.style.top))

        const halb = await ziehe(0.5)
        const obenStart = await hebel().getAttribute('data-oben')
        assert.ok(
          await waitFor(async () => Number(await hebel().getAttribute('aria-valuenow')) > 3000),
          'Mischer meldet den Hebel nicht'
        )
        assert.equal(await knopf('programm', 1).getAttribute('data-zustand'), 'an')
        await halb.nach(-0.1, 8)
        await halb.los()
        assert.ok(await waitFor(async () => (await hebel().getAttribute('aria-valuenow')) === '0'))
        assert.equal(await hebel().getAttribute('data-oben'), obenStart)
        assert.equal(await knopf('programm', 1).getAttribute('data-zustand'), 'an')

        const ganz = await ziehe(1.1, 25)
        await ganz.los()
        await zeigt('programm', 3)
        assert.ok(
          await waitFor(async () => (await hebel().getAttribute('data-oben')) !== obenStart),
          'Ruhelage nicht gedreht'
        )
        // Griff steht jetzt am anderen Ende: oben heißt top 0, unten die Spur minus Griff
        const erwartet = obenStart === 'true' ? 168 : 0
        assert.ok(Math.abs((await lage()) - erwartet) < 2, `Griff steht bei ${await lage()}`)

        // Zurück geht es wieder von 0 bis zum Ende
        const zurueck = await ziehe(1.1, 25)
        await zurueck.los()
        await zeigt('programm', 1)
        assert.equal(await hebel().getAttribute('data-oben'), obenStart)
      }
    ],
    [
      'Hebel: am Ende ohne Absetzen zurück, jede Richtung ein eigener Übergang',
      async () => {
        const oben = await hebel().getAttribute('data-oben')
        const zug = await ziehe(1.1, 25)
        await zeigt('programm', 3)
        assert.ok(
          await waitFor(async () => (await hebel().getAttribute('data-oben')) !== oben),
          'Ruhelage nicht gedreht'
        )
        // Zittern am Ende schiebt nichts an
        await zug.nach(0.87, 3)
        await sleep(150)
        assert.equal(await hebelWert(), 0)
        // Griff unten geblieben: zurück bis zur Mitte, das Bild steht noch
        await zug.nach(0.5, 10)
        assert.ok(await waitFor(async () => (await hebelWert()) > 3000), 'zurück läuft nicht')
        assert.equal(await knopf('programm', 3).getAttribute('data-zustand'), 'an')
        // Der Griff bleibt unter der Maus: ein Stück weiter nach Hause, dann ganz durch
        await zug.nach(1.1, 10)
        assert.ok(await waitFor(async () => (await hebelWert()) === 0))
        await zug.nach(-0.1, 25)
        await zeigt('programm', 1)
        assert.ok(
          await waitFor(async () => (await hebel().getAttribute('data-oben')) === oben),
          'Ruhelage nach dem Rückweg nicht gedreht'
        )
        await zug.nach(1.1, 25)
        await zeigt('programm', 3)
        await zug.nach(-0.1, 25)
        await zeigt('programm', 1)
        await zug.los()
      }
    ],
    [
      'Hebel mit Schwung: Ein Sprung ans Ende dreht die Ruhelage, zurück geht es trotzdem',
      async () => {
        const oben = await hebel().getAttribute('data-oben')
        const zug = await ziehe(1.1, 1)
        await zeigt('programm', 3)
        assert.ok(
          await waitFor(async () => (await hebel().getAttribute('data-oben')) !== oben),
          'Ruhelage nicht gedreht'
        )
        await zug.nach(-0.1, 1)
        await zeigt('programm', 1)
        await zug.los()
      }
    ],
    [
      'Hebel verfehlt: Nichts wird markiert, der nächste Griff bleibt nicht hängen',
      async () => {
        await page.evaluate(() => {
          window.__hebelAbbruch = 0
          document.addEventListener('pointercancel', () => window.__hebelAbbruch++, true)
        })
        await hebel().scrollIntoViewIfNeeded()
        const box = await hebel().boundingBox()
        const auto = await page.getByTestId('atem-auto').boundingBox()
        await page.mouse.move(box.x - 12, box.y + 80)
        await page.mouse.down()
        await page.mouse.move(auto.x + 10, auto.y - 30, { steps: 10 })
        await page.mouse.up()
        assert.equal(await page.evaluate(() => getSelection().toString()), '')

        const zug = await ziehe(0.7)
        assert.ok(await waitFor(async () => (await hebelWert()) > 5000), 'Griff hängt')
        await zug.nach(-0.1, 8)
        await zug.los()
        assert.ok(await waitFor(async () => (await hebelWert()) === 0))
        assert.equal(await page.evaluate(() => window.__hebelAbbruch), 0)
      }
    ],
    [
      'Hebel in einer Textauswahl: Gezogen wird der Griff, nicht der Text',
      async () => {
        await page.evaluate(() => getSelection().selectAllChildren(document.body))
        assert.notEqual(await page.evaluate(() => getSelection().toString()), '')
        const zug = await ziehe(0.7)
        assert.ok(await waitFor(async () => (await hebelWert()) > 5000), 'Griff hängt')
        await zug.nach(-0.1, 8)
        await zug.los()
        assert.ok(await waitFor(async () => (await hebelWert()) === 0))
        assert.equal(await page.evaluate(() => window.__hebelAbbruch), 0)
      }
    ],
    [
      'Tastatur: Ziffern, Umschalt, Leertaste, Eingabe; nie im Textfeld',
      async () => {
        await page.keyboard.press('4')
        await zeigt('vorschau', 4)
        await page.keyboard.press('Shift+Digit5')
        await zeigt('programm', 5)
        await page.keyboard.press('Space')
        await zeigt('programm', 4)
        await zeigt('vorschau', 5)
        await page.keyboard.press('Enter')
        await zeigt('programm', 5)
        const feld = page.getByLabel('FTB in Bildern')
        await feld.focus()
        await page.keyboard.press('6')
        await sleep(200)
        await zeigt('vorschau', 4)
        await feld.press('Escape')
        await feld.evaluate((e) => e.blur())
        // Ein angeklickter Knopf behält den Fokus nicht: Die Leertaste bleibt Cut
        await knopf('vorschau', 2).click()
        await zeigt('vorschau', 2)
        await page.keyboard.press('Space')
        await zeigt('programm', 2)
        await zeigt('vorschau', 5)
      }
    ],
    [
      'Sperre nimmt Maus und Tastatur aus der Bedienung',
      async () => {
        await bar().getByRole('button', { name: 'Sperre' }).click()
        await page.getByText('Gesperrt').first().waitFor()
        assert.equal(await knopf('programm', 7).isDisabled(), true)
        assert.equal(await page.getByTestId('atem-cut').isDisabled(), true)
        assert.equal(await hebel().getAttribute('aria-disabled'), 'true')
        await page.keyboard.press('7')
        await page.keyboard.press('Space')
        await sleep(200)
        await zeigt('programm', 2)
        await zeigt('vorschau', 5)
        // Die Leertaste hat auch die Sperre selbst nicht angerührt
        assert.equal(
          await bar().getByRole('button', { name: 'Sperre' }).getAttribute('aria-pressed'),
          'true'
        )
        await bar().getByRole('button', { name: 'Sperre' }).click()
        await page.keyboard.press('7')
        await zeigt('vorschau', 7)
      }
    ],
    [
      'Tasten: Key und DSK schalten sofort, der nächste Übergang nimmt die Auswahl mit',
      async () => {
        await page.getByTestId('atem-usk-taste-0').click()
        await schaltet('atem-usk-taste-0')
        await page.getByTestId('atem-usk-taste-0').click()
        await schaltet('atem-usk-taste-0', 'aus')
        await page.getByTestId('atem-dsk-taste-1').click()
        await schaltet('atem-dsk-taste-1')
        await page.getByTestId('atem-dsk-taste-1').click()
        await schaltet('atem-dsk-taste-1', 'aus')

        const programm = await page
          .locator('[data-testid^="atem-programm-"][data-zustand="an"]')
          .getAttribute('data-testid')
        await page.getByTestId('atem-naechster-0').click()
        await schaltet('atem-naechster-0')
        await page.getByTestId('atem-naechster-hintergrund').click()
        await schaltet('atem-naechster-hintergrund', 'aus')
        await page.getByTestId('atem-cut').click()
        await schaltet('atem-usk-taste-0')
        await schaltet(programm)
        await page.getByTestId('atem-naechster-hintergrund').click()
        await schaltet('atem-naechster-hintergrund')
        await page.getByTestId('atem-naechster-0').click()
        await schaltet('atem-naechster-0', 'aus')
        await page.getByTestId('atem-usk-taste-0').click()
        await schaltet('atem-usk-taste-0', 'aus')

        // Einer muss bleiben: Der letzte Teil lässt sich nicht abwählen
        await page.getByTestId('atem-naechster-hintergrund').click()
        await sleep(1700)
        await schaltet('atem-naechster-hintergrund')
      }
    ],
    [
      'Makros: Start in der Reihe, Ende vom Mischer, Pause mit Weiter, Stopp',
      async () => {
        await page.getByTestId('atem-makro-0').click()
        await schaltet('atem-makro-0')
        await schaltet('atem-makro-0', 'aus')
        await reiter('Makros')
        await page.getByTestId('atem-makro-3').click()
        await schaltet('atem-makro-3')
        await page.getByTestId('atem-makro-weiter').click()
        await schaltet('atem-makro-3', 'aus')
        assert.equal(await page.getByTestId('atem-makro-weiter').count(), 0)
        await page.getByTestId('atem-makro-3').click()
        await schaltet('atem-makro-3')
        await page.getByTestId('atem-makro-stopp').click()
        await schaltet('atem-makro-3', 'aus')
      }
    ],
    [
      'Seite Keyer: Quellen, Auto mit Dauer, Verknüpfung, und die Sperre gilt auch hier',
      async () => {
        await reiter('Keyer')
        await waehlt('Key 2 Fill', '3')
        await waehlt('Key 2 Cut', '4')
        await waehlt('DSK 1 Fill', '5')
        await page.getByLabel('DSK 1 Dauer in Bildern').fill('50')
        await page.getByLabel('DSK 1 Dauer in Bildern').press('Tab')
        const dsk = page.getByTestId('atem-dsk-auto-0')
        await dsk.click()
        assert.ok(
          await waitFor(async () => (await dsk.getAttribute('data-laeuft')) === 'true', 5000, 20),
          'Auto läuft nicht'
        )
        await schaltet('atem-dsk-0')
        await page.getByTestId('atem-dsk-0').click()
        await schaltet('atem-dsk-0', 'aus')
        await page.getByTestId('atem-dsk-tie-0').click()
        await schaltet('atem-dsk-tie-0')
        await page.getByTestId('atem-dsk-tie-0').click()
        await schaltet('atem-dsk-tie-0', 'aus')

        await bar().getByRole('button', { name: 'Sperre' }).click()
        await page.getByText('Gesperrt').first().waitFor()
        assert.equal(await page.getByLabel('Key 2 Fill', { exact: true }).isDisabled(), true)
        assert.equal(await page.getByTestId('atem-usk-0').isDisabled(), true)
        await bar().getByRole('button', { name: 'Sperre' }).click()
        await reiter('Medien')
        assert.equal(await page.getByRole('group', { name: 'Media-Player 1 Art' }).count(), 0)
        await waehlt('Media-Player 2 Inhalt', '1')
        assert.equal(await page.getByTestId('atem-clip-spielen-1').count(), 0)
        await reiter('AUX')
        await waehlt('AUX 2', '5')
        await reiter('Mischen')
      }
    ],
    [
      'Kleines Modell: weniger Quellen und Tasten, keine M/E-Auswahl',
      async () => {
        await probebetrieb('mini')
        assert.match(await bar().textContent(), /ATEM Mini · Probebetrieb/)
        assert.equal(await knopf('programm', 4).count(), 1)
        assert.equal(await knopf('programm', 5).count(), 0)
        assert.equal(await page.getByRole('group', { name: 'M/E' }).count(), 0)
        assert.equal(await page.getByTestId('atem-usk-taste-0').count(), 1)
        assert.equal(await page.getByTestId('atem-usk-taste-1').count(), 0)
        assert.equal(await page.getByTestId('atem-dsk-taste-1').count(), 0)
        // 1080p25: Hier zählt der Mischer jedes Bild, anders als bei 50p
        assert.equal(await page.getByLabel('Dauer in Bildern').inputValue(), '25')
        assert.match(await page.textContent('fieldset'), /1,00 s/)
      }
    ],
    [
      'Großes Modell: 40 Eingänge, vier M/Es mit eigenem Stand, Stinger ohne Dauer',
      async () => {
        await probebetrieb('constellation')
        assert.equal(await knopf('programm', 40).count(), 1)
        const me = page.getByRole('group', { name: 'M/E' })
        assert.equal(await me.getByRole('button').count(), 4)
        await me.getByRole('button', { name: 'M/E 3' }).click()
        await knopf('programm', 9).click()
        await zeigt('programm', 9)
        // Die Wahl bleibt, wenn das Werkzeug zugeht (der Codec las sie einmal nie zurück)
        await openRoute(page, '/')
        await bar().waitFor({ state: 'detached' })
        await openRoute(page, '/tool/atem-control')
        await zeigt('programm', 9)
        assert.equal(
          await me.getByRole('button', { name: 'M/E 3' }).getAttribute('aria-pressed'),
          'true'
        )
        await me.getByRole('button', { name: 'M/E 1' }).click()
        await zeigt('programm', 1)
        // Clips gibt es nur auf großen Mischern
        await reiter('Medien')
        await page
          .getByRole('group', { name: 'Media-Player 1 Art' })
          .getByRole('button', { name: 'Clip' })
          .click()
        await page.getByTestId('atem-clip-spielen-0').click()
        await schaltet('atem-clip-spielen-0')
        await page.getByTestId('atem-clip-schleife-0').click()
        await schaltet('atem-clip-schleife-0')
        await page.getByTestId('atem-clip-anfang-0').click()
        await schaltet('atem-clip-spielen-0', 'aus')
        await reiter('Mischen')
        const stil = page.getByRole('group', { name: 'Übergang' })
        await stil.getByRole('button', { name: 'Stinger' }).click()
        assert.ok(
          await waitFor(async () => (await page.getByLabel('Dauer in Bildern').count()) === 0)
        )
      }
    ],
    [
      'Echter Weg: Verbinden über die Adresse, Quellen aus der Meldung des Mischers',
      async () => {
        await aufTrennen().click()
        await bar().getByLabel('Adresse des Mischers').fill(mischer.host)
        await bar().getByLabel('Adresse des Mischers').press('Tab')
        await bar().getByRole('button', { name: 'Verbinden' }).click()
        await knopf('programm', 8).waitFor()
        assert.match(await bar().textContent(), /ATEM Mini Extreme · 127\.0\.0\.1/)
        await zeigt('programm', 1)
        assert.equal(await page.locator('[data-testid="atem-programm-9001"]').count(), 0)
        assert.equal(await page.getByText('Unbekannte Mischer-Firmware').count(), 0)
        const s = await page.evaluate(() => window.api.getSettings())
        assert.equal(s.atem.host, mischer.host)
        assert.equal(mischer.anmeldungen, 1)
      }
    ],
    [
      'Knopf leuchtet erst nach der Rückmeldung, bis dahin „läuft“',
      async () => {
        mischer.halteZurueck()
        await knopf('programm', 5).click()
        await zeigt('programm', 5, 'laeuft')
        assert.ok(await waitFor(async () => empfangen('CPgI').some((c) => c.quelle === 5)))
        assert.equal(await knopf('programm', 1).getAttribute('data-zustand'), 'an')
        mischer.freigeben()
        await zeigt('programm', 5)
        assert.equal(await knopf('programm', 1).getAttribute('data-zustand'), 'aus')
      }
    ],
    [
      'Antwortet der Mischer nicht, geht „läuft“ wieder aus und nichts leuchtet falsch',
      async () => {
        mischer.halteZurueck()
        await knopf('programm', 6).click()
        await zeigt('programm', 6, 'laeuft')
        await zeigt('programm', 6, 'aus')
        await zeigt('programm', 5)
        mischer.freigeben()
        await zeigt('programm', 6)
      }
    ],
    [
      'Änderung am Hardware-Panel erscheint in der App',
      async () => {
        mischer.fremdesProgramm(7)
        await zeigt('programm', 7)
      }
    ],
    [
      'Befehle erreichen den Mischer im richtigen Format',
      async () => {
        await knopf('vorschau', 4).click()
        await zeigt('vorschau', 4)
        await page.getByTestId('atem-cut').click()
        await zeigt('programm', 4)
        await page.getByTestId('atem-auto').click()
        await zeigt('programm', 7)
        const dip = page
          .getByRole('group', { name: 'Übergang' })
          .getByRole('button', { name: 'Dip' })
        await dip.click()
        // Das Feld gehört zum Stil, den der Mischer gemeldet hat: vorher wäre es noch Mix
        assert.ok(await waitFor(async () => (await dip.getAttribute('aria-pressed')) === 'true'))
        await page.getByLabel('Dauer in Bildern').fill('60')
        await page.getByLabel('Dauer in Bildern').press('Tab')
        await page.getByLabel('FTB in Bildern').fill('40')
        await page.getByLabel('FTB in Bildern').press('Tab')
        const ftb = page.getByTestId('atem-ftb')
        await ftb.click()
        await ftb.click()
        assert.ok(await waitFor(async () => (await ftb.getAttribute('data-schwarz')) === 'true'))
        await ftb.click()
        await ftb.click()
        assert.ok(await waitFor(async () => (await ftb.getAttribute('data-schwarz')) === 'false'))
        assert.deepEqual(empfangen('CPvI').at(-1), { name: 'CPvI', me: 0, quelle: 4 })
        assert.equal(empfangen('DCut').length, 1)
        assert.equal(empfangen('DAut').length, 1)
        assert.deepEqual(empfangen('CTTp').at(-1), { name: 'CTTp', stil: 1 })
        // Der Schein-Mischer läuft mit 1080p50: Im Feld stehen echte Bilder, zum Mischer geht die Hälfte
        assert.deepEqual(empfangen('CTDp').at(-1), { name: 'CTDp', rate: 30 })
        assert.deepEqual(empfangen('FtbC').at(-1), { name: 'FtbC', rate: 20 })
        assert.equal(empfangen('FtbA').length, 2)
      }
    ],
    [
      'Hebel am echten Weg: zuletzt das Ende und die Null',
      async () => {
        const vorher = empfangen('CTPs').length
        const zug = await ziehe(1.1, 60)
        await zug.los()
        await zeigt('programm', 4)
        const werte = empfangen('CTPs')
          .slice(vorher)
          .map((c) => c.wert)
        assert.ok(werte.length >= 2, JSON.stringify(werte))
        assert.deepEqual(werte.slice(-2), [10000, 0])
      }
    ],
    [
      'Hebel am echten Weg: ohne Absetzen hin und zurück, der Mischer schaltet beide Male',
      async () => {
        const vorher = empfangen('CTPs').length
        const zug = await ziehe(1.1, 40)
        await zeigt('programm', 7)
        await zug.nach(-0.1, 40)
        await zeigt('programm', 4)
        await zug.los()
        const werte = empfangen('CTPs')
          .slice(vorher)
          .map((c) => c.wert)
        assert.equal(werte.filter((w) => w === 10000).length, 2, JSON.stringify(werte))
        assert.deepEqual(werte.slice(-2), [10000, 0])
      }
    ],
    [
      'Keyer am echten Weg: läuft bis zur Rückmeldung, Bytes stimmen, Panel erscheint',
      async () => {
        mischer.halteZurueck()
        await page.getByTestId('atem-usk-taste-1').click()
        await schaltet('atem-usk-taste-1', 'laeuft')
        assert.ok(await waitFor(async () => empfangen('CKOn').length === 1))
        mischer.freigeben()
        await schaltet('atem-usk-taste-1')
        assert.deepEqual(empfangen('CKOn')[0], { name: 'CKOn', me: 0, keyer: 1, an: true })

        await page.getByTestId('atem-dsk-taste-1').click()
        await schaltet('atem-dsk-taste-1')
        assert.deepEqual(empfangen('CDsL').at(-1), { name: 'CDsL', keyer: 1, an: true })
        mischer.fremderDsk(1, false)
        await schaltet('atem-dsk-taste-1', 'aus')
        mischer.fremderDsk(0, true)
        await schaltet('atem-dsk-taste-0')
        mischer.fremderDsk(0, false)
        await schaltet('atem-dsk-taste-0', 'aus')

        await page.getByTestId('atem-naechster-1').click()
        await schaltet('atem-naechster-1')
        assert.deepEqual(empfangen('CTTp').at(-1), { name: 'CTTp', auswahl: 0b101 })
        await page.getByTestId('atem-naechster-1').click()
        await schaltet('atem-naechster-1', 'aus')

        await reiter('Keyer')
        await waehlt('Key 3 Fill', '4')
        await waehlt('Key 3 Cut', '5')
        await waehlt('DSK 2 Fill', '6')
        await waehlt('DSK 2 Cut', '7')
        await page.getByLabel('DSK 2 Dauer in Bildern').fill('40')
        await page.getByLabel('DSK 2 Dauer in Bildern').press('Tab')
        await page.getByTestId('atem-dsk-tie-1').click()
        await schaltet('atem-dsk-tie-1')
        await page.getByTestId('atem-dsk-auto-1').click()
        await schaltet('atem-dsk-1')
        assert.deepEqual(empfangen('CKeF').at(-1), { name: 'CKeF', keyer: 2, quelle: 4 })
        assert.deepEqual(empfangen('CKeC').at(-1), { name: 'CKeC', keyer: 2, quelle: 5 })
        assert.deepEqual(empfangen('CDsF').at(-1), { name: 'CDsF', keyer: 1, quelle: 6 })
        assert.deepEqual(empfangen('CDsC').at(-1), { name: 'CDsC', keyer: 1, quelle: 7 })
        assert.deepEqual(empfangen('CDsR').at(-1), { name: 'CDsR', keyer: 1, rate: 20 })
        assert.deepEqual(empfangen('CDsT').at(-1), { name: 'CDsT', keyer: 1, an: true })
        assert.deepEqual(empfangen('DDsA').at(-1), { name: 'DDsA', keyer: 1 })
        await reiter('Mischen')
      }
    ],
    [
      'Makros am echten Weg: Namen vom Mischer, leere Plätze fehlen, Start und Stopp',
      async () => {
        await reiter('Makros')
        assert.match(await page.getByTestId('atem-makro-2').textContent(), /Abspann/)
        assert.equal(await page.getByTestId('atem-makro-1').count(), 0)
        await page.getByTestId('atem-makro-2').click()
        await schaltet('atem-makro-2')
        assert.deepEqual(empfangen('MAct').at(-1), { name: 'MAct', aktion: 0, index: 2 })
        await page.getByTestId('atem-makro-stopp').click()
        await schaltet('atem-makro-2', 'aus')
        assert.deepEqual(empfangen('MAct').at(-1), { name: 'MAct', aktion: 1, index: 0xffff })
        await page.getByTestId('atem-makro-0').click()
        await schaltet('atem-makro-0')
        mischer.makroZuEnde()
        await schaltet('atem-makro-0', 'aus')
      }
    ],
    [
      'Medien und AUX am echten Weg',
      async () => {
        await reiter('Medien')
        await waehlt('Media-Player 2 Inhalt', '1')
        assert.deepEqual(empfangen('MPSS').at(-1), {
          name: 'MPSS',
          player: 1,
          art: 1,
          still: 1,
          clip: 0
        })
        await page
          .getByRole('group', { name: 'Media-Player 1 Art' })
          .getByRole('button', { name: 'Clip' })
          .click()
        await page.getByTestId('atem-clip-spielen-0').click()
        await schaltet('atem-clip-spielen-0')
        assert.equal(empfangen('MPSS').at(-1).art, 2)
        assert.deepEqual(empfangen('SCPS').at(-1), { name: 'SCPS', player: 0, flag: 1 })
        await page.getByTestId('atem-clip-anfang-0').click()
        assert.ok(await waitFor(async () => empfangen('SCPS').at(-1).flag === 4))
        await page.getByTestId('atem-clip-spielen-0').click()
        await schaltet('atem-clip-spielen-0', 'aus')
        await reiter('AUX')
        await waehlt('AUX 1', '6')
        assert.deepEqual(empfangen('CAuS').at(-1), { name: 'CAuS', bus: 0, quelle: 6 })
        await reiter('Mischen')
      }
    ],
    [
      'Geprüft wird im main: fremde Befehle und Adressen kommen nicht durch',
      async () => {
        const vorher = mischer.empfangen.length
        await page.evaluate(async () => {
          await window.api.atem.command({ type: 'programm', me: 0, quelle: 9001 })
          await window.api.atem.command({ type: 'programm', me: 5, quelle: 1 })
          await window.api.atem.command({ type: 'macroRun', me: 0, index: 1 })
          await window.api.atem.command({ type: 'hebel', me: 0, wert: 20000 })
          await window.api.atem.command({ type: 'rate', me: 0, stil: 'mix', rate: 9999 })
          await window.api.atem.command('cut')
          await window.api.atem.command({ type: 'makroStart', index: 1 })
          await window.api.atem.command({ type: 'uskOnAir', me: 0, keyer: 9, an: true })
          await window.api.atem.command({ type: 'dskOnAir', keyer: 9, an: true })
          await window.api.atem.command({ type: 'naechster', me: 0, maske: 0 })
          await window.api.atem.command({ type: 'aux', bus: 5, quelle: 1 })
          await window.api.atem.command({ type: 'mediaQuelle', player: 0, art: 'still', index: 9 })
        })
        await sleep(200)
        assert.equal(mischer.empfangen.length, vorher)
        const s = await page.evaluate(() => window.api.atem.connect({ host: 'http://böse' }))
        assert.equal(s.fehler, 'Ungültige Adresse')
        assert.equal(s.phase, 'verbunden')
      }
    ],
    [
      'Werkzeug zu und wieder auf: Verbindung bleibt, kein zweiter Platz am Mischer',
      async () => {
        await openRoute(page, '/')
        await bar().waitFor({ state: 'detached' })
        await sleep(300)
        assert.equal((await page.evaluate(() => window.api.atem.status())).phase, 'verbunden')
        await openRoute(page, '/tool/atem-control')
        await knopf('programm', 1).waitFor()
        assert.equal(mischer.anmeldungen, 1)
      }
    ],
    [
      'Socket-Thread stirbt: Er startet neu, der Mischer sieht weiter nur einen Client',
      async () => {
        const vorher = mischer.anmeldungen
        await app.evaluate((_e, datei) => {
          const lade = process.mainModule.require.bind(process.mainModule)
          const { ThreadedClassManagerInternal } = lade(datei)
          for (const kind of Object.values(ThreadedClassManagerInternal._children)) {
            kind.process.kill()
          }
        }, THREADS)
        assert.ok(await waitFor(() => mischer.anmeldungen > vorher, 15_000), 'keine neue Anmeldung')
        assert.ok(
          await waitFor(
            async () => (await page.evaluate(() => window.api.atem.status())).phase === 'verbunden',
            15_000
          )
        )
        const threads = await app.evaluate((_e, datei) => {
          const lade = process.mainModule.require.bind(process.mainModule)
          return lade(datei).ThreadedClassManager.getThreadCount()
        }, THREADS)
        assert.equal(threads, 1)
        await zeigt('programm', 4)
        await knopf('vorschau', 6).click()
        await zeigt('vorschau', 6)
      }
    ],
    [
      'Verbindung weg: rot, Knöpfe gesperrt, kommt von selbst wieder',
      async () => {
        mischer.verstummen()
        assert.ok(
          await waitFor(async () => /Verbindung verloren/.test(await bar().textContent()), 15_000),
          'Verlust nicht gemeldet'
        )
        await page.getByText('Die Knöpfe sind gesperrt').waitFor()
        assert.equal(await knopf('programm', 2).isDisabled(), true)
        await zeigt('programm', 4)
        mischer.wieder()
        assert.ok(
          await waitFor(async () => /ATEM Mini Extreme/.test(await bar().textContent()), 15_000),
          'Verbindung kommt nicht wieder'
        )
        assert.equal(await knopf('programm', 2).isDisabled(), false)
      }
    ],
    [
      'Unbekannte Firmware: Warnung im Werkzeug',
      async () => {
        const neu = await startAtemFake({ version: 131200 })
        try {
          await page.evaluate((host) => window.api.atem.connect({ host }), neu.host)
          await page.getByText('Unbekannte Mischer-Firmware').waitFor()
          assert.match(await page.textContent('body'), /Protokoll 2\.128/)
        } finally {
          await page.evaluate(() => window.api.atem.disconnect())
          await neu.close()
        }
      }
    ],
    [
      'Beim Start verbinden: letzte Adresse ist gemerkt',
      async () => {
        await page.getByRole('checkbox', { name: 'Beim Start verbinden' }).check()
        assert.ok(
          await waitFor(
            async () => (await page.evaluate(() => window.api.getSettings())).atem.autoConnect
          )
        )
        const vorher = mischer.anmeldungen
        const zweiter = await launchApp({
          settings: { atem: { host: mischer.host, autoConnect: true, simModell: 'mini' } }
        })
        try {
          await openRoute(zweiter.page, '/tool/atem-control')
          await zweiter.page.getByTestId('atem-programm-8').waitFor()
          assert.ok(mischer.anmeldungen > vorher)
          assert.deepEqual(zweiter.errors, [])
        } finally {
          await zweiter.close()
        }
      }
    ],
    [
      'SIGTERM mit offener Verbindung beendet über den normalen Weg (macOS, Linux)',
      async () => {
        if (process.platform === 'win32') throw new Skip('kein SIGTERM unter Windows')
        await page.evaluate((host) => window.api.atem.connect({ host }), mischer.host)
        assert.ok(
          await waitFor(
            async () => (await page.evaluate(() => window.api.atem.status())).phase === 'verbunden'
          )
        )
        const ende = new Promise((resolve) => proc.once('exit', (code) => resolve(code)))
        proc.kill('SIGTERM')
        const code = await Promise.race([ende, sleep(10_000).then(() => 'hängt')])
        // exit-hook der Bibliothek beendete sonst hart mit 143, ohne Rückfrage und Aufräumen
        assert.equal(code, 0)
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
  await mischer.close()
}
