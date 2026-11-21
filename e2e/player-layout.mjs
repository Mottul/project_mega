// Video-Player ohne Scrollen (docs/PLAN.md, „Muster 1: Arbeitsfläche“): Bibliothek, Playlist und
// Bühne nebeneinander bzw. übereinander, die Listen scrollen in sich, die Seite nicht. Gemessen
// mit 14 Medien in Bibliothek und Playlist und drei gespeicherten Playlists, bei den Fenstern
// aus dem Plan. Gegen den Stand vor dem Umbau war die Seite bei 1366 × 768 doppelt so hoch wie
// das Fenster (1323 statt 666 px).
//
// Seit P3 auch die Bühne: Restzeit, „Danach“, „Stumm“, Tastenkürzel hinter dem ⓘ, Knopf „FPS“
// über dem Video, Übergang und Bild-Standzeit in der Schublade, Vorschau im Seitenverhältnis der
// Wand.
// Seit P4 die Playlist: Der laufende Eintrag bleibt im sichtbaren Teil der Liste (in der Stufe
// schmal scrollt dabei nur die Liste, die Bühne bleibt stehen), Zeilen mit Griff und Miniatur,
// Marke „Danach“, Umsortieren am Griff und mit den Pfeil-Knöpfen bei laufender Wiedergabe, Ziehen
// aus der Bibliothek, „Speichern“ im Kopf, „Playlist leeren …“ im Menü „⋯“ mit Rückfrage.
// Seit P5 die Bibliothek: Kopf in einer Zeile mit „Importieren“ und „⋯“ (Ansicht, „Alle zur
// Playlist“, „Medienordner öffnen“, „Bibliothek leeren …“), Listen am <body>, Kacheln nach Platz
// im Feld, Suche, gestrichelter Rahmen nur beim Hineinziehen von Dateien, Import-Liste unten
// angeheftet, Papierkorb mit Rückfrage.
// Seit die Schublade in Fenstern unter 1100 px schwebt: bei 1024 × 600 mit offener Schublade die
// Stufe „mittel“ wie ohne (vorher „schmal“), der Wechsel zum Schweben baut nichts neu auf.
// Braucht das gebündelte ffmpeg (Import); ohne wird übersprungen.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findFfmpeg,
  launchApp,
  openRoute,
  runSteps,
  Skip,
  sleep,
  stubConfirm,
  waitFor
} from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx
const ffmpeg = findFfmpeg()
const clipsDir = mkdtempSync(join(tmpdir(), 'mottulbox-e2e-player-layout-'))
const WAND = { width: 1280, height: 720 }

/** Zehn kurze Clips und vier Bilder, Titel unterschiedlich lang */
function testmedien() {
  if (!ffmpeg) throw new Skip('ffmpeg fehlt (npm run ff:fetch)')
  const farben = [
    'red',
    'green',
    'blue',
    'orange',
    'purple',
    'teal',
    'gray',
    'brown',
    'navy',
    'olive'
  ]
  const namen = [
    'Intro Opener',
    'Sponsor Bank',
    'Keynote Vorspann',
    'Pausenloop lang mit einem sehr langen Dateinamen zum Testen',
    'Award Stinger',
    'Logo Loop',
    'Countdown 5 min',
    'Outro',
    'Sponsor Auto',
    'Einspieler Interview'
  ]
  const quellen = []
  namen.forEach((name, i) => {
    const datei = join(clipsDir, `${name}.mp4`)
    execFileSync(ffmpeg, [
      ...[
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${farben[i]}:s=320x180:r=25:d=${3 + i}`
      ],
      ...['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', datei]
    ])
    quellen.push(datei)
  })
  for (let i = 0; i < 4; i++) {
    const datei = join(clipsDir, `Foto ${i + 1}.png`)
    execFileSync(ffmpeg, [
      ...['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${farben[9 - i]}:s=400x300`],
      ...['-frames:v', '1', datei]
    ])
    quellen.push(datei)
  }
  return quellen
}

/** Werkzeug frisch zeigen (erst Start, dann zurück) – liest die Einstellungen neu */
async function playerNeu() {
  await openRoute(page, '/')
  await page.getByPlaceholder('Werkzeug suchen…').waitFor({ timeout: 10_000 })
  await openRoute(page, '/tool/video-player')
  await page.getByTestId('tool-bar').waitFor({ timeout: 10_000 })
}

/** Unter dieser Fensterbreite schwebt die Schublade immer, auch wenn „angeheftet“ gemerkt ist */
const SCHWEBT_UNTER = 1100

/**
 * Schublade öffnen (angeheftet) oder schließen – wie ein Nutzer über den Knopf in der Kopfleiste.
 * In schmalen Fenstern schwebt sie, die Nadel ist dort gesperrt: Dann bleibt „angeheftet“ nur
 * gemerkt und gilt wieder, sobald das Fenster breiter ist.
 */
async function schublade(offen, breite) {
  const lade = page.getByTestId('settings-drawer')
  const ist = async () => (await lade.count()) > 0
  if ((await ist()) !== offen) {
    await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
    assert.ok(await waitFor(async () => (await ist()) === offen, 5_000), 'Schublade reagiert nicht')
  }
  if (!offen) return
  const anheftbar = breite >= SCHWEBT_UNTER
  const nadel = lade.getByRole('button', { name: /^Schublade (anheften|lösen)$/ })
  // Die neue Breite kommt per matchMedia ein Bild später an – erst dann zählt die Nadel
  assert.ok(
    await waitFor(
      async () => ((await nadel.getAttribute('aria-disabled')) === 'true') !== anheftbar
    ),
    `Nadel bei ${breite} px ${anheftbar ? 'gesperrt' : 'bedienbar'}`
  )
  if (anheftbar && (await lade.getAttribute('data-pinned')) !== 'true') await nadel.click()
  assert.ok(
    await waitFor(async () => (await lade.getAttribute('data-pinned')) === String(anheftbar)),
    `Schublade bei ${breite} px: data-pinned=${await lade.getAttribute('data-pinned')}`
  )
}

/** Fenstergröße und Schublade einstellen, dann warten, bis das Raster nachgezogen hat */
async function fenster(width, height, offen = false) {
  await page.setViewportSize({ width, height })
  await schublade(offen, width)
  await sleep(700)
}

/** Maße aus der Seite: Scroll-Bereiche, Felder, Vorschau, Play/Pause, Zeilen der Playlist */
const mass = () =>
  page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }
    }
    const scroll = (el) => (el ? { sh: el.scrollHeight, ch: el.clientHeight } : null)
    const q = (sel) => document.querySelector(sel)
    const liste = q('[data-testid="playlist-liste"]')
    return {
      fenster: { w: innerWidth, h: innerHeight },
      inhalt: scroll(q('[data-testid="tool-content"]')),
      main: scroll(q('[data-testid="tool-main"]')),
      arbeitsflaeche: scroll(q('[data-testid="arbeitsflaeche"]')),
      stufe: q('[data-testid="arbeitsflaeche"]')?.getAttribute('data-stufe') ?? null,
      felder: [...document.querySelectorAll('[data-pane]')].map((el) => ({
        name: el.getAttribute('data-testid'),
        ...scroll(el),
        rect: rect(el)
      })),
      vorschau: rect(q('[data-testid="vorschau"]')),
      play: rect(q('button[aria-label="Play"], button[aria-label="Pause"]')),
      liste: liste ? { ...scroll(liste), rect: rect(liste) } : null,
      zeilen: liste ? [...liste.querySelectorAll(':scope > div')].slice(0, 5).map(rect) : [],
      bibliothek: scroll(q('[data-testid="feld-bibliothek"] [data-pane-inhalt]'))
    }
  })

const innen = (r, f) =>
  r &&
  r.top >= f.top - 1 &&
  r.bottom <= f.bottom + 1 &&
  r.left >= f.left - 1 &&
  r.right <= f.right + 1

/** Prüfung 1: Die Seite scrollt nicht, kein Feld schneidet Inhalt ab */
function keinScrollen(m) {
  for (const [name, s] of [
    ['tool-content', m.inhalt],
    ['Arbeitsfläche von ToolShell', m.main],
    ['Arbeitsfläche des Players', m.arbeitsflaeche]
  ]) {
    assert.ok(s, `${name} fehlt`)
    assert.ok(s.sh <= s.ch + 1, `${name} scrollt: Inhalt ${s.sh} px, sichtbar ${s.ch} px`)
  }
  assert.equal(m.felder.length, 3, `Felder: ${JSON.stringify(m.felder.map((f) => f.name))}`)
  for (const f of m.felder) {
    assert.ok(f.sh <= f.ch + 1, `${f.name} schneidet ab: Inhalt ${f.sh} px, sichtbar ${f.ch} px`)
  }
}

