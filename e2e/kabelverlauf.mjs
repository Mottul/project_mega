// Kabelverlauf im LED-Wall-Konfigurator (Phase 2b, von Hand): Kette ohne Verlauf (Hinweis, keine
// Pfeile), Startecke + Richtung (Schlange), Ansicht von hinten (gespiegelt, Startecke anders
// beschriftet), Kette mit der Maus zeichnen und verlängern, Signal + Strom nebeneinander,
// Prozessor und Ports, Strom (Kreis, Phase, Überlast, Absicherung), PDF.
// Gelesen wird der gespeicherte Stand im localStorage und das Pfeil-SVG über dem Raster.

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, openRoute, runSteps, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx
const tab = (name) => page.getByRole('tab', { name, exact: true })
const hints = () => page.getByTestId('verlauf-hinweise')
const overlay = (id = 'sig') =>
  page
    .getByTestId(`${id}-verlauf`)
    .first()
    .evaluate((el) => el.innerHTML)
    .catch(() => '')
const stored = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('led-wall-konfigurator') ?? '{}').state ?? {})
const cell = (r, c) => page.locator(`[data-cell="${r},${c}"]`).first()

/** mit gedrückter Maustaste über die Zellen ziehen */
async function drag(cells) {
  const centre = async ([r, c]) => {
    const b = await cell(r, c).boundingBox()
    return [b.x + b.width / 2, b.y + b.height / 2]
  }
  await cell(...cells[0]).scrollIntoViewIfNeeded()
  const [x0, y0] = await centre(cells[0])
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (const c of cells.slice(1)) {
    const [x, y] = await centre(c)
    await page.mouse.move(x, y, { steps: 4 })
  }
  await page.mouse.up()
}

