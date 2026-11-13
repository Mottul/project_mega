// Video-Player ohne Scrollen (docs/PLAN-ARBEITSFLAECHE.md, „Abnahme“): Bibliothek, Playlist und
// Bühne nebeneinander bzw. übereinander, die Listen scrollen in sich, die Seite nicht. Gemessen
// mit 14 Medien in Bibliothek und Playlist und drei gespeicherten Playlists, bei den Fenstern
// aus dem Plan. Gegen den Stand vor dem Umbau war die Seite bei 1366 × 768 doppelt so hoch wie
// das Fenster (1323 statt 666 px).
//
// Die übrigen Prüfungen der Abnahme kommen mit ihren Schritten dazu: Seitenverhältnis der Wand,
// „Danach“ und „Stumm“ mit P3, laufender Eintrag sichtbar und „Leeren“ fragt mit P4, Löschen
// fragt mit P5. Braucht das gebündelte ffmpeg (Import); ohne wird übersprungen.

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