/** Prüfung 2: Vorschau, Play/Pause und die ersten fünf Zeilen der Playlist ganz im Bild */
function allesImBild(m) {
  const bild = { top: 0, left: 0, bottom: m.fenster.h, right: m.fenster.w }
  assert.ok(innen(m.vorschau, bild), `Vorschau nicht ganz im Bild: ${JSON.stringify(m.vorschau)}`)
  assert.ok(innen(m.play, bild), `Play/Pause nicht ganz im Bild: ${JSON.stringify(m.play)}`)
  assert.ok(m.liste, 'Liste der Playlist fehlt')
  assert.equal(m.zeilen.length, 5, `nur ${m.zeilen.length} Zeilen`)
  m.zeilen.forEach((z, i) => {
    assert.ok(
      innen(z, bild) && innen(z, m.liste.rect),
      `Zeile ${i + 1} nicht sichtbar: ${JSON.stringify(z)}, Liste ${JSON.stringify(m.liste.rect)}`
    )
  })
}

/** Text eines Elements der Bühne (leer, wenn es fehlt) */
const buehne = (testId) =>
  page.evaluate(
    (id) =>
      document.querySelector(`[data-testid="feld-buehne"] [data-testid="${id}"]`)?.textContent ??
      '',
    testId
  )
/** Titel der Playlist im main (Reihenfolge wie angezeigt) */
const titel = () =>
  page.evaluate(async () => (await window.api.player.getState()).playlist.map((m) => m.title))
const befehl = (cmd) => page.evaluate((c) => window.api.player.command(c), cmd)
const stand = () => page.evaluate(() => window.api.player.getState())

/** Zeilen der Playlist: die direkten Kinder der Liste (der Leerzustand ist ein <p>) */
const ZEILEN = '[data-testid="playlist-liste"] > div'
const zeilen = () => page.locator(ZEILEN)
/** Kopf des Felds „Playlist“: Titel, Anzahl, „Speichern“, Menü „⋯“ */
const kopf = () => page.locator('[data-testid="feld-playlist"] [data-pane-kopf]')
/** Griff der Zeile i (macht sie erst beim Drücken ziehbar) */
const griff = (i) =>
  page
    .getByTestId('feld-playlist')
    .getByRole('img', { name: 'Eintrag ziehen zum Verschieben' })
    .nth(i)

/** Liegt Zeile i ganz im sichtbaren Teil der Liste? Mit den Maßen für die Fehlermeldung */
const zeileInListe = (i) =>
  page.evaluate(
    ([sel, i]) => {
      const liste = document.querySelector('[data-testid="playlist-liste"]')
      const zeile = document.querySelectorAll(sel)[i]
      if (!liste || !zeile) return null
      const l = liste.getBoundingClientRect()
      const z = zeile.getBoundingClientRect()
      return {
        sichtbar: z.top >= l.top - 1 && z.bottom <= l.bottom + 1,
        zeile: [Math.round(z.top), Math.round(z.bottom)],
        liste: [Math.round(l.top), Math.round(l.bottom)],
        scrollTop: Math.round(liste.scrollTop)
      }
    },
    [ZEILEN, i]
  )
const sichtbar = async (i) => (await zeileInListe(i))?.sichtbar === true

/** Plätze der Zeilen, die die Marke „Danach“ tragen */
const danachZeilen = () =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)]
        .map((z, i) => (z.querySelector('[data-testid="playlist-danach"]') ? i : -1))
        .filter((i) => i >= 0),
    ZEILEN
  )

/**
 * Von Hand ziehen, in Schritten (Skill electron-e2e: nicht `dragTo`): drücken, ein Stück bewegen
 * (das Ziehen startet), dann zum Punkt `x`/`y` und dort loslassen.
 */
async function zieheZu(von, x, y) {
  await von.hover({ timeout: 5_000 })
  const v = await von.boundingBox()
  await page.mouse.down()
  await page.mouse.move(v.x + v.width / 2 + 6, v.y + v.height / 2 + 6, { steps: 4 })
  await page.mouse.move(x, y, { steps: 6 })
  await page.mouse.move(x + 2, y + 1, { steps: 2 })
  await page.mouse.up()
}
/** Auf eine Zeile ziehen – `oben` = ihre obere Hälfte, also „davor“ */
async function ziehe(von, ziel, oben = true) {
  await ziel.scrollIntoViewIfNeeded({ timeout: 5_000 })
  const z = await ziel.boundingBox()
  await zieheZu(von, z.x + 60, oben ? z.y + 5 : z.y + z.height - 7)
}

/** Läuft das Medium in der Vorschau? Zeit und Zustand des `<video>`, das es gerade zeigt */
const vorschauVideo = (id) =>
  page.evaluate((mid) => {
    const v = [...document.querySelectorAll('[data-testid="vorschau"] video')].find(
      (e) => e.style.display === 'block' && (e.getAttribute('src') ?? '').includes(mid)
    )
    return v ? { zeit: v.currentTime, pausiert: v.paused } : null
  }, id)

/** Feld „Bibliothek“ und sein Kopf (Titel, Anzahl, „Importieren“, Menü „⋯“) */
const bib = () => page.getByTestId('feld-bibliothek')
const bibKopf = () => page.locator('[data-testid="feld-bibliothek"] [data-pane-kopf]')
/** Medien im Feld: Kacheln bzw. Zeilen der Liste – ziehbar, damit sie in die Playlist gehen */
const medien = () => bib().locator('[draggable="true"]')
const bibliothek = () => page.evaluate(() => window.api.player.libraryList())

/**
 * Gestrichelte Rahmen im Feld „Bibliothek“ (sichtbare Elemente mit `border-style: dashed`) – der
 * Rahmen fürs Hineinziehen von Dateien
 */
const gestrichelt = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-testid="feld-bibliothek"] *')].filter((el) => {
        const r = el.getBoundingClientRect()
        return getComputedStyle(el).borderTopStyle === 'dashed' && r.width > 0 && r.height > 0
      }).length
  )

/**
 * Ziehen über der Bibliothek nachstellen: die Ereignisse `arten` mit einer Probe-Datei (wie aus
 * dem Explorer: Typ „Files“) oder einem Medium aus der Bibliothek (`text/x-media-id`) an das
 * Element `sel` im Feld schicken. Echte Dateien kann Playwright nicht ziehen.
 */
const ziehUeber = (sel, arten, was) =>
  page.evaluate(
    ([sel, arten, was]) => {
      const ziel = document.querySelector(`[data-testid="feld-bibliothek"] ${sel}`)
      const dt = new DataTransfer()
      if (was === 'datei') dt.items.add(new File(['x'], 'Probe.mp4', { type: 'video/mp4' }))
      else dt.setData('text/x-media-id', 'probe')
      for (const art of arten)
        ziel.dispatchEvent(
          new DragEvent(art, { bubbles: true, cancelable: true, dataTransfer: dt })
        )
    },
    [sel, arten, was]
  )

/** Playlist wie nach der Vorbereitung: alle Medien der Bibliothek, Eintrag 3 läuft */
async function playlistWieVorher() {
  const ids = await page.evaluate(async () =>
    (await window.api.player.libraryList()).map((m) => m.id)
  )
  await befehl({ type: 'replace', mediaIds: ids })
  await befehl({ type: 'goto', index: 2 })
  assert.ok(await waitFor(async () => (await zeilen().count()) === ids.length, 5_000))
}

const FENSTER = [
  [1024, 600, false, 'mittel'],
  [1366, 768, false, 'breit'],
  [1366, 768, true, 'mittel'],
  [1920, 1080, false, 'breit']
]

