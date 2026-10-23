// Mini-Manual in der echten App: Werkzeug-Muster, Firmenprofil (App-Menü), Platzhalter aus der
// Geräteliste in der Vorschau, Kontakt aus dem Profil, Fall aus der Bibliothek, Kurzkarte (A5,
// genau eine Seite) und Handbuch als PDF, Projektdatei mit Foto, LED-Wall-Planung derselben
// Datei übernehmen und „Planung geändert“, Ziehen zum Sortieren, eigene Bausteine (gleicher Name,
// Export, Import, neuere Fassung aktualisieren), Vorschläge nach Stichworten, Bedienfeld
// (Tastenfeld-Editor). Dialoge werden im main ersetzt.

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  launchApp,
  openRoute,
  runSteps,
  stubConfirm,
  stubConfirmSequence,
  waitFor
} from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx
const bar = () => page.getByTestId('tool-bar')
const drawer = () => page.getByTestId('settings-drawer')
const vorschau = () =>
  page.getByTestId('mini-manual-vorschau').evaluate((el) => el.shadowRoot?.textContent ?? '')
const kapitel = (id) =>
  page.getByRole('combobox', { name: 'Kapitel', exact: true }).selectOption(id)
const datei = join(ctx.userData, 'Messe Test.mottul')
const FALL = 'Die Sicherung fliegt beim Einschalten'
/** eigene Bausteine, wie main sie ablegt */
const eigene = () => page.evaluate(() => window.api.bausteine.list())

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
        assert.equal(s.section.version, 7)
        assert.deepEqual(s.section.data.geraete[0].waende, ['wand-1', 'bar'])
      }
    ],
    [
      'Verkabelung aus der Kopie (von hinten), Glasfaser macht die Box-Schritte sichtbar',
      async () => {
        // Technik sieht alle Schritte der Fehlersuche
        await bar()
          .getByRole('group', { name: 'Ausgabe für' })
          .getByRole('button', { name: 'Technik' })
          .click()
        await kapitel('fehlersuche')
        const box = 'Hat die Breakout-Box Strom'
        const frage = 'Läuft das Signal über Glasfaser'
        // Kopie ohne Glasfaser: Frage und Box-Schritte entfallen
        assert.ok(await waitFor(async () => (await vorschau()).includes('Die ganze Wand'), 5000))
        assert.ok(!(await vorschau()).includes(box), 'Box-Schritt ohne Glasfaser')
        assert.ok(!(await vorschau()).includes(frage), 'Frage trotz bekannter Antwort')

        // Planung neu: eine Wand mit Ketten, Kreis und Glasfaser (Abschnitt Version 5)
        const cur = await peek('ledWall')
        const r = await page.evaluate(
          ([path, base]) =>
            window.api.projects.save({
              path,
              section: 'ledWall',
              version: 5,
              data: {
                projectName: 'Messe Test',
                customerName: '',
                walls: [
                  {
                    id: 'wand-1',
                    name: 'Wand 1',
                    data: {
                      moduleKey: '496-2,0',
                      widthM: '2',
                      heightM: '1',
                      sig: [
                        [0, 0, 1, 1],
                        [0, 0, 1, 1]
                      ],
                      pwr: [
                        [0, 0, 0, 0],
                        [0, 0, 0, 0]
                      ],
                      sigMeta: { 0: { start: 'bl', axis: 'row' } },
                      pwrMeta: { 0: { circuit: 'F3', phase: 'L2' } },
                      fiber: { box: 'cvt10', variant: 'S', redundancy: 'none', lengthM: 80 }
                    }
                  }
                ]
              },
              baseSha: base,
              force: false
            }),
          [datei, cur.section.sha256]
        )
        assert.ok(r.ok, JSON.stringify(r))
        await page.evaluate(() => window.dispatchEvent(new Event('focus')))
        await kapitel('ledWall')
        await page.getByRole('button', { name: 'Unterschiede ansehen' }).click()
        await page.getByRole('button', { name: 'Übernehmen', exact: true }).click()
        await page.getByText(/aus der Projektdatei, Stand 4/).waitFor({ timeout: 5000 })

        await kapitel('verkabelung')
        assert.ok(
          await waitFor(async () => {
            const t = await vorschau()
            return (
              t.includes('Ansicht von hinten') &&
              t.includes('CVT10-S · 1 Box · 1 Faser à 80 m') &&
              t.includes('F3 · L2')
            )
          }, 5000),
          await vorschau()
        )
        await page
          .getByRole('group', { name: 'Blickrichtung der Pläne' })
          .getByRole('button', { name: 'von vorne' })
          .click()
        assert.ok(
          await waitFor(async () => !(await vorschau()).includes('Ansicht von hinten'), 5000),
          'Blickrichtung bleibt hinten'
        )

        await kapitel('fehlersuche')
        assert.ok(await waitFor(async () => (await vorschau()).includes(box), 5000), 'Box fehlt')
        assert.ok(!(await vorschau()).includes(frage), 'Frage trotz Glasfaser in der Planung')
      }
    ],
    [
      'Handy-Fassung: Datei mit eingesetzten Fotos, Online-Ablage, Adresse in der Schublade',
      async () => {
        const handy = (eintrag) =>
          bar()
            .getByRole('button', { name: /^Handy/ })
            .click()
            .then(() => page.getByRole('menuitem', { name: eintrag }).click())
        // als Datei: eine Seite, die nichts nachlädt – das Deckblatt-Foto steckt darin
        const f = join(ctx.userData, 'handy.html')
        await saveTo(f)
        await handy('Als Datei speichern …')
        assert.ok(await waitFor(() => existsSync(f), 10_000), 'Handy-Datei fehlt')
        const html = readFileSync(f, 'utf8')
        assert.ok(html.includes('<meta name="viewport"'), 'ohne viewport')
        assert.ok(html.includes('<script>(function(){'), 'ohne Skript')
        assert.ok(html.includes('src="data:image/jpeg;base64,'), 'Foto nicht eingesetzt')
        assert.ok(!html.includes('foto://'), 'foto:// in der Datei')

        // Online-Ablage (wie ein pCloud Public Folder): Ordner und Adresse in den Einstellungen
        const ablage = join(ctx.userData, 'Public Folder')
        mkdirSync(ablage, { recursive: true })
        // über das App-Menü wie ein Nutzer (setSettings aus diesem Fenster käme hier nicht an –
        // der Abgleich erreicht das auslösende Fenster nicht)
        await app.evaluate(({ dialog }, p) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
        }, ablage)
        await page
          .getByRole('button', { name: /Mottulbox/ })
          .first()
          .click()
        await page.getByRole('button', { name: 'Ordner wählen …' }).click()
        await page.getByTestId('online-ordner').getByText(ablage).waitFor({ timeout: 5000 })
        await page.getByLabel('Adresse der Online-Ablage').fill('https://filedn.eu/test/')
        await page.keyboard.press('Tab')
        assert.ok(
          await waitFor(
            async () =>
              (await page.evaluate(() => window.api.getSettings())).online.url ===
              'https://filedn.eu/test/',
            5000
          ),
          'Adresse nicht gespeichert'
        )
        await page.keyboard.press('Escape')
        await handy('Online stellen')
        const link = page.getByTestId('online-adresse')
        const ausgabe = drawer().getByRole('button', { name: /^Ausgabe/ })
        if ((await ausgabe.getAttribute('aria-expanded')) !== 'true') await ausgabe.click()
        await link.waitFor({ timeout: 10_000 })
        const url = await link.textContent()
        const m = url.match(/^https:\/\/filedn\.eu\/test\/(messe-test-[a-z2-9]{8})\/index\.html$/)
        assert.ok(m, url)
        const online = readFileSync(join(ablage, m[1], 'index.html'), 'utf8')
        assert.ok(!online.includes('id="k-zugang"'), 'online mit Zugangsdaten')
        // aktualisieren: gleicher Ordner, gleiche Adresse (der QR-Code bleibt gültig)
        await handy('Online aktualisieren')
        await page.getByText('Online gestellt').last().waitFor({ timeout: 10_000 })
        assert.equal(await link.textContent(), url)
        assert.deepEqual(readdirSync(ablage), [m[1]])
      }
    ],
    [
      'Handy-Fassung im Browser: Fehlersuche Schritt für Schritt',
      async () => {
        const f = join(ctx.userData, 'handy.html')
        const [win] = await Promise.all([
          app.waitForEvent('window'),
          app.evaluate(({ BrowserWindow }, file) => {
            const w = new BrowserWindow({ show: false, width: 400, height: 800 })
            void w.loadFile(file)
          }, f)
        ])
        await win.waitForLoadState()
        const fall = win.locator('.fall[data-fall="lib-wand-dunkel"]')
        await fall.getByRole('button', { name: 'Schritt für Schritt' }).click()
        const aktiv = () => fall.locator('.fs.aktiv').getAttribute('data-nr')
        assert.equal(await fall.locator('.fs.aktiv').count(), 1)
        assert.equal(await aktiv(), '1')
        // Frage 1 „Leuchten die Module …“ – Ja/Nein als Knöpfe, sonst keine Schritte sichtbar
        await fall.locator('.sfs-box').getByRole('button', { name: 'Nein', exact: true }).click()
        const zwei = await aktiv().catch(() => null)
        const ende = await fall.locator('.sfs-ende').count()
        assert.ok((zwei && zwei !== '1') || ende === 1, `weder Schritt noch Ende: ${zwei}`)
        await fall.locator('.sfs-box').getByRole('button', { name: 'Zurück' }).click()
        assert.equal(await aktiv(), '1')
        await fall.locator('.sfs-box').getByRole('button', { name: 'Alle Schritte zeigen' }).click()
        assert.ok((await fall.locator('.fs:visible').count()) > 3, 'Liste nicht zurück')
        await win.close()
      }
    ],
    [
      'Ziehen zum Sortieren: Laptop am Griff vor den Prozessor ziehen',
      async () => {
        await kapitel('geraete')
        const name = (i) =>
          page.getByTestId('geraet').nth(i).getByLabel('Name', { exact: true }).inputValue()
        assert.equal(await name(1), 'Laptop')
        // Von Hand in Schritten statt `dragTo`: Das bewegt die Maus nur einmal – dann startet das
        // Ziehen, aber am Ziel kommt kein dragover und unter macOS kein drop an (CI rot, #166).
        // Erst bewegen (Ziehen startet), dann über dem oberen Rand der Zielzeile (= davor) bewegen.
        const ziel = page.getByTestId('geraet').first()
        const griff = page.getByRole('img', { name: 'Gerät ziehen zum Verschieben' }).nth(1)
        await ziel.scrollIntoViewIfNeeded()
        await griff.hover()
        const g = await griff.boundingBox()
        const z = await ziel.boundingBox()
        await page.mouse.down()
        await page.mouse.move(g.x + g.width / 2, g.y - 12, { steps: 4 })
        await page.mouse.move(z.x + 60, z.y + 10, { steps: 6 })
        await page.mouse.move(z.x + 62, z.y + 8, { steps: 2 })
        await page.mouse.up()
        assert.ok(await waitFor(async () => (await name(0)) === 'Laptop', 5000), await name(0))
        assert.equal(await name(1), 'NovaPro UHD Jr')
        // ohne Griff ist die Zeile nicht ziehbar (sonst ließe sich kein Text markieren)
        assert.notEqual(await page.getByTestId('geraet').first().getAttribute('draggable'), 'true')
      }
    ],
    [
      'Eigener Baustein: gleicher Name fragt nach, „Beide behalten“ gibt „(2)“',
      async () => {
        await kapitel('fehlersuche')
        await page
          .getByRole('list', { name: 'Fehlerfälle' })
          .getByRole('button', { name: new RegExp(FALL) })
          .click()
        const speichern = page.getByRole('button', { name: 'Als eigenen Baustein speichern' })
        await speichern.click()
        assert.ok(await waitFor(async () => (await eigene()).length === 1, 5000))
        // Rückfrage: Ersetzen (0) · Beide behalten (1) · Abbrechen (2)
        await stubConfirmSequence(app, [1])
        await speichern.click()
        const l = await waitFor(async () => {
          const x = await eigene()
          return x.length === 2 ? x : null
        }, 5000)
        assert.ok(l, 'zweiter Baustein fehlt')
        assert.deepEqual(l.map((b) => b.titel).sort(), [FALL, `${FALL} (2)`])
      }
    ],
    [
      'Bausteine-Dialog: alle exportieren, einen löschen, Datei wieder importieren',
      async () => {
        await bar().getByRole('button', { name: 'Bausteine', exact: true }).click()
        const dlg = page.getByRole('dialog', { name: 'Eigene Bausteine' })
        const zeilen = dlg.getByRole('textbox', { name: /^Name von/ })
        assert.ok(await waitFor(async () => (await zeilen.count()) === 2, 5000))
        const f = join(ctx.userData, 'bausteine.json')
        await saveTo(f)
        await dlg.getByRole('button', { name: /Alle exportieren/ }).click()
        assert.ok(await waitFor(() => existsSync(f), 5000), 'Export fehlt')
        const j = JSON.parse(readFileSync(f, 'utf8'))
        assert.equal(j.app, 'mottulbox')
        assert.equal(j.typ, 'bausteine')
        assert.equal(j.bausteine.length, 2)

        await stubConfirm(app, true)
        await dlg.getByRole('button', { name: `„${FALL} (2)“ löschen` }).click()
        assert.ok(await waitFor(async () => (await zeilen.count()) === 1, 5000))

        await app.evaluate(({ dialog }, p) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
        }, f)
        await dlg.getByRole('button', { name: /Importieren/ }).click()
        // der gelöschte kommt zurück, der vorhandene (gleiche Version) bleibt unberührt
        await page.getByText('1 neu, 1 schon vorhanden').waitFor({ timeout: 5000 })
        assert.ok(await waitFor(async () => (await zeilen.count()) === 2, 5000))
        await page.keyboard.press('Escape')
        await dlg.waitFor({ state: 'detached' })
      }
    ],
    [
      'Vorschlag nach Stichworten, „Neuere Fassung“ eines eigenen Bausteins aktualisieren',
      async () => {
        const einfuegen = page.getByRole('button', { name: /Baustein einfügen/ })
        const wahl = page.getByRole('dialog', { name: 'Bausteine', exact: true })
        // die Wand der Kopie (Modul 496-2,0, NovaStar) passt zu „Status-LEDs der Module“
        await kapitel('ledWall')
        await page.getByTestId('baustein-passend').getByText('1 passt').waitFor({ timeout: 5000 })
        await einfuegen.click()
        await wahl
          .getByRole('listitem')
          .filter({ hasText: 'Status-LEDs der Module' })
          .getByText('passt zum Projekt')
          .waitFor()
        await wahl.getByRole('button', { name: /Status-LEDs der Module/ }).click()
        await page.getByTestId('baustein-passend').waitFor({ state: 'detached' })

        // eigener Baustein: speichern, einfügen, dann „Ersetzen“ = Version 2 -> Hinweis im Kapitel
        await kapitel('einAus')
        const speichern = async () => {
          await einfuegen.click()
          await wahl.getByLabel('Titel des neuen Bausteins').fill('Mein Ablauf')
          await wahl.getByRole('button', { name: /Kapitel als Baustein speichern/ }).click()
        }
        await speichern()
        const version = async () => (await eigene()).find((b) => b.titel === 'Mein Ablauf')?.version
        assert.ok(await waitFor(async () => (await version()) === 1, 5000))
        await wahl.getByRole('button', { name: 'Mein Ablauf' }).click()
        await wahl.waitFor({ state: 'detached' })
        // Rückfrage gleicher Name: Ersetzen (0)
        await stubConfirmSequence(app, [0])
        await speichern()
        assert.ok(await waitFor(async () => (await version()) === 2, 5000))
        const hinweis = page.getByTestId('neuere-fassung')
        await hinweis
          .getByText('Neuere Fassung von „Mein Ablauf“: Version 1 → 2 (eigener Baustein)')
          .waitFor({ timeout: 5000 })
        await stubConfirm(app, true)
        await hinweis.getByRole('button', { name: 'Aktualisieren' }).click()
        await hinweis.waitFor({ state: 'detached', timeout: 5000 })
        await wahl.getByRole('button', { name: 'Schließen' }).click()
      }
    ],
    [
      'Bedienfeld: Taste beschriften, Navigation zur zweiten Seite, Ziehen, kleineres Raster',
      async () => {
        await kapitel('bedienfeld')
        const an = page.getByLabel('in der Anleitung', { exact: true })
        if (!(await an.isChecked())) await an.check()
        await page.getByRole('button', { name: 'Bedienfeld hinzufügen' }).click()
        const feld = page.getByTestId('bedienfeld')
        const form = page.getByTestId('taste-form')
        const taste = (name) => feld.getByRole('button', { name, exact: true })
        await feld.getByLabel('Name des Bedienfelds').fill('Regie')
        await taste('Taste 1').click()
        await form.getByRole('textbox', { name: 'Aufschrift' }).fill('Intro')
        await form.getByRole('textbox', { name: 'Funktion' }).fill('Startet das Intro-Video')
        // zweite Seite „Licht“, dann auf Seite 1 eine Taste dorthin
        await feld.getByRole('button', { name: 'Seite hinzufügen' }).click()
        await feld.getByLabel('Name der Seite').fill('Licht')
        await feld.getByRole('tab', { name: 'Seite 1' }).click()
        await taste('Taste 15').click()
        await form.getByRole('combobox', { name: 'Navigation' }).selectOption({
          label: 'Öffnet „Licht“'
        })
        assert.ok(
          await waitFor(async () => {
            const v = await vorschau()
            return ['Regie', 'Intro', 'Startet das Intro-Video', '▸ Licht', 'Öffnet „Licht“'].every(
              (x) => v.includes(x)
            )
          }, 5000),
          await vorschau()
        )

        // Ziehen in Schritten (siehe „Ziehen zum Sortieren“): Taste 1 auf den leeren Platz 3
        const von = taste('Taste 1: Intro')
        const nach = taste('Taste 3')
        await von.scrollIntoViewIfNeeded()
        await von.hover()
        const a = await von.boundingBox()
        const b = await nach.boundingBox()
        await page.mouse.down()
        await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2, { steps: 4 })
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 })
        await page.mouse.move(b.x + b.width / 2 + 2, b.y + b.height / 2 + 2, { steps: 2 })
        await page.mouse.up()
        await taste('Taste 3: Intro').waitFor({ timeout: 5000 })
        await taste('Taste 1').waitFor()

        // kleineres Raster: die Navigation auf Platz 15 fällt nach der Rückfrage weg
        await stubConfirm(app, true)
        await feld.getByRole('combobox', { name: 'Gerät' }).selectOption('sd-mini')
        assert.ok(
          await waitFor(
            async () => (await feld.getByRole('button', { name: /^Taste \d+/ }).count()) === 6,
            5000
          )
        )
        await taste('Taste 3: Intro').waitFor()
        assert.ok(
          await waitFor(async () => !(await vorschau()).includes('▸ Licht'), 5000),
          await vorschau()
        )
      }
    ],
    [
      'Übernahme: Jingle-Player und OSC-Steuerung ins Bedienfeld, Video-Player in Software',
      async () => {
        // Belegung, wie der Jingle-Player sie speichert – die Audiodatei braucht die Übernahme
        // nicht; der Store des Jingle-Players ist in diesem Fenster noch nicht geladen
        await page.evaluate(() =>
          localStorage.setItem(
            'jingle-player',
            JSON.stringify({
              state: {
                banks: [
                  {
                    id: 'b1',
                    name: 'Gala',
                    pads: [
                      {
                        id: 'p1',
                        storedName: 'a.mp3',
                        originalName: 'Applaus.mp3',
                        label: '',
                        color: '#ef4444',
                        volume: 1,
                        loop: false,
                        mode: 'oneshot',
                        fadeMs: 400,
                        startSec: 0,
                        endSec: null
                      }
                    ]
                  }
                ],
                currentBankId: 'b1',
                columns: 4,
                outputDeviceId: '',
                soloMode: false,
                mode: 'edit'
              },
              version: 1
            })
          )
        )
        await kapitel('bedienfeld')
        const jingle = page.getByRole('button', { name: 'Aus dem Jingle-Player' })
        const zahl = async (text) => (await vorschau()).split(text).length - 1
        await jingle.click()
        assert.ok(await waitFor(async () => (await zahl('Spielt „Applaus“')) === 1, 5000))
        // noch einmal: Rückfrage „ersetzen?“ – danach steht das Feld weiter nur einmal da
        await stubConfirmSequence(app, [0])
        await jingle.click()
        await page.getByText('Der Jingle-Player übernommen').waitFor({ timeout: 5000 })
        assert.equal(await zahl('Spielt „Applaus“'), 1)

        // eine frische App hat ein OSC-Projekt mit Beispiel-Kacheln (je Typ eine)
        await page.getByRole('button', { name: /Aus der OSC-Steuerung/ }).click()
        assert.ok(
          await waitFor(async () => {
            const v = await vorschau()
            return v.includes('OSC-Steuerung (Mottulbox)') && v.includes('Regler')
          }, 5000),
          await vorschau()
        )

        await kapitel('software')
        await page.getByRole('button', { name: 'Aus dem Video-Player' }).click()
        assert.ok(
          await waitFor(async () => (await vorschau()).includes('Mottulbox-Player'), 5000),
          await vorschau()
        )
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
