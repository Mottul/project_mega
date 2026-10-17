// Mini-Manual in der echten App: Werkzeug-Muster, Firmenprofil (App-Menü), Platzhalter aus der
// Geräteliste in der Vorschau, Kontakt aus dem Profil, Fall aus der Bibliothek, Kurzkarte (A5,
// genau eine Seite) und Handbuch als PDF, Projektdatei mit Foto, LED-Wall-Planung derselben
// Datei übernehmen und „Planung geändert“. Dialoge werden im main ersetzt.

import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, openRoute, runSteps, stubConfirm, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx
const bar = () => page.getByTestId('tool-bar')
const drawer = () => page.getByTestId('settings-drawer')
const vorschau = () =>
  page.getByTestId('mini-manual-vorschau').evaluate((el) => el.shadowRoot?.textContent ?? '')
const kapitel = (id) =>
  page.getByRole('combobox', { name: 'Kapitel', exact: true }).selectOption(id)
const datei = join(ctx.userData, 'Messe Test.mottul')

/** Speichern-Dialog liefert einen festen Pfad */
const saveTo = (file) =>
  app.evaluate(({ dialog }, f) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: f })
  }, file)

function pdfInfo(buf) {
  const s = buf.toString('latin1')
  const m = s.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/)
  return {
    pages: (s.match(/\/Type\s*\/Page(?!s)/g) ?? []).length,
    w: m ? +m[1] : 0,
    h: m ? +m[2] : 0
  }
}

/** Prüfsumme des LED-Wall-Abschnitts nach dem zweiten Speichern (für den dritten Stand) */
let sha2 = null

/** Abschnitt der Projektdatei lesen (ohne Binden) */
const peek = (section) =>
  page.evaluate(([s, p]) => window.api.projects.peek(s, p), [section, datei])

/** LED-Wall-Abschnitt in dieselbe Datei schreiben – wie der Konfigurator */
async function ledWallSpeichern(widthM, baseSha) {
  const r = await page.evaluate(
    ([path, w, base]) =>
      window.api.projects.save({
        path,
        section: 'ledWall',
        version: 2,
        data: { moduleKey: '496-2,0', widthM: w, heightM: '2,5', projectName: 'Messe Test' },
        baseSha: base,
        force: false
      }),
    [datei, widthM, baseSha]
  )
  assert.ok(r.ok, JSON.stringify(r))
  return r.sha256
}