try {
  await runSteps('Kabelverlauf', [
    [
      'Kette ohne Verlauf: Hinweis, keine Pfeile',
      async () => {
        await page.setViewportSize({ width: 1500, height: 950 })
        await openRoute(page, '/tool/led-wall')
        await tab('Signal').click()
        // unterste Reihe (Wand 8 × 5) an S1
        await page.getByTitle('Zeile 5 – ganze Zeile zuweisen').click()
        await hints().getByText('S1 ohne Verlauf').waitFor({ timeout: 5000 })
        assert.equal(await page.getByTestId('sig-verlauf').count(), 0)
      }
    ],
    [
      'Startecke unten links, waagrecht: Pfeile durch alle 8 Module',
      async () => {
        await page.getByRole('combobox', { name: 'Startecke' }).selectOption('bl')
        assert.ok(
          await waitFor(async () => ((await overlay()).match(/<line /g) ?? []).length === 7, 5000),
          await overlay()
        )
        assert.equal(await hints().count(), 0)
        const s = await waitFor(async () => {
          const v = await stored()
          return v.sigMeta?.['0']?.start === 'bl' ? v : null
        }, 5000)
        assert.deepEqual(s.sigMeta['0'], { start: 'bl', axis: 'row' })
      }
    ],
    [
      'Ansicht von hinten: gespiegelt, Startecke heißt dann „unten rechts“',
      async () => {
        const vorne = /<circle cx="([\d.]+)"/.exec(await overlay())?.[1]
        await page
          .getByRole('group', { name: 'Blickrichtung der Pläne' })
          .getByRole('button', { name: 'Hinten' })
          .click()
        await page
          .getByText('Ansicht von hinten – Publikum auf der anderen Seite')
          .first()
          .waitFor()
        const hinten = await waitFor(async () => {
          const x = /<circle cx="([\d.]+)"/.exec(await overlay())?.[1]
          return x && x !== vorne ? x : null
        }, 5000)
        assert.ok(hinten, `Start blieb bei ${vorne}`)
        const label = await page
          .getByRole('combobox', { name: 'Startecke' })
          .evaluate((el) => el.selectedOptions[0]?.textContent)
        assert.equal(label, 'Start unten rechts')
        await page
          .getByRole('group', { name: 'Blickrichtung der Pläne' })
          .getByRole('button', { name: 'Vorne' })
          .click()
      }
    ],
    [
      'Kette zeichnen: neue Kette S2 über drei Module, dann am Ende weiterziehen',
      async () => {
        await page.getByRole('button', { name: 'Neue Signal-Kette' }).click()
        await page.getByRole('button', { name: 'Zeichnen' }).click()
        await drag([
          [0, 0],
          [0, 1],
          [0, 2]
        ])
        const eins = await waitFor(async () => {
          const v = await stored()
          return v.sigMeta?.['1']?.order?.length === 3 ? v : null
        }, 5000)
        assert.deepEqual(eins.sigMeta['1'].order, [
          [0, 0],
          [0, 1],
          [0, 2]
        ])
        await drag([
          [0, 2],
          [1, 2]
        ])
        const zwei = await waitFor(async () => {
          const v = await stored()
          return v.sigMeta?.['1']?.order?.length === 4 ? v : null
        }, 5000)
        assert.deepEqual(zwei.sigMeta['1'].order.at(-1), [1, 2])
        assert.deepEqual(zwei.sig[1].slice(0, 3), [-1, -1, 1])
        // Klicken im Zeichenmodus nimmt kein Modul heraus
        assert.equal(
          await page.getByRole('button', { name: 'Signal-Kette 2: 4 Module', exact: true }).count(),
          1
        )
        await page.getByRole('button', { name: 'Zeichnen' }).click()
      }
    ],
    [
      'Signal + Strom nebeneinander, jede mit eigener Verlauf-Leiste',
      async () => {
        await tab('Signal + Strom').click()
        // im Signal-Plan ist noch S2 gewählt (vorheriger Schritt)
        await page.getByRole('group', { name: 'Verlauf S2' }).waitFor({ timeout: 5000 })
        await page.getByRole('group', { name: 'Verlauf P1' }).waitFor({ timeout: 5000 })
        const [a, b] = await Promise.all([
          page.getByRole('region', { name: 'Signal' }).boundingBox(),
          page.getByRole('region', { name: 'Strom' }).boundingBox()
        ])
        assert.ok(b.x > a.x + a.width - 1, `nicht nebeneinander: ${JSON.stringify({ a, b })}`)
      }
    ],
    [
      'Prozessor: Vorgabe UHD Jr, Backup je Kette mit „B“ am letzten Modul',
      async () => {
        await tab('Signal').click()
        const card = page.getByRole('heading', { name: 'Signal', exact: true }).locator('../..')
        await card.getByText('NovaPro UHD Jr', { exact: true }).waitFor({ timeout: 5000 })
        await page.getByRole('button', { name: /^Signal-Kette 1:/ }).click()
        await page
          .getByRole('group', { name: 'Verlauf S1' })
          .getByRole('checkbox', { name: 'Backup' })
          .check()
        assert.ok(
          await waitFor(async () => (await overlay()).includes('data-backup="0"'), 5000),
          'kein „B“ am letzten Modul'
        )
        const s = await waitFor(async () => {
          const v = await stored()
          return v.sigMeta?.['0']?.backup ? v : null
        }, 5000)
        assert.deepEqual(s.sigMeta['0'].backup, {})
      }
    ],
    [
      'Über der Grenze je Port: Warnung; VX4S statt UHD Jr hat nur 4 Ports',
      async () => {
        // S1 bekommt Reihe 4 dazu: 16 Module × 57.600 px über 650.000
        await page.getByTitle('Zeile 4 – ganze Zeile zuweisen').click()
        const warn = page.getByTestId('signal-warnungen')
        await warn
          .getByText('S1: 16 Module = 921.600 px – über der Grenze je Port (650.000 px).')
          .waitFor({ timeout: 5000 })
        const head = page.getByTestId('settings-drawer').getByRole('button', { name: /^Prozessor/ })
        if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
        await page.getByRole('combobox', { name: 'Prozessor', exact: true }).selectOption('vx4s')
        await page
          .getByRole('heading', { name: 'Signal', exact: true })
          .locator('../..')
          .getByText('von 4')
          .waitFor({ timeout: 5000 })
        // zurück, Reihe 4 wieder frei
        await page.getByRole('combobox', { name: 'Prozessor', exact: true }).selectOption('')
        await page.getByTitle('Zeile 4 – ganze Zeile zuweisen').click()
        assert.ok(await waitFor(async () => (await warn.count()) === 0, 5000), 'Warnung bleibt')
      }
    ],
    [
      'Strom: Kreis und Phase je Kette, Überlast gemeldet, Absicherung in der Schublade',
      async () => {
        await tab('Strom').click()
        const zeilen = () =>
          page
            .getByRole('table', { name: 'Stromketten' })
            .evaluate((t) =>
              [...t.querySelectorAll('tbody tr')].map((tr) =>
                [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())
              )
            )
            .catch(() => [])
        // P1 = unterste Reihe (8 × 180 W = 6,3 A), Kreis F3 auf L2
        await page.getByTitle('Zeile 5 – ganze Zeile zuweisen').click()
        await page.getByRole('textbox', { name: 'Stromkreis' }).fill('F3')
        await page.keyboard.press('Tab')
        await page.getByRole('combobox', { name: 'Phase', exact: true }).selectOption('L2')
        assert.ok(
          await waitFor(async () => {
            const m = (await stored()).pwrMeta?.['0']
            return m?.circuit === 'F3' && m.phase === 'L2'
          }, 5000),
          JSON.stringify((await stored()).pwrMeta)
        )
        // P2 = Reihen 1–3 (24 Module = 18,8 A) – Vorschlag L1, über 16 A
        await page.getByRole('button', { name: 'Neue Strom-Kette' }).click()
        for (const z of [1, 2, 3])
          await page.getByTitle(`Zeile ${z} – ganze Zeile zuweisen`).click()
        const r = await waitFor(async () => {
          const v = await zeilen()
          return v.length === 2 ? v : null
        }, 5000)
        assert.deepEqual(r, [
          ['P1', '8', '6,3', 'F3 · L2'],
          ['P2', '24', '18,8', '(L1)']
        ])
        const warn = page.getByTestId('strom-warnungen')
        await warn
          .getByText(
            'P2: 24 Module = 18,8 A – über der Absicherung (16 A). Kette teilen, höchstens 20 Module je Kreis.'
          )
          .waitFor({ timeout: 5000 })
        // 25 A je Kreis: keine Überlast mehr
        const head = page.getByTestId('settings-drawer').getByRole('button', { name: /^Strom/ })
        if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
        await page.getByRole('combobox', { name: 'Absicherung je Kreis' }).selectOption('25')
        assert.ok(
          await waitFor(
            async () => (await warn.getByText(/über der Absicherung/).count()) === 0,
            5000
          ),
          'Überlast bleibt gemeldet'
        )
        // gespeichert wird verzögert (debouncedStorage)
        assert.ok(
          await waitFor(async () => (await stored()).mains?.breakerA === 25, 5000),
          JSON.stringify((await stored()).mains)
        )
        await tab('Signal').click()
      }
    ],
    [
      'Zweite Wand teilt den Prozessor: Ports fortlaufend, Karte nennt „geteilt“',
      async () => {
        const bar = page.getByTestId('tool-bar')
        await bar.getByRole('button', { name: /^Wand 1/ }).click()
        await page.getByRole('menuitem', { name: 'Neue Wand' }).click()
        await page.getByTitle('Zeile 1 – ganze Zeile zuweisen').click()
        await page
          .getByRole('combobox', { name: 'Prozessor teilen mit' })
          .selectOption({ label: 'wie Wand 1' })
        const card = page.getByRole('heading', { name: 'Signal', exact: true }).locator('../..')
        await card.getByText('NovaPro UHD Jr (geteilt)').waitFor({ timeout: 5000 })
        // Wand 1: S1 1 + Backup 2, S2 3; Wand 2: S1 bekommt Port 4
        const zeilen = await waitFor(async () => {
          const r = await card
            .getByRole('table', { name: 'Signalketten' })
            .evaluate((t) =>
              [...t.querySelectorAll('tbody tr')].map((tr) =>
                [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())
              )
            )
          return r.length === 3 ? r : null
        }, 5000)
        assert.deepEqual(
          zeilen?.map(([kette, mod, , port]) => [kette, mod, port]),
          [
            ['Wand 1 S1', '8', '1 · B 2'],
            ['Wand 1 S2', '4', '3'],
            ['Wand 2 S1', '8', '4']
          ]
        )
      }
    ],
    [
      'PDF-Doku mit den Plänen',
      async () => {
        const f = join(ctx.userData, 'kabel.pdf')
        await app.evaluate(({ dialog }, p) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
        }, f)
        await page.getByRole('button', { name: /PDF exportieren/ }).click()
        assert.ok(await waitFor(() => existsSync(f), 20_000), 'PDF nicht geschrieben')
        assert.ok(readFileSync(f).subarray(0, 5).toString() === '%PDF-')
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
}
