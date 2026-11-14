// Video-Player ohne Scrollen (docs/PLAN.md, „Muster 1: Arbeitsfläche“): Bibliothek, Playlist und
// Bühne nebeneinander bzw. übereinander, die Listen scrollen in sich, die Seite nicht. Gemessen
// mit 14 Medien in Bibliothek und Playlist und drei gespeicherten Playlists, bei den Fenstern
// aus dem Plan. Gegen den Stand vor dem Umbau war die Seite bei 1366 × 768 doppelt so hoch wie
// das Fenster (1323 statt 666 px).
//
// Seit P3 auch die Bühne: Restzeit, „Danach“, „Stumm“, Tastenkürzel hinter dem ⓘ, Knopf „FPS“
// über dem Video, Übergang und Bild-Standzeit in der Schublade, Vorschau im Seitenverhältnis der
// Wand. Mit ihren Schritten kommen noch dazu: laufender Eintrag sichtbar und „Leeren“ fragt (P4),
// Löschen fragt (P5).
// Braucht das gebündelte ffmpeg (Import); ohne wird übersprungen.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findFfmpeg, launchApp, openRoute, runSteps, Skip, sleep, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { page } = ctx
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
      zeilen: liste
        ? [...liste.querySelectorAll(':scope > [draggable="true"]')].slice(0, 5).map(rect)
        : [],
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
