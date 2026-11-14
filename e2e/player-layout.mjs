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
// Mit P5 kommt noch dazu: Löschen fragt.
// Braucht das gebündelte ffmpeg (Import); ohne wird übersprungen.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
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

/** Schublade öffnen (angeheftet) oder schließen – wie ein Nutzer über den Knopf in der Kopfleiste */
async function schublade(offen) {
  const ist = async () => (await page.getByTestId('settings-drawer').count()) > 0
  if ((await ist()) !== offen) {
    await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
    assert.ok(await waitFor(async () => (await ist()) === offen, 5_000), 'Schublade reagiert nicht')
  }
  if (offen) {
    const pin = await page.getByTestId('settings-drawer').getAttribute('data-pinned')
    if (pin !== 'true') await page.getByRole('button', { name: 'Schublade anheften' }).click()
  }
}

/** Fenstergröße und Schublade einstellen, dann warten, bis das Raster nachgezogen hat */
async function fenster(width, height, offen = false) {
  await page.setViewportSize({ width, height })
  await schublade(offen)
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
