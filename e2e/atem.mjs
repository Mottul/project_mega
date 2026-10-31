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
        // 2 s statt 0,5 s: Der Klick allein dauert auf dem macOS-Runner spürbar
        await page.evaluate(() =>
          window.api.atem.command({ type: 'rate', me: 0, stil: 'mix', bilder: 100 })
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
          window.api.atem.command({ type: 'rate', me: 0, stil: 'mix', bilder: 25 })
        )
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
        await page.getByLabel('Dauer in Bildern').fill('50')
        await page.getByLabel('Dauer in Bildern').press('Tab')
        // Extreme im Probebetrieb: 1080p50, 50 Bilder sind 1 s
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
      'Kleines Modell: weniger Quellen, keine M/E-Auswahl',
      async () => {
        await probebetrieb('mini')
        assert.match(await bar().textContent(), /ATEM Mini · Probebetrieb/)
        assert.equal(await knopf('programm', 4).count(), 1)
        assert.equal(await knopf('programm', 5).count(), 0)
        assert.equal(await page.getByRole('group', { name: 'M/E' }).count(), 0)
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
        await me.getByRole('button', { name: 'M/E 1' }).click()
        await zeigt('programm', 1)
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
        assert.deepEqual(empfangen('CTDp').at(-1), { name: 'CTDp', rate: 60 })
        assert.deepEqual(empfangen('FtbC').at(-1), { name: 'FtbC', rate: 40 })
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
      'Geprüft wird im main: fremde Befehle und Adressen kommen nicht durch',
      async () => {
        const vorher = mischer.empfangen.length
        await page.evaluate(async () => {
          await window.api.atem.command({ type: 'programm', me: 0, quelle: 9001 })
          await window.api.atem.command({ type: 'programm', me: 5, quelle: 1 })
          await window.api.atem.command({ type: 'macroRun', me: 0, index: 1 })
          await window.api.atem.command({ type: 'hebel', me: 0, wert: 20000 })
          await window.api.atem.command({ type: 'rate', me: 0, stil: 'mix', bilder: 9999 })
          await window.api.atem.command('cut')
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