try {
  await runSteps('Mini-Manual', [
    [
      'Werkzeug öffnet: Leiste „Anleitung“, Schublade, Vorschau mit Ein-/Ausschalten',
      async () => {
        await openRoute(page, '/tool/mini-manual')
        await bar().getByText('Anleitung', { exact: true }).waitFor({ timeout: 15_000 })
        assert.equal(await bar().getAttribute('data-kind'), 'job')
        await bar()
          .getByRole('button', { name: /Kurzkarte/ })
          .waitFor()
        // Bereichs-Kopf = Titel + Zusammenfassung („Kapitel 10 von 14“)
        await drawer()
          .getByRole('button', { name: /^Kapitel \d+ von/ })
          .waitFor()
        assert.ok(await waitFor(async () => (await vorschau()).includes('Einschalten'), 10_000))
      }
    ],
    [
      'Firmenprofil im App-Menü: Name und Kontakt',
      async () => {
        await page
          .getByRole('button', { name: /Mottulbox/ })
          .first()
          .click()
        await page.getByRole('button', { name: /Bearbeiten/ }).click()
        const dlg = page.getByRole('dialog', { name: 'Firmenprofil' })
        await dlg.getByLabel('Firmenname').fill('Testfirma')
        await dlg.getByRole('button', { name: 'Kontakt', exact: true }).click()
        await dlg.getByLabel('Name', { exact: true }).fill('Matthias')
        await dlg.getByLabel('Mobil').fill('+43 664 1234567')
        await dlg.getByRole('button', { name: 'Speichern' }).click()
        const fp = await waitFor(async () => {
          const s = await page.evaluate(() => window.api.getSettings())
          return s.firmenprofil.kontakte.length === 1 ? s.firmenprofil : null
        })
        assert.ok(fp, 'Profil nicht gespeichert')
        assert.equal(fp.name, 'Testfirma')
        assert.equal(fp.kontakte[0].name, 'Matthias')
      }
    ],
    [
      'Projekt und Gerät: Platzhalter {prozessor.name} erscheint fett in der Vorschau',
      async () => {
        await drawer().getByLabel('Projekt', { exact: true }).fill('Messe Test')
        await page.keyboard.press('Tab')
        await kapitel('geraete')
        await page.getByRole('button', { name: 'Gerät', exact: true }).click()
        await page.getByLabel('Kurzname').fill('prozessor')
        await page.getByLabel('Name', { exact: true }).fill('NovaPro UHD Jr')
        await page.keyboard.press('Tab')
        await kapitel('einAus')
        assert.ok(
          await waitFor(
            async () => (await vorschau()).includes('Prozessor NovaPro UHD Jr einschalten'),
            5000
          ),
          await vorschau()
        )
        // eingesetzte Werte sind hervorgehoben
        const ph = await page
          .getByTestId('mini-manual-vorschau')
          .evaluate((el) =>
            [...(el.shadowRoot?.querySelectorAll('.ph') ?? [])].map((x) => [
              x.textContent,
              getComputedStyle(x).fontWeight
            ])
          )
        assert.ok(
          ph.some(([t, w]) => t === 'NovaPro UHD Jr' && +w >= 600),
          JSON.stringify(ph)
        )
      }
    ],
    [
      'Kontakt aus dem Firmenprofil – die Prüfung meldet ihn nicht mehr',
      async () => {
        const fehlt = () => drawer().getByText(/Kein Kontakt gewählt/)
        assert.ok(await waitFor(async () => (await fehlt().count()) === 1, 5000))
        await kapitel('kontakt')
        await page
          .getByRole('combobox', { name: 'Kontakt aus dem Firmenprofil' })
          .selectOption({ label: 'Matthias' })
        await page.getByRole('button', { name: 'Hinzufügen' }).click()
        assert.ok(await waitFor(async () => (await vorschau()).includes('Matthias'), 5000))
        assert.ok(await waitFor(async () => (await fehlt().count()) === 0, 5000))
      }
    ],
    [
      'Fehlersuche: Fall aus der Bibliothek einfügen',
      async () => {
        await kapitel('fehlersuche')
        await page.getByRole('button', { name: /Aus der Bibliothek/ }).click()
        await page.getByRole('button', { name: /Die Sicherung fliegt beim Einschalten/ }).click()
        await page
          .getByRole('list', { name: 'Fehlerfälle' })
          .getByRole('button', { name: /Die Sicherung fliegt/ })
          .waitFor()
      }
    ],
    [
      'Kurzkarte: A5, genau eine Seite',
      async () => {
        await stubConfirm(app, true)
        const f = join(ctx.userData, 'kurzkarte.pdf')
        await saveTo(f)
        await bar()
          .getByRole('button', { name: /Kurzkarte/ })
          .click()
        assert.ok(await waitFor(() => existsSync(f), 20_000), 'Kurzkarte nicht geschrieben')
        const i = pdfInfo(readFileSync(f))
        assert.equal(i.pages, 1)
        assert.ok(Math.abs(i.w - 420) < 2 && Math.abs(i.h - 595) < 2, `${i.w} × ${i.h}`)
      }
    ],
    [
      'Handbuch: A4, ein Kapitel je Seite',
      async () => {
        const f = join(ctx.userData, 'handbuch.pdf')
        await saveTo(f)
        await bar()
          .getByRole('button', { name: /Handbuch/ })
          .click()
        assert.ok(await waitFor(() => existsSync(f), 20_000), 'Handbuch nicht geschrieben')
        const i = pdfInfo(readFileSync(f))
        assert.ok(i.pages >= 6, `${i.pages} Seiten`)
        assert.ok(Math.abs(i.w - 595) < 2, `${i.w} × ${i.h}`)
      }
    ],
    [
      'Projektdatei mit Foto auf dem Deckblatt',
      async () => {
        // Hochformat: Querformat blieb in der schmalen Vorschau unter der Höhengrenze und zeigte
        // den Fehler (gestreckt auf volle Breite) nicht
        const b64 = await app.evaluate(({ nativeImage }) => {
          const w = 200
          const h = 320
          const buf = Buffer.alloc(w * h * 4, 255)
          for (let i = 0; i < buf.length; i += 4) buf[i] = (i / 4) % 255
          return nativeImage
            .createFromBitmap(buf, { width: w, height: h })
            .toJPEG(85)
            .toString('base64')
        })
        const jpg = join(ctx.userData, 'wand.jpg')
        writeFileSync(jpg, Buffer.from(b64, 'base64'))
        await app.evaluate(({ dialog }, p) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
        }, jpg)
        await kapitel('deckblatt')
        await page.getByRole('button', { name: 'Foto einfügen' }).click()
        assert.ok(
          await waitFor(
            () =>
              page
                .getByTestId('mini-manual-vorschau')
                .evaluate((el) => !!el.shadowRoot?.querySelector('img.foto')),
            5000
          ),
          'Foto nicht in der Vorschau'
        )
        // Seitenverhältnis bleibt (das Deckblatt ist eine Flex-Spalte – früher gestreckt)
        const r = await waitFor(
          () =>
            page.getByTestId('mini-manual-vorschau').evaluate((el) => {
              const img = el.shadowRoot?.querySelector('img.foto')
              return img?.complete && img.naturalWidth
                ? [img.clientWidth / img.clientHeight, img.naturalWidth / img.naturalHeight]
                : null
            }),
          5000
        )
        assert.ok(r && Math.abs(r[0] - r[1]) < 0.03, `Verhältnis ${r}`)
        await saveTo(datei)
        await bar()
          .getByRole('button', { name: /^Datei/ })
          .click()
        await page.getByRole('menuitem', { name: /^Speichern unter/ }).click()
        assert.ok(await waitFor(() => existsSync(datei), 10_000), 'Projektdatei fehlt')
        const s = await peek('anleitung')
        assert.ok(s?.ok && s.section, JSON.stringify(s))
        assert.equal(s.section.data.deckblatt.projekt, 'Messe Test')
        const hash = s.section.data.deckblatt.foto
        assert.ok(
          readFileSync(datei).includes(Buffer.from(`fotos/${hash}.jpg`)),
          'Foto nicht in der Datei'
        )
      }
    ],
    [
      'LED-Wall derselben Datei übernehmen, dann „Planung geändert (Stand 1 → 2)“',
      async () => {
        const sha1 = await ledWallSpeichern('4', null)
        await page.evaluate(() => window.dispatchEvent(new Event('focus')))
        await kapitel('ledWall')
        await page
          .getByRole('button', { name: /Aus dieser Projektdatei übernehmen \(Stand 1\)/ })
          .click()
        await page.getByText(/aus der Projektdatei, Stand 1/).waitFor()
        sha2 = await ledWallSpeichern('6', sha1)
        await page.evaluate(() => window.dispatchEvent(new Event('focus')))
        // steht auch in der Prüfung der Schublade – hier der Hinweis im Kapitel
        await page
          .getByText('Planung geändert (Stand 1 → 2)', { exact: true })
          .waitFor({ timeout: 5000 })
        await page.getByRole('button', { name: 'Unterschiede ansehen' }).click()
        await page.getByRole('cell', { name: 'Breite', exact: true }).waitFor()
        await page.getByRole('button', { name: 'Übernehmen', exact: true }).click()
        await page.getByText(/aus der Projektdatei, Stand 2/).waitFor()
        assert.ok(
          await waitFor(async () => (await page.getByText(/Planung geändert/).count()) === 0, 5000),
          'Hinweis „Planung geändert“ bleibt stehen'
        )
      }
    ],
    [
      'Zweite Wand in derselben Datei (Abschnitt Version 3): Unterschied, Kopie und Vorschau',
      async () => {
        const r = await page.evaluate(
          ([path, base]) =>
            window.api.projects.save({
              path,
              section: 'ledWall',
              version: 3,
              data: {
                projectName: 'Messe Test',
                customerName: '',
                walls: [
                  {
                    id: 'wand-1',
                    name: 'Wand 1',
                    data: { moduleKey: '496-2,0', widthM: '6', heightM: '2,5' }
                  },
                  { id: 'bar', name: 'Bar', data: { moduleKey: 'uS2+', widthM: '2', heightM: '1' } }
                ]
              },
              baseSha: base,
              force: false
            }),
          [datei, sha2]
        )
        assert.ok(r.ok, JSON.stringify(r))
        await page.evaluate(() => window.dispatchEvent(new Event('focus')))
        await page
          .getByText('Planung geändert (Stand 2 → 3)', { exact: true })
          .waitFor({ timeout: 5000 })
        await page.getByRole('button', { name: 'Unterschiede ansehen' }).click()
        await page.getByRole('cell', { name: 'Bar (neu)', exact: true }).waitFor()
        await page.getByRole('button', { name: 'Übernehmen', exact: true }).click()
        const liste = page.getByRole('list', { name: 'Übernommene Wände' })
        await liste.getByText(/^Bar: uS2\+/).waitFor({ timeout: 5000 })
        assert.equal(await liste.getByRole('listitem').count(), 2)
        // Vorschau des Kapitels: je Wand ein Abschnitt mit Namen
        assert.ok(
          await waitFor(async () => {
            const t = await vorschau()
            return t.includes('Wand 1') && t.includes('Bar') && t.includes('uS2+')
          }, 5000),
          await vorschau()
        )
      }
    ],
    [
      'Signalweg: Prozessor bespielt beide Wände, Laptop mit Ausgang und Ausschnitt',
      async () => {
        await kapitel('geraete')
        const erstes = page.getByTestId('geraet').first()
        await erstes.getByRole('combobox', { name: 'Rolle' }).selectOption('prozessor')
        const bespielt = erstes.getByRole('group', { name: 'Bespielt' })
        await bespielt.getByRole('checkbox', { name: 'Wand 1' }).check()
        await bespielt.getByRole('checkbox', { name: 'Bar' }).check()
        await page.getByRole('button', { name: 'Gerät', exact: true }).click()
        const laptop = page.getByTestId('geraet').nth(1)
        await laptop.getByLabel('Name', { exact: true }).fill('Laptop')
        await page.keyboard.press('Tab')
        await laptop.getByRole('button', { name: 'Ausgang', exact: true }).click()
        const ausgang = laptop.getByTestId('ausgang')
        assert.equal(await ausgang.getByLabel('Ausgang', { exact: true }).inputValue(), 'HDMI 1')
        await ausgang.getByText(/Geht an „NovaPro UHD Jr“/).waitFor({ timeout: 5000 })
        await ausgang.getByLabel('Bild Breite (px)').fill('3840')
        await ausgang.getByLabel('Bild Höhe (px)').fill('1200')
        for (const [feld, wert] of [
          ['x', '0'],
          ['y', '0'],
          ['Breite', '1920'],
          ['Höhe', '1200']
        ]) {
          await ausgang.getByLabel(`Ausschnitt Wand 1 ${feld}`).fill(wert)
          await page.keyboard.press('Tab')
        }
        await kapitel('system')
        assert.ok(
          await waitFor(async () => {
            const t = await vorschau()
            return (
              t.includes('Signalwege') &&
              t.includes('Laptop (HDMI 1) → NovaPro UHD Jr · Ausschnitt ab 0, 0 · 1920 × 1200 px')
            )
          }, 5000),
          await vorschau()
        )
        // gespeichert in der Datei (Abschnitt Version 3)
        await page.keyboard.press('Control+s')
        const s = await waitFor(async () => {
          const r = await peek('anleitung')
          return r?.section?.data.geraete?.[1]?.ausgaenge?.[0]?.breite === 3840 ? r : null
        }, 10_000)
        assert.ok(s, 'Ausgang nicht in der Datei')
        assert.equal(s.section.version, 3)
        assert.deepEqual(s.section.data.geraete[0].waende, ['wand-1', 'bar'])
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
