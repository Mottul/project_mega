// Projektdatei (.mottul) und Projektordner am LED-Wall-Konfigurator: Standardordner, Speichern
// unter, „ungespeichert“-Punkt, Strg+S, Konflikt mit einer anderswo geänderten Datei, Neu mit
// Rückfrage, Öffnen, Strg+O aus einem gepufferten Feld, „Leere anlegen“ mit scheiterndem
// Schreiben. Dialoge werden im main ersetzt (feste Pfade, feste Antworten).

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, openRoute, runSteps, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx
const bar = () => page.getByTestId('tool-bar')
const drawer = () => page.getByTestId('settings-drawer')
const chip = () => page.getByTestId('project-file-chip')
const dir = join(ctx.userData, 'projekte')
const file = join(dir, 'Messe Dornbirn.mottul')

/** Datei-Menü öffnen und einen Eintrag wählen */
async function menu(item) {
  await bar()
    .getByRole('button', { name: /^Datei/ })
    .click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Abschnitt der Schublade aufklappen (bleibt offen, wenn er es schon ist) */
async function expand(title) {
  const head = drawer().getByRole('button', { name: new RegExp(`^${title}`) })
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
}

/** Alle Rückfragen (showMessageBox) mitschreiben und der Reihe nach beantworten */
async function answer(responses) {
  await app.evaluate(({ dialog }, seq) => {
    globalThis.__answers = [...seq]
    globalThis.__asked = []
    dialog.showMessageBox = async (...args) => {
      const o = args[args.length - 1]
      globalThis.__asked.push(`${o.message} | ${o.detail ?? ''} | ${(o.buttons ?? []).join('/')}`)
      return { response: globalThis.__answers.shift() ?? o.cancelId ?? 1, checkboxChecked: false }
    }
  }, responses)
}
const asked = () => app.evaluate(() => globalThis.__asked ?? [])

const openSection = (path) => page.evaluate((p) => window.api.projects.open('ledWall', p), path)

function crc32(buf) {
  let crc = 0xffffffff
  for (const b of buf) {
    crc ^= b
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Projektdatei eines Kollegen mit nur einer Anleitung (ohne LED-Wall) – ZIP ohne Kompression */
function writeForeignProject(path) {
  const name = Buffer.from('projekt.json')
  const data = Buffer.from(
    JSON.stringify({
      app: 'mottulbox',
      type: 'projektdatei',
      version: 1,
      geaendert: '2026-10-16T10:00:00.000Z',
      abschnitte: {
        anleitung: {
          version: 1,
          rev: 3,
          sha256: 'a'.repeat(64),
          geaendert: '2026-10-16T10:00:00.000Z',
          fotos: [],
          data: { titel: 'So bedienst du deine LED-Wall' }
        }
      }
    })
  )
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0800, 6)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(name.length, 28)
  const cdOffset = local.length + name.length + data.length
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + name.length, 12)
  end.writeUInt32LE(cdOffset, 16)
  writeFileSync(path, Buffer.concat([local, name, data, central, name, end]))
}

try {
  await runSteps('Projektdatei', [
    [
      'Projektordner: Standard in Dokumente, eigener Ordner aus den Einstellungen',
      async () => {
        const std = await page.evaluate(() => window.api.projects.dirInfo())
        assert.equal(std.isDefault, true)
        assert.match(std.path, /Mottulbox-Projekte$/)
        mkdirSync(dir, { recursive: true })
        await page.evaluate((d) => window.api.setSettings({ projects: { dir: d } }), dir)
        const own = await page.evaluate(() => window.api.projects.dirInfo())
        assert.deepEqual(own, { path: dir, isDefault: false, exists: true })
      }
    ],
    [
      'LED-Wall ohne Datei: „ohne Datei“, Speichern unter beginnt im Projektordner',
      async () => {
        await openRoute(page, '/')
        await openRoute(page, '/tool/led-wall')
        await bar().waitFor({ timeout: 15_000 })
        await chip().getByText('ohne Datei').waitFor({ timeout: 5_000 })
        await drawer()
          .getByRole('button', { name: /^Projekt/ })
          .click()
        await drawer().getByRole('textbox', { name: 'Projektname' }).fill('Messe Dornbirn')
        await app.evaluate(({ dialog }, target) => {
          globalThis.__saveOpts = null
          dialog.showSaveDialog = async (...args) => {
            globalThis.__saveOpts = args[args.length - 1]
            return { canceled: false, filePath: target }
          }
        }, file)
        await menu(/^Speichern unter/)
        assert.ok(await waitFor(() => existsSync(file), 10_000), 'Datei wurde nicht geschrieben')
        const opts = await app.evaluate(() => globalThis.__saveOpts)
        assert.equal(opts.defaultPath, join(dir, 'Messe Dornbirn.mottul'))
        await chip().getByText('Messe Dornbirn').waitFor({ timeout: 5_000 })
        assert.equal(await chip().getByLabel('ungespeichert').count(), 0)
        const title = await page.evaluate(() => document.title)
        assert.match(title, /^Messe Dornbirn – LED-Wall/)
      }
    ],
    [
      'Änderung -> Punkt „ungespeichert“; Strg+S schreibt Stand 2; Bedienzustand bleibt sauber',
      async () => {
        await drawer()
          .getByLabel(/^Breite/)
          .fill('6')
        await chip().getByLabel('ungespeichert').waitFor({ timeout: 5_000 })
        assert.match(await page.evaluate(() => document.title), /^● Messe Dornbirn/)
        await page.keyboard.press('Control+s')
        assert.ok(
          await waitFor(
            async () => (await chip().getByLabel('ungespeichert').count()) === 0,
            10_000
          )
        )
        const r = await openSection(file)
        assert.equal(r.ok, true)
        assert.equal(r.section.rev, 2)
        assert.equal(r.section.data.widthM, '6')
        assert.equal(r.section.data.projectName, 'Messe Dornbirn')
        assert.equal('sigChain' in r.section.data, false, 'Bedienzustand gehört nicht in die Datei')
        // Bedienzustand (PDF-Format) macht nichts ungespeichert
        await bar().getByRole('button', { name: 'Hoch', exact: true }).click()
        await page.waitForTimeout(300)
        assert.equal(await chip().getByLabel('ungespeichert').count(), 0)
      }
    ],
    [
      'Konflikt: anderswo geänderte Datei wird nicht still überschrieben',
      async () => {
        // „Kollege“ speichert dieselbe Datei mit anderem Inhalt
        const other = await openSection(file)
        const res = await page.evaluate(
          ({ p, data }) =>
            window.api.projects.save({
              path: p,
              section: 'ledWall',
              version: 2,
              data: { ...data, customerName: 'Kollege' },
              baseSha: null,
              force: true
            }),
          { p: file, data: other.section.data }
        )
        assert.equal(res.ok, true)
        assert.equal(res.rev, 3)
        await drawer()
          .getByLabel(/^Breite/)
          .fill('7')
        await chip().getByLabel('ungespeichert').waitFor({ timeout: 5_000 })
        await answer([2]) // Abbrechen
        await page.keyboard.press('Control+s')
        assert.ok(await waitFor(async () => (await asked()).length === 1, 10_000))
        const [q] = await asked()
        assert.match(q, /anderswo geändert \(Stand 3\)/)
        assert.match(q, /Überschreiben\/Speichern unter …\/Abbrechen/)
        const after = await openSection(file)
        assert.equal(after.section.data.customerName, 'Kollege', 'Datei blieb unverändert')
        // jetzt bewusst überschreiben
        await answer([0])
        await page.keyboard.press('Control+s')
        assert.ok(
          await waitFor(async () => (await openSection(file)).section.data.widthM === '7', 10_000)
        )
        assert.equal((await openSection(file)).section.rev, 4)
      }
    ],
    [
      'Neu fragt bei ungespeicherten Änderungen; Verwerfen löst die Bindung',
      async () => {
        await drawer()
          .getByLabel(/^Breite/)
          .fill('8')
        await chip().getByLabel('ungespeichert').waitFor({ timeout: 5_000 })
        await answer([1]) // Verwerfen
        await menu('Neu')
        await chip().getByText('ohne Datei').waitFor({ timeout: 5_000 })
        const [q] = await asked()
        assert.match(q, /Änderungen an „Messe Dornbirn“ speichern\?/)
        assert.equal(await drawer().getByRole('textbox', { name: 'Projektname' }).inputValue(), '')
        assert.equal((await openSection(file)).section.data.widthM, '7', 'Datei unverändert')
      }
    ],
    [
      'Öffnen über den Dialog stellt Planung und Bindung wieder her',
      async () => {
        await app.evaluate(({ dialog }, target) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] })
        }, file)
        await answer([])
        await menu(/^Öffnen/)
        await chip().getByText('Messe Dornbirn').waitFor({ timeout: 5_000 })
        assert.equal(
          await drawer().getByRole('textbox', { name: 'Projektname' }).inputValue(),
          'Messe Dornbirn'
        )
        assert.equal(
          await drawer()
            .getByLabel(/^Breite/)
            .inputValue(),
          '7'
        )
        assert.equal(await chip().getByLabel('ungespeichert').count(), 0)
        assert.equal((await asked()).length, 0, 'leere Vorgabe-Planung braucht keine Rückfrage')
        const recent = await page.evaluate(() => window.api.getSettings())
        assert.equal(recent.projects.recent[0], file)
      }
    ],
    [
      'Strg+O aus einem gepufferten Feld: Entwurf zählt als ungespeichert',
      async () => {
        await expand('Modul')
        await drawer()
          .getByRole('radio', { name: /^uS2\+/ })
          .click()
        await expand('Curving')
        await drawer().getByRole('button', { name: 'Squircle', exact: true }).click()
        await answer([])
        await page.keyboard.press('Control+s')
        assert.ok(
          await waitFor(
            async () => (await chip().getByLabel('ungespeichert').count()) === 0,
            10_000
          )
        )
        // Entwurf im Feld, ohne es zu verlassen – dann Strg+O
        const corner = drawer().getByRole('textbox', { name: 'Module je Ecke' })
        await corner.fill('5')
        await answer([2]) // Abbrechen
        await page.keyboard.press('Control+o')
        assert.ok(await waitFor(async () => (await asked()).length === 1, 10_000))
        assert.match((await asked())[0], /Änderungen an „Messe Dornbirn“ speichern\?/)
        await chip().getByLabel('ungespeichert').waitFor({ timeout: 5_000 })
        await answer([])
        await page.keyboard.press('Control+s')
        assert.ok(
          await waitFor(async () => (await openSection(file)).section.data.sqCorner === 5, 10_000)
        )
      }
    ],
    [
      '„Leere anlegen“: scheitert das Schreiben, bleiben Planung und Bindung',
      async () => {
        const foreign = join(dir, 'Kollege.mottul')
        writeForeignProject(foreign)
        await app.evaluate(({ dialog }, target) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] })
        }, foreign)
        await answer([1]) // „Leere anlegen“
        // Während der Rückfrage verschwindet die Datei (an ihrer Stelle ein Ordner): Schreiben scheitert
        await app.evaluate(({ dialog }, target) => {
          const fs = process.getBuiltinModule('node:fs')
          const recordAndAnswer = dialog.showMessageBox
          dialog.showMessageBox = async (...args) => {
            const o = args[args.length - 1]
            if (/enthält noch keine/.test(o.message)) {
              fs.rmSync(target)
              fs.mkdirSync(target)
            }
            return recordAndAnswer(...args)
          }
        }, foreign)
        await menu(/^Öffnen/)
        assert.ok(await waitFor(async () => (await asked()).length === 2, 10_000))
        const [q, problem] = await asked()
        assert.match(q, /„Kollege“ enthält noch keine LED-Wall-Planung/)
        assert.match(problem, /keine Mottulbox-Projektdatei/)
        assert.ok(statSync(foreign).isDirectory())
        await chip().getByText('Messe Dornbirn').waitFor({ timeout: 5_000 })
        assert.equal(await chip().getByLabel('ungespeichert').count(), 0)
        assert.equal(
          await drawer().getByRole('textbox', { name: 'Projektname' }).inputValue(),
          'Messe Dornbirn'
        )
      }
    ],
    [
      'Schreiben nur in freigegebene .mottul-Pfade',
      async () => {
        const bad = await page.evaluate(
          (p) =>
            window.api.projects.save({
              path: p,
              section: 'ledWall',
              version: 2,
              data: {},
              baseSha: null,
              force: true
            }),
          join(dir, 'fremd.mottul')
        )
        assert.deepEqual(bad, { ok: false, reason: 'nicht-freigegeben' })
        const wrong = await page.evaluate(
          (p) =>
            window.api.projects.save({
              path: p,
              section: 'ledWall',
              version: 2,
              data: {},
              baseSha: null,
              force: true
            }),
          join(dir, 'x.json')
        )
        assert.deepEqual(wrong, { ok: false, reason: 'ungueltig' })
        assert.equal(existsSync(join(dir, 'fremd.mottul')), false)
      }
    ]
  ])
} finally {
  await ctx.close()
}