try {
  await runSteps('Video-Player ohne Scrollen', [
    [
      'Vorbereitung: 14 Medien in Bibliothek und Playlist, drei gespeicherte Playlists',
      async () => {
        const quellen = testmedien()
        await page.evaluate(
          (w) => window.api.setSettings({ player: { wallWidth: w.width, wallHeight: w.height } }),
          WAND
        )
        await playerNeu()
        await page.evaluate(
          ([sources, wall]) => window.api.player.import({ sources, fitMode: 'bars', wall }),
          [quellen, WAND]
        )
        const fertig = await waitFor(
          async () => (await page.evaluate(() => window.api.player.libraryList())).length >= 14,
          180_000,
          1_000
        )
        assert.ok(fertig, 'Import nicht fertig')
        await page.evaluate(() => window.api.player.convertClearFinished())
        const ids = await page.evaluate(async () =>
          (await window.api.player.libraryList()).map((m) => m.id)
        )
        await page.evaluate(
          (ids) => window.api.player.command({ type: 'replace', mediaIds: ids }),
          ids
        )
        await page.evaluate(
          (ids) =>
            window.api.setSettings({
              player: {
                savedPlaylists: [
                  { name: 'Gala Abend', mediaIds: ids },
                  { name: 'Pause', mediaIds: ids.slice(0, 3) },
                  { name: 'Sponsoren', mediaIds: ids.slice(3, 7) }
                ]
              }
            }),
          ids
        )
        await playerNeu()
        await page.evaluate(() => window.api.player.command({ type: 'goto', index: 2 }))
        await sleep(500)
      }
    ],
    ...FENSTER.flatMap(([w, h, offen, erwartet]) => {
      const name = `${w} × ${h}, Schublade ${offen ? 'angeheftet' : 'zu'}`
      return [
        [
          `${name}: Seite scrollt nicht, Stufe „${erwartet}“`,
          async () => {
            await fenster(w, h, offen)
            const m = await mass()
            assert.equal(m.fenster.w, w)
            keinScrollen(m)
            assert.equal(m.stufe, erwartet)
          }
        ],
        [
          `${name}: Vorschau, Play/Pause und fünf Zeilen der Playlist im Bild`,
          async () => {
            await fenster(w, h, offen)
            allesImBild(await mass())
          }
        ]
      ]
    }),
    [
      '1024 × 600, Schublade offen und angeheftet gemerkt: Sie schwebt, Stufe „mittel“ wie ohne Schublade',
      async () => {
        // Vor dem Schweben nahm sie 360 px: Arbeitsfläche 664 px breit, Stufe „schmal“
        await fenster(1024, 600, true)
        const m = await mass()
        assert.equal(m.fenster.w, 1024)
        assert.equal(await page.getByTestId('settings-drawer').getAttribute('data-pinned'), 'false')
        keinScrollen(m)
        assert.equal(m.stufe, 'mittel')
        // die Arbeitsfläche hat die ganze Breite, die Schublade liegt darüber
        const breite = await page
          .getByTestId('arbeitsflaeche')
          .evaluate((el) => el.getBoundingClientRect().width)
        assert.ok(breite >= 1023, `Arbeitsfläche nur ${breite} px breit`)
        await fenster(1024, 600)
      }
    ],
    [
      'Wechsel der Stufe baut die laufende Wiedergabe nicht neu auf (breit → mittel → schmal → breit)',
      async () => {
        await fenster(1366, 768)
        const markieren = () =>
          page.evaluate(() => {
            const v = document.querySelector('[data-testid="vorschau"] video')
            if (!v) return false
            v.__marke = 1
            return true
          })
        const nochDa = () =>
          page.evaluate(
            () => document.querySelector('[data-testid="vorschau"] video')?.__marke === 1
          )
        assert.ok(await markieren(), 'kein <video> in der Vorschau')
        for (const [w, h, offen] of [
          [1366, 768, true],
          // die Schublade wechselt von angeheftet zu schwebend, die Arbeitsfläche wird breiter
          [1024, 600, true],
          [700, 600, false],
          [1366, 768, false]
        ]) {
          await fenster(w, h, offen)
          assert.ok(await nochDa(), `nach ${w} × ${h} ist die Engine neu aufgebaut`)
        }
      }
    ],
    [
      'Bühne: Restzeit groß, Tastenkürzel hinter dem ⓘ statt als Zeile',
      async () => {
        await fenster(1366, 768)
        assert.match(await buehne('restzeit'), /^−\d+:\d\d$/, 'Restzeit fehlt oder falsch')
        const tip = page.getByTestId('feld-buehne').getByRole('button', { name: 'Tastenkürzel' })
        assert.equal(await tip.count(), 1, 'kein ⓘ für die Tastenkürzel')
        const zeile = await page
          .getByTestId('feld-buehne')
          .getByText('Leertaste Play/Pause')
          .count()
        assert.equal(zeile, 0, 'Tastenkürzel stehen noch als Zeile in der Bühne')
      }
    ],
    [
      'Bühne: „Danach“ nennt den nächsten Titel, mit Loop „Eines“ den laufenden, am Ende „Ende“',
      async () => {
        const t = await titel()
        try {
          await befehl({ type: 'goto', index: 2 })
          assert.ok(
            await waitFor(async () => (await buehne('danach')) === `Danach: ${t[3]}`, 5_000),
            `Danach: „${await buehne('danach')}“, erwartet „${t[3]}“`
          )
          await befehl({ type: 'setLoop', loop: 'one' })
          assert.ok(
            await waitFor(async () => (await buehne('danach')) === `Danach: ${t[2]}`, 5_000),
            `Loop Eines: „${await buehne('danach')}“`
          )
          await befehl({ type: 'setLoop', loop: 'none' })
          await befehl({ type: 'goto', index: t.length - 1 })
          assert.ok(
            await waitFor(async () => (await buehne('danach')) === 'Danach: Ende', 5_000),
            `am Ende: „${await buehne('danach')}“`
          )
        } finally {
          await befehl({ type: 'setLoop', loop: 'all' })
          await befehl({ type: 'goto', index: 2 })
        }
      }
    ],
    [
      'Bühne: „Stumm“ steht da, solange stumm geschaltet ist (frisches Profil)',
      async () => {
        assert.equal(await buehne('ton'), 'Stumm')
        await page
          .getByTestId('feld-buehne')
          .getByRole('button', { name: 'Ton einschalten' })
          .click()
        assert.ok(
          await waitFor(async () => (await buehne('ton')) !== 'Stumm', 5_000),
          'bleibt Stumm'
        )
        await page.getByTestId('feld-buehne').getByRole('button', { name: 'Stummschalten' }).click()
        assert.ok(await waitFor(async () => (await buehne('ton')) === 'Stumm', 5_000))
      }
    ],
    [
      'Vorschau: Knopf „FPS“ in der Vorschau, erst beim Darüberfahren sichtbar, über dem Video',
      async () => {
        await fenster(1366, 768)
        const vorschau = page.getByTestId('vorschau')
        const knopf = vorschau.getByRole('button', { name: 'FPS' })
        const deckkraft = () =>
          knopf.evaluate((el) => getComputedStyle(el.parentElement).opacity, undefined, {
            timeout: 5_000
          })
        await page.mouse.move(5, 5)
        assert.ok(
          await waitFor(async () => (await deckkraft()) === '0', 2_000),
          'ohne Maus sichtbar'
        )
        await vorschau.hover()
        assert.ok(await waitFor(async () => (await deckkraft()) === '1', 2_000), 'erscheint nicht')
        // Die Video-Ebenen der Engine tragen z-index bis 10 – ein Knopf darunter wäre unsichtbar
        // und nicht klickbar; click() scheitert dann („intercepts pointer events“).
        await knopf.click({ timeout: 5_000 })
        assert.equal(await knopf.getAttribute('aria-pressed'), 'true')
        await knopf.click({ timeout: 5_000 })
        assert.equal(await knopf.getAttribute('aria-pressed'), 'false')
      }
    ],
    [
      'Übergang und Bild-Standzeit stehen in der Schublade („Wiedergabe“), nicht mehr in der Bühne',
      async () => {
        const feld = page.getByTestId('feld-buehne')
        assert.equal(
          await feld.getByText('Bild-Standzeit').count(),
          0,
          'Standzeit noch in der Bühne'
        )
        assert.equal(await feld.locator('select').count(), 0, 'Übergang noch in der Bühne')
        await fenster(1366, 768, true)
        const lade = page.getByTestId('settings-drawer')
        try {
          const bereich = lade.getByRole('button', { name: /^Wiedergabe/ })
          assert.equal(await bereich.count(), 1, 'kein Bereich „Wiedergabe“')
          assert.match((await bereich.textContent()) ?? '', /Schnitt · Bilder 10 s/)
          await lade.getByRole('combobox', { name: 'Übergang' }).selectOption('crossfade')
          assert.ok(
            await waitFor(
              async () =>
                (await page.evaluate(() => window.api.player.getState())).transition ===
                'crossfade',
              5_000
            ),
            'Übergang kommt nicht im main an'
          )
          assert.match((await bereich.textContent()) ?? '', /Überblenden 0,5 s · Bilder 10 s/)
        } finally {
          await befehl({ type: 'setTransition', transition: 'cut' })
          await fenster(1366, 768)
        }
      }
    ],
    [
      'Vorschau im Seitenverhältnis der Wand: 3840 × 1080 über die Schublade gestellt',
      async () => {
        await fenster(1366, 768, true)
        const lade = page.getByTestId('settings-drawer')
        const setze = async (name, wert) => {
          const f = lade.getByRole('textbox', { name, exact: true })
          await f.fill(String(wert))
          await f.press('Tab')
        }
        try {
          await setze('Breite', 3840)
          await setze('Höhe', 1080)
          await fenster(1366, 768)
          const verh = async () => {
            const v = (await mass()).vorschau
            return v ? v.right - v.left : 0
          }
          assert.ok(
            await waitFor(async () => {
              const m = await mass()
              const breite = m.vorschau.right - m.vorschau.left
              return breite / m.vorschau.height > 3.4 && breite / m.vorschau.height < 3.7
            }, 5_000),
            `Vorschau ${JSON.stringify((await mass()).vorschau)} (Breite ${await verh()})`
          )
          keinScrollen(await mass())
        } finally {
          await page.evaluate(
            (w) => window.api.setSettings({ player: { wallWidth: w.width, wallHeight: w.height } }),
            WAND
          )
          await playerNeu()
          await fenster(1366, 768)
        }
      }
    ],
    [
      '1024 × 600: Playlist und Bibliothek scrollen in sich',
      async () => {
        await fenster(1024, 600)
        const m = await mass()
        assert.ok(m.liste && m.liste.sh > m.liste.ch, `Playlist: ${JSON.stringify(m.liste)}`)
        assert.ok(
          m.bibliothek && m.bibliothek.sh > m.bibliothek.ch,
          `Bibliothek: ${JSON.stringify(m.bibliothek)}`
        )
      }
    ],
    [
      '1920 × 1080: Die Vorschau nimmt höchstens 60 % der Höhe',
      async () => {
        await fenster(1920, 1080)
        const m = await mass()
        assert.ok(m.vorschau && m.main, 'Vorschau oder Arbeitsfläche fehlt')
        assert.ok(
          m.vorschau.height <= 0.6 * m.main.ch,
          `Vorschau ${m.vorschau.height} px von ${m.main.ch} px`
        )
      }
    ],
    [
      '700 × 600: eine Spalte, die Arbeitsfläche scrollt, Bühne vor Playlist vor Bibliothek',
      async () => {
        await fenster(700, 600)
        const m = await mass()
        assert.equal(m.stufe, 'schmal')
        const scrollt = [m.arbeitsflaeche, m.main].some((s) => s && s.sh > s.ch + 1)
        assert.ok(scrollt, `nichts scrollt: ${JSON.stringify({ a: m.arbeitsflaeche, m: m.main })}`)
        const top = (name) => m.felder.find((f) => f.name === name)?.rect.top
        assert.ok(top('feld-buehne') < top('feld-playlist'), 'Bühne steht nicht vor der Playlist')
        assert.ok(
          top('feld-playlist') < top('feld-bibliothek'),
          'Playlist steht nicht vor der Bibliothek'
        )
      }
    ],
    [
      'Playlist: Der laufende Eintrag bleibt sichtbar – „goto“ auf den letzten, dann auf den ersten',
      async () => {
        await fenster(1024, 600)
        const letzter = (await titel()).length - 1
        // Die Maus weg von der Liste: Solange sie darüber ist, rückt die Liste nicht nach
        await page.mouse.move(1, 1)
        try {
          await befehl({ type: 'goto', index: 0 })
          assert.ok(
            await waitFor(() => sichtbar(0), 5_000),
            `erster Eintrag nicht sichtbar: ${JSON.stringify(await zeileInListe(0))}`
          )
          // Vorbedingung: Der letzte liegt unter dem Rand der Liste – sonst prüfte der Schritt nichts
          const vorher = await zeileInListe(letzter)
          assert.ok(vorher && !vorher.sichtbar, `Liste scrollt nicht: ${JSON.stringify(vorher)}`)
          await befehl({ type: 'goto', index: letzter })
          assert.ok(
            await waitFor(() => sichtbar(letzter), 5_000),
            `Zeile ${letzter + 1} liegt nicht im sichtbaren Teil der Liste: ${JSON.stringify(await zeileInListe(letzter))}`
          )
          // Maus über der Liste: Nichts rückt unter dem Zeiger weg (ein Klick auf ✕ träfe sonst
          // einen anderen Eintrag); geht sie, holt die Liste es nach
          const l = await page.getByTestId('playlist-liste').boundingBox()
          const mitte = [l.x + l.width / 2, l.y + l.height / 2]
          await page.mouse.move(mitte[0], mitte[1], { steps: 3 })
          await befehl({ type: 'goto', index: 0 })
          await sleep(800)
          assert.ok(
            !(await sichtbar(0)),
            `die Liste ist unter der Maus nachgerückt: ${JSON.stringify(await zeileInListe(0))}`
          )
          await page.mouse.move(1, 1, { steps: 3 })
          assert.ok(
            await waitFor(() => sichtbar(0), 5_000),
            `nach dem Verlassen nicht nachgeholt: ${JSON.stringify(await zeileInListe(0))}`
          )
          // Bleibt die Maus still über der Liste liegen (in der Show üblich), rückt sie nach drei
          // Sekunden trotzdem nach – sonst folgte sie nie mehr
          await page.mouse.move(mitte[0], mitte[1], { steps: 3 })
          await befehl({ type: 'goto', index: letzter })
          // angehalten: Der letzte Clip ist 3 s lang – endete er, folgte die Liste zu Recht dem
          // nächsten Eintrag
          await befehl({ type: 'pause' })
          await sleep(800)
          assert.ok(!(await sichtbar(letzter)), 'schon nach 0,8 s unter der Maus nachgerückt')
          assert.ok(
            await waitFor(() => sichtbar(letzter), 5_000),
            `mit ruhender Maus nicht nachgerückt: ${JSON.stringify(await zeileInListe(letzter))}`
          )
        } finally {
          await page.mouse.move(1, 1)
          await befehl({ type: 'goto', index: 2 })
        }
      }
    ],
    [
      'Playlist, Stufe „schmal“: Nur die Liste scrollt zum laufenden Eintrag, die Bühne bleibt stehen',
      async () => {
        await fenster(700, 600)
        const letzter = (await titel()).length - 1
        const BEREICHE = ['arbeitsflaeche', 'tool-main', 'tool-content']
        const oben = () =>
          page.evaluate(
            (ids) =>
              ids.map((id) => document.querySelector(`[data-testid="${id}"]`)?.scrollTop ?? -1),
            BEREICHE
          )
        await page.mouse.move(1, 1)
        try {
          await page.evaluate((ids) => {
            for (const id of ids) document.querySelector(`[data-testid="${id}"]`).scrollTop = 0
          }, BEREICHE)
          await befehl({ type: 'goto', index: 0 })
          assert.ok(await waitFor(() => sichtbar(0), 5_000), 'erster Eintrag nicht sichtbar')
          const vorher = await zeileInListe(letzter)
          assert.ok(vorher && !vorher.sichtbar, `Liste scrollt nicht: ${JSON.stringify(vorher)}`)
          await befehl({ type: 'goto', index: letzter })
          assert.ok(
            await waitFor(() => sichtbar(letzter), 5_000),
            `Zeile ${letzter + 1} liegt nicht im sichtbaren Teil der Liste: ${JSON.stringify(await zeileInListe(letzter))}`
          )
          // scrollIntoView rückte auch die Arbeitsfläche nach – Vorschau und Transport wanderten
          // bei jedem Titelwechsel aus dem Bild
          assert.deepEqual(await oben(), [0, 0, 0], 'die Arbeitsfläche ist mitgescrollt')
        } finally {
          await befehl({ type: 'goto', index: 2 })
        }
      }
    ],
    [
      'Playlist: jede Zeile mit Griff und Miniatur 40 × 22 px, ohne Griff nicht ziehbar, der laufende Eintrag markiert',
      async () => {
        await fenster(1366, 768)
        await befehl({ type: 'goto', index: 2 })
        const liste = (await stand()).playlist
        assert.ok(liste[0].thumbUrl, 'Vorbedingung: das erste Medium hat eine Miniatur')
        assert.ok(
          await waitFor(async () => (await griff(0).count()) === 1, 5_000),
          'kein Griff an der ersten Zeile'
        )
        assert.equal(await griff(liste.length - 1).count(), 1, 'nicht jede Zeile hat einen Griff')
        const bild = await zeilen().first().locator('img').boundingBox({ timeout: 5_000 })
        assert.ok(
          bild && Math.abs(bild.width - 40) <= 0.5 && Math.abs(bild.height - 22) <= 0.5,
          `Miniatur ${JSON.stringify(bild)}`
        )
        assert.notEqual(
          await zeilen().first().getAttribute('draggable'),
          'true',
          'Zeile ist ohne Griff ziehbar'
        )
        assert.ok(
          await waitFor(
            async () => (await zeilen().nth(2).getAttribute('aria-current')) === 'true',
            5_000
          ),
          'laufender Eintrag nicht markiert'
        )
        assert.equal(await page.locator(`${ZEILEN}[aria-current="true"]`).count(), 1)
      }
    ],
    [
      'Playlist: „Danach“ steht am nächsten Eintrag – bei Zufall am gewürfelten, mit Loop „Eines“ am laufenden, am Ende an keinem',
      async () => {
        const n = (await titel()).length
        const marke = async (soll, wann) => {
          const passt = async () => JSON.stringify(await danachZeilen()) === JSON.stringify(soll)
          assert.ok(
            await waitFor(passt, 5_000),
            `${wann}: Marke an ${JSON.stringify(await danachZeilen())}, erwartet ${JSON.stringify(soll)}`
          )
        }
        try {
          // angehalten: Ein kurzer Clip rückte sonst mitten im Schritt weiter
          await befehl({ type: 'goto', index: 2 })
          await befehl({ type: 'pause' })
          await marke([3], 'Eintrag 3 läuft')
          await befehl({ type: 'setShuffle', shuffle: true })
          const wurf = (await stand()).shuffleNext
          assert.ok(wurf >= 0 && wurf !== 2, `shuffleNext ${wurf}`)
          await marke([wurf], 'Zufall')
          await befehl({ type: 'setShuffle', shuffle: false })
          await befehl({ type: 'setLoop', loop: 'one' })
          await marke([2], 'Loop Eines')
          await befehl({ type: 'setLoop', loop: 'none' })
          await befehl({ type: 'goto', index: n - 1 })
          await befehl({ type: 'pause' })
          await marke([], 'am Ende ohne Loop')
        } finally {
          await befehl({ type: 'setShuffle', shuffle: false })
          await befehl({ type: 'setLoop', loop: 'all' })
          await befehl({ type: 'goto', index: 2 })
        }
      }
    ],
    [
      'Playlist umsortieren, während es läuft: am Griff ziehen, dann mit den Pfeil-Knöpfen – die Wiedergabe läuft durch',
      async () => {
        await fenster(1366, 768)
        const ids = async () => (await stand()).playlist.map((m) => m.id)
        const reihenfolge = async (soll, wann) =>
          assert.ok(
            await waitFor(async () => JSON.stringify(await ids()) === JSON.stringify(soll), 5_000),
            `${wann}: ${JSON.stringify(await titel())}`
          )
        /** Der längste Clip läuft (12 s – genug Zeit zum Ziehen); liefert, woran „läuft durch“ hängt */
        const starte = async () => {
          const liste = (await stand()).playlist
          const lang = liste.reduce(
            (b, m, i) => ((m.durationSec ?? 0) > (liste[b].durationSec ?? 0) ? i : b),
            0
          )
          await befehl({ type: 'goto', index: lang })
          const id = liste[lang].id
          assert.ok(
            await waitFor(async () => {
              const v = await vorschauVideo(id)
              return v && !v.pausiert && v.zeit > 0.2
            }, 10_000),
            `Clip läuft nicht an: ${JSON.stringify(await vorschauVideo(id))}`
          )
          return { id, seekSeq: (await stand()).seekSeq, zeit: (await vorschauVideo(id)).zeit }
        }
        /** Dasselbe Medium läuft weiter: nicht neu geladen (seekSeq), nicht angehalten, Zeit läuft */
        const laeuftDurch = async (vor, wann) => {
          const s = await stand()
          assert.equal(s.playlist[s.index]?.id, vor.id, `${wann}: ein anderes Medium läuft`)
          assert.equal(s.playing, true, `${wann}: angehalten`)
          assert.equal(s.seekSeq, vor.seekSeq, `${wann}: Medium neu gestartet`)
          const v = await vorschauVideo(vor.id)
          assert.ok(v && !v.pausiert && v.zeit > vor.zeit, `${wann}: ${JSON.stringify(v)}`)
        }
        try {
          // 1. Ziehen: den letzten Eintrag am Griff vor den ersten
          let vor = await starte()
          let alt = await ids()
          const n = alt.length
          await ziehe(griff(n - 1), zeilen().first())
          await reihenfolge([alt[n - 1], ...alt.slice(0, n - 1)], 'nach dem Ziehen')
          await laeuftDurch(vor, 'nach dem Ziehen')
          assert.notEqual(
            await zeilen().first().getAttribute('draggable'),
            'true',
            'Zeile bleibt nach dem Ziehen ziehbar'
          )

          // 2. Tastatur: „nach unten“ zweimal mit Enter – der Fokus bleibt am Knopf der Zeile
          vor = await starte()
          alt = await ids()
          const runter = (i) => zeilen().nth(i).getByRole('button', { name: 'Eintrag nach unten' })
          // Breite der beiden Pfeile (unsichtbar ist ihr Rahmen 1 px breit, sr-only)
          const pfeile = (i) =>
            runter(i).evaluate((el) => el.parentElement.getBoundingClientRect().width, undefined, {
              timeout: 5_000
            })
          assert.ok(
            (await pfeile(0)) <= 1,
            `Pfeile ohne Tastaturfokus sichtbar: ${await pfeile(0)}`
          )
          await runter(0).focus({ timeout: 5_000 })
          await page.keyboard.press('Enter')
          await reihenfolge([alt[1], alt[0], ...alt.slice(2)], 'einmal nach unten')
          assert.ok(
            await waitFor(() => runter(1).evaluate((el) => el === document.activeElement), 5_000),
            'der Fokus ist nach dem Verschieben nicht mehr am Knopf'
          )
          // mit der Tastatur erreicht, sind die Pfeile zu sehen
          assert.ok((await pfeile(1)) > 30, `Pfeile mit Tastaturfokus ${await pfeile(1)} px breit`)
          await page.keyboard.press('Enter')
          await reihenfolge([alt[1], alt[2], alt[0], ...alt.slice(3)], 'zweimal nach unten')
          await laeuftDurch(vor, 'nach den Pfeil-Knöpfen')
        } finally {
          await playlistWieVorher()
        }
      }
    ],
    [
      'Playlist: Medium aus der Bibliothek auf eine Zeile ziehen fügt es einmal ein, davor; auf die freie Fläche ans Ende; in die leere Liste',
      async () => {
        await fenster(1366, 768)
        const kachel = (i) =>
          page.getByTestId('feld-bibliothek').locator('[draggable="true"]').nth(i)
        const lib = (await page.evaluate(() => window.api.player.libraryList())).map((m) => m.id)
        const ids = async () => (await stand()).playlist.map((m) => m.id)
        const reihenfolge = async (soll, wann) =>
          assert.ok(
            await waitFor(async () => JSON.stringify(await ids()) === JSON.stringify(soll), 5_000),
            `${wann}: ${(await ids()).length} Einträge, erwartet ${soll.length} – ${JSON.stringify(await titel())}`
          )
        const freieFlaeche = async () => {
          const l = await page.getByTestId('playlist-liste').boundingBox()
          return [l.x + l.width / 2, l.y + l.height - 24]
        }
        try {
          const alt = await ids()
          await ziehe(kachel(0), zeilen().nth(1))
          await reihenfolge([alt[0], lib[0], ...alt.slice(1)], 'auf die zweite Zeile')

          await befehl({ type: 'replace', mediaIds: [lib[0], lib[1]] })
          assert.ok(await waitFor(async () => (await zeilen().count()) === 2, 5_000))
          await zieheZu(kachel(2), ...(await freieFlaeche()))
          await reihenfolge([lib[0], lib[1], lib[2]], 'auf die freie Fläche')

          await befehl({ type: 'clear' })
          assert.ok(await waitFor(async () => (await zeilen().count()) === 0, 5_000))
          await zieheZu(kachel(3), ...(await freieFlaeche()))
          await reihenfolge([lib[3]], 'in die leere Liste')
        } finally {
          await playlistWieVorher()
        }
      }
    ],
    [
      'Playlist: „Speichern“ steht im Kopf – Name und Enter speichern, Esc verwirft',
      async () => {
        await fenster(1366, 768)
        const gespeichert = async () =>
          (await page.evaluate(() => window.api.getSettings())).player.savedPlaylists
        const feld = page.getByTestId('feld-playlist')
        const speichern = kopf().getByRole('button', { name: 'Speichern', exact: true })
        const name = kopf().getByRole('textbox', { name: 'Name der Playlist' })
        const n = (await titel()).length
        try {
          await speichern.click({ timeout: 5_000 })
          await name.fill('P4 Probe')
          await name.press('Enter')
          assert.ok(
            await waitFor(
              async () =>
                (await gespeichert()).some((p) => p.name === 'P4 Probe' && p.mediaIds.length === n),
              5_000
            ),
            JSON.stringify((await gespeichert()).map((p) => [p.name, p.mediaIds.length]))
          )
          await feld
            .getByRole('button', { name: 'Playlist „P4 Probe“ löschen' })
            .waitFor({ timeout: 5_000 })
          await speichern.click({ timeout: 5_000 })
          await name.fill('Verworfen')
          await name.press('Escape')
          await speichern.waitFor({ timeout: 5_000 })
          assert.ok(!(await gespeichert()).some((p) => p.name === 'Verworfen'), 'Esc speichert')
        } finally {
          await stubConfirm(app, true)
          const weg = feld.getByRole('button', { name: 'Playlist „P4 Probe“ löschen' })
          if (await weg.count()) await weg.click()
          await waitFor(
            async () => !(await gespeichert()).some((p) => p.name === 'P4 Probe'),
            5_000
          )
        }
      }
    ],
    [
      'Playlist leeren … steht im Menü „⋯“ und fragt nach: Abbrechen lässt die Liste, Bestätigen leert sie',
      async () => {
        await fenster(1366, 768)
        const n = (await titel()).length
        assert.ok(n > 0, 'Vorbedingung: die Playlist hat Einträge')
        const mehr = kopf().getByRole('button', { name: 'Mehr zur Playlist' })
        const eintrag = page.getByRole('menuitem', { name: 'Playlist leeren …' })
        try {
          // das Menü: Esc und ein Klick daneben schließen es
          await mehr.click({ timeout: 5_000 })
          await eintrag.waitFor({ timeout: 5_000 })
          await page.keyboard.press('Escape')
          await eintrag.waitFor({ state: 'detached', timeout: 5_000 })
          await mehr.click()
          await eintrag.waitFor({ timeout: 5_000 })
          await page.getByTestId('feld-playlist').getByRole('heading', { name: 'Playlist' }).click()
          await eintrag.waitFor({ state: 'detached', timeout: 5_000 })

          await stubConfirm(app, false)
          await mehr.click()
          await eintrag.click({ timeout: 5_000 })
          await eintrag.waitFor({ state: 'detached', timeout: 5_000 })
          await sleep(600)
          assert.equal(
            (await titel()).length,
            n,
            'nach „Abbrechen“ hat die Playlist weniger Einträge'
          )
          assert.equal(await zeilen().count(), n)

          await stubConfirm(app, true)
          await mehr.click()
          await eintrag.click({ timeout: 5_000 })
          assert.ok(
            await waitFor(async () => (await titel()).length === 0, 5_000),
            'nach „Leeren“ ist die Playlist nicht leer'
          )
          assert.ok(await waitFor(async () => (await zeilen().count()) === 0, 5_000))
          // leer: nichts zu speichern, nichts zu leeren
          assert.equal(
            await kopf().getByRole('button', { name: 'Speichern', exact: true }).isDisabled(),
            true
          )
          await mehr.click()
          assert.equal(await eintrag.isDisabled(), true, '„Playlist leeren …“ bei leerer Playlist')
          await page.keyboard.press('Escape')
          await eintrag.waitFor({ state: 'detached', timeout: 5_000 })
        } finally {
          await playlistWieVorher()
        }
      }
    ],
    [
      'Bibliothek: Kopf in einer Zeile – „Importieren“ und „⋯“ statt Ansicht, „Dateien“ und zweimal „Ordner“',
      async () => {
        for (const [w, h, offen] of [
          [1366, 768, false],
          [1366, 768, true],
          [1024, 600, false]
        ]) {
          await fenster(w, h, offen)
          const k = await bibKopf().boundingBox({ timeout: 5_000 })
          assert.ok(
            k && k.height <= 41,
            `${w} × ${h}${offen ? ', Schublade angeheftet' : ''}: Kopf der Bibliothek ${k && Math.round(k.height)} px hoch, eine Zeile sind 40 px`
          )
        }
        await fenster(1366, 768)
        for (const name of ['Importieren', 'Mehr zur Bibliothek']) {
          const n = await bibKopf().getByRole('button', { name, exact: true }).count()
          assert.equal(n, 1, `Knopf „${name}“ im Kopf: ${n}`)
        }
        // Ansicht, „Dateien“ und „Ordner“ (oben Import, in der Fußzeile der Medienordner)
        for (const name of ['Große Kacheln', 'Liste', 'Dateien', 'Ordner']) {
          const n = await bib().getByRole('button', { name, exact: true }).count()
          assert.equal(n, 0, `Knopf „${name}“ steht noch ${n}× im Feld`)
        }
      }
    ],
    [
      'Bibliothek: „Importieren“ – „Dateien …“ fragt nach mehreren Dateien, „Ordner …“ nach einem Ordner',
      async () => {
        await fenster(1366, 768)
        // Datei-Dialog ersetzen: merken, wonach gefragt wird, nichts wählen
        await app.evaluate(({ dialog }) => {
          globalThis.__dialoge = []
          globalThis.__showOpenDialog ??= dialog.showOpenDialog
          dialog.showOpenDialog = async (...args) => {
            globalThis.__dialoge.push(args.at(-1).properties)
            return { canceled: true, filePaths: [] }
          }
        })
        const dialoge = () => app.evaluate(() => globalThis.__dialoge)
        const knopf = bibKopf().getByRole('button', { name: 'Importieren', exact: true })
        try {
          for (const [i, eintrag] of ['Dateien …', 'Ordner …'].entries()) {
            await knopf.click({ timeout: 5_000 })
            await page.getByRole('menuitem', { name: eintrag }).click({ timeout: 5_000 })
            assert.ok(
              await waitFor(async () => (await dialoge()).length === i + 1, 5_000),
              `„${eintrag}“ öffnet keinen Dialog`
            )
          }
          assert.deepEqual(await dialoge(), [['openFile', 'multiSelections'], ['openDirectory']])
        } finally {
          await app.evaluate(({ dialog }) => {
            if (globalThis.__showOpenDialog) dialog.showOpenDialog = globalThis.__showOpenDialog
          })
        }
      }
    ],
    [
      'Bibliothek, 1024 × 600: Die Listen von „Importieren“ und „⋯“ hängen am <body> und liegen ganz im Fenster, obwohl das Feld niedrig ist',
      async () => {
        await fenster(1024, 600)
        for (const [name, letzter] of [
          ['Importieren', 'Ordner …'],
          ['Mehr zur Bibliothek', 'Bibliothek leeren …']
        ]) {
          await bibKopf().getByRole('button', { name, exact: true }).click({ timeout: 5_000 })
          const liste = page.getByRole('menu')
          await liste.waitFor({ timeout: 5_000 })
          const lage = await liste.evaluate((el) => {
            const r = el.getBoundingClientRect()
            return {
              amBody: el.parentElement === document.body,
              oben: r.top,
              unten: r.bottom,
              links: r.left,
              rechts: r.right,
              fenster: [innerWidth, innerHeight]
            }
          })
          assert.ok(lage.amBody, `${name}: Die Liste hängt nicht am <body>`)
          assert.ok(
            lage.oben >= 0 &&
              lage.links >= 0 &&
              lage.unten <= lage.fenster[1] &&
              lage.rechts <= lage.fenster[0],
            `${name}: Liste ragt aus dem Fenster – ${JSON.stringify(lage)}`
          )
          // der letzte Eintrag ist zu sehen und klickbar (Probeklick, löst nichts aus)
          await page.getByRole('menuitem', { name: letzter }).click({ trial: true, timeout: 5_000 })
          await page.keyboard.press('Escape')
          await liste.waitFor({ state: 'detached', timeout: 5_000 })
        }
      }
    ],
    [
      'Bibliothek: Kacheln nach dem Platz im Feld (groß ab 170 px, klein ab 110 px), Ansicht im Menü „⋯“ mit Häkchen',
      async () => {
        const mehr = bibKopf().getByRole('button', { name: 'Mehr zur Bibliothek' })
        const ansicht = async (name) => {
          await mehr.click({ timeout: 5_000 })
          await page.getByRole('menuitemradio', { name }).click({ timeout: 5_000 })
          await page.getByRole('menu').waitFor({ state: 'detached', timeout: 5_000 })
        }
        const gewaehlt = async () => {
          await mehr.click({ timeout: 5_000 })
          await page.getByRole('menu').waitFor({ timeout: 5_000 })
          const an = await page.getByRole('menuitemradio', { checked: true }).allTextContents()
          await page.keyboard.press('Escape')
          await page.getByRole('menu').waitFor({ state: 'detached', timeout: 5_000 })
          return an
        }
        const breiten = () =>
          medien().evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
        // auto-fill: jede Kachel mindestens so breit wie die Vorgabe; passte noch eine daneben
        // (2 × Vorgabe + Abstand 8 px), wäre es eine Spalte mehr
        const passt = async (min, wo) => {
          const b = await breiten()
          assert.ok(
            b.length > 0 && b.every((x) => x >= min && x < 2 * min + 8),
            `${wo}: Breiten ${JSON.stringify(b)}`
          )
        }
        try {
          // Vorgabe beim Öffnen: große Kacheln
          await fenster(1366, 768)
          await passt(170, '1366 × 768, beim Öffnen')
          // gleiches Fenster, verschieden breites Feld (Schublade) – und ein großes Fenster
          for (const [w, h, offen] of [
            [1366, 768, false],
            [1366, 768, true],
            [1920, 1080, false]
          ]) {
            await fenster(w, h, offen)
            for (const [name, min] of [
              ['Große Kacheln', 170],
              ['Kleine Kacheln', 110]
            ]) {
              await ansicht(name)
              assert.deepEqual(await gewaehlt(), [name], 'Häkchen an der falschen Ansicht')
              await passt(min, `${w} × ${h}${offen ? ' angeheftet' : ''}, ${name}`)
            }
          }
          await fenster(1366, 768)
          await ansicht('Liste')
          assert.deepEqual(await gewaehlt(), ['Liste'])
          const zeilen = await medien().evaluateAll((els) =>
            els.map((e) => Math.round(e.getBoundingClientRect().left))
          )
          assert.equal(new Set(zeilen).size, 1, `Liste in mehreren Spalten: ${zeilen}`)
        } finally {
          if (await mehr.count()) await ansicht('Große Kacheln')
        }
      }
    ],
    [
      'Bibliothek: Suche nach einem Titel zeigt genau dieses Medium, ohne Treffer „Kein Medium heißt so“',
      async () => {
        await fenster(1366, 768)
        const lib = await bibliothek()
        const suche = bib().getByRole('searchbox', { name: 'Bibliothek durchsuchen' })
        assert.equal(await suche.count(), 1, 'kein Suchfeld in der Bibliothek')
        const treffer = async (soll, wann) =>
          assert.ok(
            await waitFor(async () => (await medien().count()) === soll, 5_000),
            `${wann}: ${await medien().count()} Medien, erwartet ${soll}`
          )
        // Das Suchfeld bleibt oben stehen: ungescrollt deckt es keine Kachel ab, gescrollt klebt es
        // am oberen Rand des Inhalts – darüber schaut nichts hervor
        const scrolle = (y) =>
          page.evaluate((y) => {
            const el = document.querySelector('[data-testid="feld-bibliothek"] [data-pane-inhalt]')
            el.scrollTop = y
          }, y)
        const lage = () =>
          page.evaluate(() => {
            const inhalt = document.querySelector(
              '[data-testid="feld-bibliothek"] [data-pane-inhalt]'
            )
            const block = document.querySelector('[data-testid="bibliothek-suche"]')
            const b = block?.getBoundingClientRect()
            return {
              inhalt: inhalt.getBoundingClientRect().top,
              block: b ? [b.top, b.bottom] : null,
              kachel: inhalt.querySelector('[draggable="true"]').getBoundingClientRect().top,
              scrollTop: inhalt.scrollTop
            }
          })
        await scrolle(0)
        let l = await lage()
        assert.ok(l.block && l.kachel >= l.block[1] - 0.5, `deckt Kacheln ab: ${JSON.stringify(l)}`)
        await scrolle(150)
        await sleep(100)
        l = await lage()
        assert.ok(
          l.scrollTop > 0 && Math.abs(l.block[0] - l.inhalt) <= 0.5,
          `gescrollt nicht am oberen Rand: ${JSON.stringify(l)}`
        )
        await scrolle(0)
        try {
          const award = lib.find((m) => m.title.startsWith('Award Stinger'))
          assert.ok(award, 'Vorbedingung: „Award Stinger“ in der Bibliothek')
          await suche.fill(award.title)
          await treffer(1, `Suche „${award.title}“`)
          assert.match((await medien().first().textContent()) ?? '', /Award Stinger/)
          // klein geschrieben, ein Teil des Titels
          await suche.fill('sponsor')
          await treffer(2, 'Suche „sponsor“')
          await suche.fill('Gibt es nicht')
          await treffer(0, 'Suche ohne Treffer')
          assert.equal(await bib().getByText('Kein Medium heißt so').count(), 1)
        } finally {
          if (await suche.count()) await suche.fill('')
        }
        await treffer(lib.length, 'Suche geleert')
      }
    ],
    [
      'Bibliothek: Dateien darüber ziehen – gestrichelter Rahmen nur, solange sie schweben, auch über dem Kopf; gezogene Medien zeigen ihn nicht',
      async () => {
        await fenster(1366, 768)
        const rahmen = async (soll, wann) =>
          assert.ok(
            await waitFor(async () => (await gestrichelt()) === soll, 2_000),
            `${wann}: ${await gestrichelt()} gestrichelte Rahmen, erwartet ${soll}`
          )
        await rahmen(0, 'ohne Ziehen')
        await ziehUeber('[data-pane-inhalt]', ['dragenter', 'dragover'], 'datei')
        await rahmen(1, 'Dateien über dem Inhalt')
        // vom Inhalt auf den Kopf: erst Betreten, dann Verlassen – der Rahmen bleibt
        await ziehUeber('[data-pane-kopf]', ['dragenter', 'dragover'], 'datei')
        await ziehUeber('[data-pane-inhalt]', ['dragleave'], 'datei')
        await rahmen(1, 'Dateien über dem Kopf')
        await ziehUeber('[data-pane-kopf]', ['dragleave'], 'datei')
        await rahmen(0, 'nach dem Verlassen')
        // Fehlt ein Verlassen (Element unter dem Zeiger neu gebaut), endet das Ziehen, wenn eine
        // Sekunde lang kein dragover kommt. Kommt es wieder, steht der Rahmen – und bleibt beim
        // Wechsel zwischen zwei Kindern stehen
        await ziehUeber('[data-pane-inhalt]', ['dragenter', 'dragover'], 'datei')
        await rahmen(1, 'Dateien über dem Inhalt')
        await sleep(1_300)
        await rahmen(0, 'eine Sekunde ohne dragover')
        await ziehUeber('[data-pane-inhalt]', ['dragover'], 'datei')
        await rahmen(1, 'wieder dragover')
        await ziehUeber('[data-pane-kopf]', ['dragenter', 'dragover'], 'datei')
        await ziehUeber('[data-pane-inhalt]', ['dragleave'], 'datei')
        await rahmen(1, 'danach vom Inhalt auf den Kopf')
        await ziehUeber('[data-pane-kopf]', ['dragleave'], 'datei')
        await rahmen(0, 'danach verlassen')
        await ziehUeber('[data-pane-inhalt]', ['dragenter', 'dragover'], 'medium')
        await sleep(300)
        await rahmen(0, 'ein Medium aus der Bibliothek darüber gezogen')
        await ziehUeber('[data-pane-inhalt]', ['dragleave'], 'medium')
        // echt gezogen, am Vorschaubild gepackt: Chromium gäbe ein gezogenes <img> als Datei mit
        const von = await medien().nth(0).boundingBox({ timeout: 5_000 })
        const nach = await medien().nth(1).boundingBox({ timeout: 5_000 })
        await page.mouse.move(von.x + von.width / 2, von.y + von.height / 3)
        await page.mouse.down()
        await page.mouse.move(von.x + von.width / 2 + 6, von.y + von.height / 3 + 6, { steps: 4 })
        await page.mouse.move(nach.x + nach.width / 2, nach.y + nach.height / 3, { steps: 6 })
        const waehrend = await gestrichelt()
        await page.mouse.up()
        assert.equal(waehrend, 0, 'Rahmen, während eine Kachel über die Bibliothek gezogen wird')
        // Loslassen: Rahmen weg; die Probe liegt nicht auf der Platte, es entsteht kein Auftrag
        await ziehUeber('[data-pane-inhalt]', ['dragenter', 'dragover', 'drop'], 'datei')
        await rahmen(0, 'nach dem Loslassen')
        await sleep(300)
        assert.deepEqual(await page.evaluate(() => window.api.player.convertList()), [])
      }
    ],
    [
      'Bibliothek: Import-Liste unten im Feld angeheftet, höchstens drei Aufträge hoch, scrollt in sich; „Erledigte entfernen“ räumt sie weg',
      async () => {
        await fenster(1366, 768)
        // vier Dateien, die keine Medien sind: Ihre Aufträge enden mit Fehler und bleiben stehen
        const kaputt = [1, 2, 3, 4].map((i) => {
          const datei = join(clipsDir, `Kaputt ${i}.mp4`)
          writeFileSync(datei, 'kein Video')
          return datei
        })
        const vorher = (await bibliothek()).length
        const auftraege = () => page.evaluate(() => window.api.player.convertList())
        await page.evaluate(
          ([sources, wall]) => window.api.player.import({ sources, fitMode: 'bars', wall }),
          [kaputt, WAND]
        )
        try {
          assert.ok(
            await waitFor(async () => {
              const l = await auftraege()
              return l.length === 4 && l.every((j) => j.status === 'error')
            }, 60_000),
            `Aufträge: ${JSON.stringify((await auftraege()).map((j) => j.status))}`
          )
          const entfernen = bib().getByRole('button', { name: 'Erledigte entfernen' })
          await entfernen.waitFor({ timeout: 5_000 })
          // angeheftet: unten im Feld, auch wenn der Inhalt darüber ganz nach unten scrollt
          for (const wohin of ['unten', 'oben']) {
            await page.evaluate((wohin) => {
              const el = document.querySelector(
                '[data-testid="feld-bibliothek"] [data-pane-inhalt]'
              )
              el.scrollTop = wohin === 'unten' ? el.scrollHeight : 0
            }, wohin)
            await sleep(200)
            const lage = await page.evaluate(() => {
              const feld = document.querySelector('[data-testid="feld-bibliothek"]')
              const knopf = [...feld.querySelectorAll('button')].find(
                (b) => b.textContent === 'Erledigte entfernen'
              )
              const f = feld.getBoundingClientRect()
              const k = knopf.getBoundingClientRect()
              return { feld: [f.top, f.bottom], knopf: [k.top, k.bottom] }
            })
            const mitte = (lage.feld[0] + lage.feld[1]) / 2
            assert.ok(
              lage.knopf[0] >= mitte && lage.knopf[1] <= lage.feld[1],
              `Inhalt ${wohin} gescrollt: Import-Liste nicht unten im Feld – ${JSON.stringify(lage)}`
            )
          }
          const liste = await page.getByTestId('import-auftraege').evaluate((el) => {
            const l = el.getBoundingClientRect()
            const zeilen = [...el.children].map((z) => z.getBoundingClientRect())
            return {
              sh: el.scrollHeight,
              ch: el.clientHeight,
              zeilen: zeilen.length,
              ganz: zeilen.filter((r) => r.top >= l.top - 1 && r.bottom <= l.bottom + 1).length
            }
          })
          assert.equal(liste.zeilen, 4, `Zeilen: ${JSON.stringify(liste)}`)
          assert.equal(liste.ganz, 3, `ganz sichtbare Aufträge: ${JSON.stringify(liste)}`)
          assert.ok(liste.sh > liste.ch, `scrollt nicht in sich: ${JSON.stringify(liste)}`)
          // auch im kleinsten Fenster schneidet kein Feld ab, die Seite scrollt nicht
          await fenster(1024, 600)
          keinScrollen(await mass())
          await fenster(1366, 768)
          await entfernen.click({ timeout: 5_000 })
          assert.ok(
            await waitFor(
              async () => (await page.getByTestId('import-liste').count()) === 0,
              5_000
            ),
            'Import-Liste bleibt nach „Erledigte entfernen“ stehen'
          )
          assert.equal((await bibliothek()).length, vorher, 'Defekte Dateien in der Bibliothek')
        } finally {
          await page.evaluate(() => window.api.player.convertClearFinished())
        }
      }
    ],
    [
      'Bibliothek: Papierkorb an einem Medium fragt nach – Abbrechen behält es, Löschen entfernt es',
      async () => {
        await fenster(1366, 768)
        const lib = await bibliothek()
        const opfer = lib.find((m) => m.title.startsWith('Foto 4'))
        assert.ok(opfer, 'Vorbedingung: „Foto 4“ in der Bibliothek')
        const kachel = medien().filter({ hasText: opfer.title })
        const papierkorb = kachel.getByRole('button', { name: /löschen/ })
        const anzahl = async (soll, wann) => {
          assert.ok(
            await waitFor(async () => (await bibliothek()).length === soll, 5_000),
            `${wann}: ${(await bibliothek()).length} Medien in der Bibliothek, erwartet ${soll}`
          )
          assert.ok(
            await waitFor(async () => (await medien().count()) === soll, 5_000),
            `${wann}: ${await medien().count()} Medien im Feld, erwartet ${soll}`
          )
        }
        await stubConfirm(app, false)
        await kachel.hover({ timeout: 5_000 })
        await papierkorb.click({ timeout: 5_000 })
        await sleep(600)
        await anzahl(lib.length, 'nach „Abbrechen“')

        // Bestätigen – die Frage nennt das Medium
        await app.evaluate(({ dialog }) => {
          globalThis.__fragen = []
          dialog.showMessageBox = async (...args) => {
            globalThis.__fragen.push(args.at(-1))
            return { response: 0, checkboxChecked: false }
          }
        })
        await kachel.hover({ timeout: 5_000 })
        await papierkorb.click({ timeout: 5_000 })
        await anzahl(lib.length - 1, 'nach „Löschen“')
        assert.ok(!(await bibliothek()).some((m) => m.id === opfer.id), 'falsches Medium gelöscht')
        const [frage] = await app.evaluate(() => globalThis.__fragen)
        assert.ok(frage?.message.includes(opfer.title), `Frage: ${JSON.stringify(frage)}`)
        assert.equal(frage.type, 'warning', 'Rückfrage nicht als Warnung (danger)')
        await stubConfirm(app, true)
      }
    ],
    [
      'Bibliothek: „⋯“ – „Alle zur Playlist“, „Medienordner öffnen“, „Bibliothek leeren …“ fragt; leer steht der Hinweis in der Mitte',
      async () => {
        await fenster(1366, 768)
        const mehr = bibKopf().getByRole('button', { name: 'Mehr zur Bibliothek' })
        const waehle = async (name) => {
          await mehr.click({ timeout: 5_000 })
          await page.getByRole('menuitem', { name }).click({ timeout: 5_000 })
          await page.getByRole('menu').waitFor({ state: 'detached', timeout: 5_000 })
        }
        const lib = await bibliothek()
        await befehl({ type: 'clear' })
        await waehle('Alle zur Playlist')
        assert.ok(
          await waitFor(async () => (await titel()).length === lib.length, 5_000),
          `Playlist: ${(await titel()).length} Einträge, erwartet ${lib.length}`
        )

        await app.evaluate(({ shell }) => {
          globalThis.__ordner = []
          shell.openPath = async (p) => {
            globalThis.__ordner.push(p)
            return ''
          }
        })
        await waehle('Medienordner öffnen')
        assert.ok(
          await waitFor(async () => (await app.evaluate(() => globalThis.__ordner)).length === 1),
          'kein Ordner geöffnet'
        )
        const [ordner] = await app.evaluate(() => globalThis.__ordner)
        assert.ok(ordner.endsWith('player-media'), `geöffnet: ${ordner}`)

        await stubConfirm(app, false)
        await waehle('Bibliothek leeren …')
        await sleep(600)
        assert.equal((await bibliothek()).length, lib.length, 'nach „Abbrechen“ geleert')
        await stubConfirm(app, true)
        await waehle('Bibliothek leeren …')
        assert.ok(
          await waitFor(async () => (await bibliothek()).length === 0, 10_000),
          'nach „Leeren“ nicht leer'
        )
        assert.ok(await waitFor(async () => (await medien().count()) === 0, 5_000))

        // leer: kein Suchfeld, der Hinweis mitten im Inhalt, nichts zu leeren
        assert.equal(
          await bib().getByRole('searchbox').count(),
          0,
          'Suchfeld bei leerer Bibliothek'
        )
        const hinweis = bib().getByText('Medien hierher ziehen', { exact: false })
        const h = await hinweis.boundingBox({ timeout: 5_000 })
        const inhalt = await page
          .locator('[data-testid="feld-bibliothek"] [data-pane-inhalt]')
          .boundingBox()
        const abweichung = Math.abs(h.y + h.height / 2 - (inhalt.y + inhalt.height / 2))
        assert.ok(abweichung <= 24, `Hinweis ${abweichung} px neben der Mitte`)
        await mehr.click({ timeout: 5_000 })
        for (const name of ['Alle zur Playlist', 'Bibliothek leeren …']) {
          assert.equal(await page.getByRole('menuitem', { name }).isDisabled(), true, name)
        }
        await page.keyboard.press('Escape')
      }
    ],
    [
      'keine Konsolenfehler im Hauptfenster',
      async () => {
        assert.deepEqual(ctx.errors, [])
      }
    ]
  ])
} finally {
  await ctx.close()
  rmSync(clipsDir, { recursive: true, force: true })
}
