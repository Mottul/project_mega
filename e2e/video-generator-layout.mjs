// Video-Generator als Arbeitsfläche (docs/PLAN.md, Paket W1 – Muster 1 im Leitbild): Storyboard,
// Vorschau und Aufträge als Felder statt einer Seite, die als Ganzes scrollt. Mit zwölf Elementen
// (elf Fotos, darunter zwei kleine mit Hinweis, und ein Clip) bei 1024 × 600, 1366 × 768 und
// 1920 × 1080, Schublade zu und angeheftet: Weder `tool-content` noch `tool-main` noch die
// Arbeitsfläche scrollen, kein Feld (`[data-pane]`) schneidet ab, die Stufe stimmt; das gewählte
// Element (das letzte) und die Vorschau mit ihrem Abspielknopf liegen gleichzeitig ganz im
// Fenster, das Element auch im sichtbaren Teil des Storyboards.
//
// Gemessen am Stand vor dem Umbau (24. November 2026, zwölf Bilder wie im Gesamtplan): `tool-main`
// war um 732 · 732 px (1024 × 600, Schublade zu · an), 490 · 639 px (1366 × 768) und 169 · 318 px
// (1920 × 1080) zu hoch – wer im Storyboard ordnete, sah die Vorschau nicht.
// Braucht das gebündelte ffmpeg (Testmedien per lavfi); ohne wird übersprungen.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findFfmpeg, launchApp, runSteps, Skip, sleep, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx
const ffmpeg = findFfmpeg()
const dir = mkdtempSync(join(tmpdir(), 'mottulbox-e2e-vgen-layout-'))
const f = (name) => join(dir, name)
// Bilder zum Ansehen (ein grüner Messtest zeigt nicht, ob etwas mitten im Feld schwebt):
// VGEN_SHOTS=<Ordner> node e2e/video-generator-layout.mjs
const shots = process.env.VGEN_SHOTS || null
const shot = async (name) => shots && (await page.screenshot({ path: join(shots, `${name}.png`) }))

/** Elf Fotos (quer, hoch, zwei kleine) und ein Clip mit Ton als zwölftes Element */
function testmedien() {
  if (!ffmpeg) throw new Skip('ffmpeg fehlt (npm run ff:fetch)')
  const make = (args) =>
    execFileSync(ffmpeg, ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  const groessen = [
    '1600x1200',
    '1200x1600',
    '1600x1200',
    '640x480', // klein: Hinweis „wird stark vergrößert“
    '1600x1200',
    '1200x1600',
    '1600x1200',
    '1600x1200',
    '640x480',
    '1200x1600',
    '1600x1200'
  ]
  const dateien = groessen.map((s, i) => {
    const datei = f(`Foto ${String(i + 1).padStart(2, '0')}.jpg`)
    make(['-f', 'lavfi', '-i', `testsrc2=s=${s}`, '-frames:v', '1', datei])
    return datei
  })
  const clip = f('Clip 12.mp4')
  make([
    ...['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=25:d=4'],
    ...['-f', 'lavfi', '-i', 'sine=f=440:d=4'],
    ...['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'],
    ...['-c:a', 'aac', '-shortest', clip]
  ])
  return [...dateien, clip]
}

/** Unter dieser Fensterbreite schwebt die Schublade immer (wie in e2e/player-layout.mjs) */
const SCHWEBT_UNTER = 1100

/** Schublade öffnen (angeheftet, soweit das Fenster es zulässt) oder schließen – über den Knopf */
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

/** Kacheln des Storyboards (Ansicht „Kacheln“): ziehbare Knöpfe mit `aria-pressed` */
const kacheln = () => page.locator('[data-testid="tool-main"] button[draggable="true"]')

/**
 * Element wählen wie ein Nutzer: Klick auf die Kachel (Playwright scrollt sie dabei ins Bild).
 * Bei geschlossener Schublade – eine schwebende läge über dem Storyboard.
 */
async function waehle(i) {
  await kacheln().nth(i).click()
  assert.ok(
    await waitFor(async () => (await kacheln().nth(i).getAttribute('aria-pressed')) === 'true'),
    `Kachel ${i + 1} nicht gewählt`
  )
}

/** Maße aus der Seite: Scroll-Bereiche, Felder, Vorschau, Abspielknopf, gewähltes Element */
const mass = () =>
  page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }
    }
    const scroll = (el) => (el ? { sh: el.scrollHeight, ch: el.clientHeight } : null)
    const q = (sel) => document.querySelector(sel)
    const gewaehlt = q('[data-testid="tool-main"] button[draggable="true"][aria-pressed="true"]')
    // Der Bereich, in dem das gewählte Element scrollt: der nächste Vorfahr mit eigenem Scrollen
    let bereich = gewaehlt?.parentElement ?? null
    while (bereich && !/(auto|scroll)/.test(getComputedStyle(bereich).overflowY)) {
      bereich = bereich.parentElement
    }
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
      vorschau: rect(q('[data-testid="vgen-stage"]')),
      abspielen: rect(q('button[aria-label="Abspielen"], button[aria-label="Pause"]')),
      gewaehlt: rect(gewaehlt),
      bereich: bereich ? { name: bereich.getAttribute('data-testid'), rect: rect(bereich) } : null
    }
  })

const innen = (r, f) =>
  r &&
  r.top >= f.top - 1 &&
  r.bottom <= f.bottom + 1 &&
  r.left >= f.left - 1 &&
  r.right <= f.right + 1

/** Die Seite scrollt nicht, kein Feld schneidet Inhalt ab */
function keinScrollen(m) {
  for (const [name, s] of [
    ['tool-content', m.inhalt],
    ['tool-main', m.main],
    ['Arbeitsfläche', m.arbeitsflaeche]
  ]) {
    assert.ok(s, `${name} fehlt`)
    assert.ok(
      s.sh <= s.ch + 1,
      `${name} scrollt: Inhalt ${s.sh} px, sichtbar ${s.ch} px (+${s.sh - s.ch})`
    )
  }
  for (const fe of m.felder) {
    assert.ok(
      fe.sh <= fe.ch + 1,
      `${fe.name} schneidet ab: Inhalt ${fe.sh} px, sichtbar ${fe.ch} px`
    )
  }
}

/** Vorschau, Abspielknopf und gewähltes Element ganz im Fenster, das Element im Storyboard sichtbar */
function allesImBild(m) {
  const bild = { top: 0, left: 0, bottom: m.fenster.h, right: m.fenster.w }
  assert.ok(m.gewaehlt, 'kein gewähltes Element')
  assert.ok(innen(m.vorschau, bild), `Vorschau nicht ganz im Bild: ${JSON.stringify(m.vorschau)}`)
  assert.ok(
    innen(m.abspielen, bild),
    `Abspielknopf nicht ganz im Bild: ${JSON.stringify(m.abspielen)}`
  )
  assert.ok(
    innen(m.gewaehlt, bild),
    `gewähltes Element nicht ganz im Bild: ${JSON.stringify(m.gewaehlt)}`
  )
  assert.ok(
    m.bereich && innen(m.gewaehlt, m.bereich.rect),
    `gewähltes Element außerhalb des sichtbaren Teils von ${m.bereich?.name}: ${JSON.stringify(m.gewaehlt)}, Bereich ${JSON.stringify(m.bereich?.rect)}`
  )
}

/** Aufträge, die sofort scheitern (Datei ist kein Bild) und bis „Fertige entfernen“ stehen bleiben */
async function gescheiterteAuftraege(n) {
  const kaputt = f('kaputt.jpg')
  writeFileSync(kaputt, 'kein Bild')
  for (let i = 0; i < n; i++) {
    await page.evaluate((r) => window.api.videoGen.enqueue(r), {
      project: {
        elements: [
          {
            id: `kaputt-${i}`,
            path: kaputt,
            kind: 'image',
            durationSec: 2,
            inSec: null,
            outSec: null,
            kenBurns: null,
            fit: null,
            transition: null,
            audio: true
          }
        ],
        output: {
          width: 640,
          height: 360,
          fps: 25,
          format: 'prores_proxy',
          quality: 'standard',
          loop: false,
          background: '#000000'
        },
        defaults: {
          imageSec: 2,
          transition: { kind: 'fade', durationSec: 0.5 },
          kenBurns: { mode: 'auto', strength: 'medium' },
          fit: 'crop'
        },
        music: null,
        loudnorm: null
      },
      outputPath: f(`kaputt-${i}.mov`)
    })
  }
  assert.ok(
    await waitFor(
      async () =>
        (await page.evaluate(() => window.api.videoGen.list())).filter((j) => j.status === 'error')
          .length >= n,
      30_000
    ),
    `nicht alle ${n} Aufträge gescheitert`
  )
}

const FENSTER = [
  [1024, 600, false, 'mittel'],
  // die Schublade schwebt unter 1100 px Breite, auch angeheftet: dieselbe Stufe wie ohne
  [1024, 600, true, 'mittel'],
  [1366, 768, false, 'breit'],
  [1366, 768, true, 'mittel'],
  [1920, 1080, false, 'breit'],
  [1920, 1080, true, 'breit']
]

try {
  await runSteps('Video-Generator als Arbeitsfläche', [
    [
      'Vorbereitung: zwölf Elemente über „Bilder & Videos“, Analyse fertig',
      async () => {
        const dateien = testmedien()
        await page.getByText('Video-Player').first().waitFor({ timeout: 30_000 })
        await page.setViewportSize({ width: 1366, height: 768 })
        await page.evaluate(() => {
          location.hash = '#/tool/video-generator'
        })
        const hinzu = page.getByRole('button', { name: /Hinzufügen/ })
        await hinzu.waitFor({ timeout: 15_000 })
        await app.evaluate(({ dialog }, files) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files })
        }, dateien)
        // „Bilder & Videos …“ im Menü „Hinzufügen“ im Kopf des Storyboards (vor W1 ein Knopf)
        await hinzu.click()
        await page.getByRole('menuitem', { name: /Bilder & Videos/ }).click()
        assert.ok(
          await waitFor(async () => (await kacheln().count()) === 12, 30_000),
          `Kacheln: ${await kacheln().count()}`
        )
        // Gesamtdauer steht erst nach der Analyse: 11 × 5 s + 4 s − 11 × 1 s Überblenden = 48 s
        assert.ok(
          await waitFor(() =>
            page
              .getByTestId('feld-storyboard')
              .locator('[data-pane-kopf]')
              .getByText('12 · 48 s', { exact: true })
              .isVisible()
          ),
          'Analyse nicht fertig (Gesamtdauer fehlt)'
        )
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
          `${name}: das gewählte Element (das letzte) und die Vorschau mit Abspielknopf zugleich im Bild`,
          async () => {
            await fenster(w, h, false)
            await waehle(11)
            await schublade(offen, w)
            await sleep(700)
            await shot(`${w}x${h}-${offen ? 'an' : 'zu'}`)
            allesImBild(await mass())
          }
        ]
      ]
    }),
    [
      '1024 × 600: Das Storyboard scrollt in sich, die Hinweise stehen darunter im Fuß',
      async () => {
        await fenster(1024, 600)
        const m = await page.evaluate(() => {
          const feld = document.querySelector('[data-testid="feld-storyboard"]')
          const inhalt = feld?.querySelector('[data-pane-inhalt]')
          return {
            inhalt: inhalt ? { sh: inhalt.scrollHeight, ch: inhalt.clientHeight } : null,
            hinweise: [...(feld?.querySelectorAll('[data-testid="vgen-hinweise"] li') ?? [])].map(
              (li) => li.closest('[data-pane-inhalt]') === null
            )
          }
        })
        assert.ok(m.inhalt, 'Feld „Storyboard“ fehlt')
        assert.ok(
          m.inhalt.sh > m.inhalt.ch,
          `Storyboard scrollt nicht: ${JSON.stringify(m.inhalt)}`
        )
        // zwei kleine Fotos: zwei Hinweise, beide außerhalb des scrollenden Inhalts
        assert.deepEqual(m.hinweise, [true, true], `Hinweise: ${JSON.stringify(m.hinweise)}`)
      }
    ],
    [
      'Dateien ins Storyboard ziehen: Rahmen über dem ganzen Feld, nach dem Loslassen über einer Kachel sofort weg',
      async () => {
        await fenster(1366, 768)
        const rahmen = () => page.getByTestId('feld-storyboard').getByTestId('ablage-rahmen')
        // Ereignisse wie aus dem Explorer (Typ „Files“) an die erste Kachel – Playwright kann keine
        // Dateien des Systems ziehen; `api.pathForFile` liefert dafür einen leeren Pfad, es wird
        // also nichts eingefügt (Skill electron-e2e, „Dateien hineinziehen nachstellen“)
        const ziehe = (arten) =>
          page.evaluate((arten) => {
            const kachel = document.querySelector(
              '[data-testid="feld-storyboard"] button[draggable="true"]'
            )
            const dt = new DataTransfer()
            dt.items.add(new File(['x'], 'Probe.jpg', { type: 'image/jpeg' }))
            for (const art of arten)
              kachel.dispatchEvent(
                new DragEvent(art, { bubbles: true, cancelable: true, dataTransfer: dt })
              )
          }, arten)
        await ziehe(['dragenter', 'dragover'])
        assert.ok(
          await waitFor(async () => (await rahmen().count()) === 1, 2_000),
          'kein gestrichelter Rahmen über dem Storyboard'
        )
        // Die Kachel nimmt das Loslassen selbst (Einfügen an dieser Stelle) und lässt es zum Feld
        // weiterlaufen: Der Rahmen geht sofort weg. Hielte sie es an, stünde er noch, bis eine
        // Sekunde lang kein dragover mehr kommt
        await ziehe(['drop'])
        await sleep(150)
        assert.equal(await rahmen().count(), 0, 'Rahmen steht nach dem Loslassen noch')
        assert.equal(await kacheln().count(), 12, 'beim Loslassen wurde etwas eingefügt')
      }
    ],
    [
      'Aufträge: ohne Auftrag kein Feld; vier gescheiterte – höchstens drei Zeilen hoch, die Liste scrollt in sich, bei 1024 × 600 scrollt die Seite nicht',
      async () => {
        await fenster(1024, 600)
        assert.equal(await page.getByTestId('feld-auftraege').count(), 0, 'Feld ohne Auftrag')
        await gescheiterteAuftraege(4)
        await sleep(500)
        await shot('1024x600-auftraege')
        const m = await mass()
        keinScrollen(m)
        const liste = await page.evaluate(() => {
          const l = document.querySelector(
            '[data-testid="feld-auftraege"] [data-testid="auftraege-liste"]'
          )
          if (!l) return null
          const r = l.getBoundingClientRect()
          const zeilen = [...l.children].map((z) => z.getBoundingClientRect())
          return {
            sh: l.scrollHeight,
            ch: l.clientHeight,
            zeilen: zeilen.length,
            ganz: zeilen.filter((z) => z.top >= r.top - 1 && z.bottom <= r.bottom + 1).length
          }
        })
        assert.ok(liste, 'Liste der Aufträge fehlt')
        assert.equal(liste.zeilen, 4, `Zeilen: ${liste.zeilen}`)
        assert.ok(liste.sh > liste.ch, `Liste scrollt nicht: ${JSON.stringify(liste)}`)
        assert.ok(liste.ganz >= 1 && liste.ganz <= 3, `ganz sichtbar: ${liste.ganz} Zeilen`)
      }
    ],
    [
      'Aufträge: „Fertige entfernen“ räumt sie weg, das Feld verschwindet',
      async () => {
        await page.getByRole('button', { name: 'Fertige entfernen' }).click()
        assert.ok(
          await waitFor(
            async () => (await page.getByTestId('feld-auftraege').count()) === 0,
            5_000
          ),
          'Feld „Aufträge“ steht noch'
        )
      }
    ],
    [
      '700 × 600: eine Spalte, die Arbeitsfläche scrollt, Vorschau vor Storyboard',
      async () => {
        await fenster(700, 600)
        await shot('700x600')
        const m = await mass()
        assert.equal(m.stufe, 'schmal')
        const scrollt = [m.arbeitsflaeche, m.main].some((s) => s && s.sh > s.ch + 1)
        assert.ok(scrollt, `nichts scrollt: ${JSON.stringify({ a: m.arbeitsflaeche, m: m.main })}`)
        const top = (name) => m.felder.find((fe) => fe.name === name)?.rect.top
        assert.ok(
          top('feld-vorschau') < top('feld-storyboard'),
          'Vorschau steht nicht vor dem Storyboard'
        )
      }
    ],
    [
      'Wechsel der Stufe baut die Live-Vorschau nicht neu auf (breit → mittel → schmal → breit)',
      async () => {
        await fenster(1366, 768)
        await waehle(11)
        const markieren = () =>
          page.evaluate(() => {
            const buehne = document.querySelector('[data-testid="vgen-stage"]')
            const video = buehne?.querySelector('video')
            if (!buehne || !video) return false
            buehne.__marke = 1
            video.__marke = 1
            return true
          })
        const nochDa = () =>
          page.evaluate(() => {
            const buehne = document.querySelector('[data-testid="vgen-stage"]')
            return buehne?.__marke === 1 && buehne.querySelector('video')?.__marke === 1
          })
        assert.ok(await markieren(), 'kein <video> des Clips in der Vorschau')
        for (const [w, h, offen, stufe] of [
          [1366, 768, true, 'mittel'],
          // die Schublade wechselt von angeheftet zu schwebend, die Arbeitsfläche wird breiter
          [1024, 600, true, 'mittel'],
          [700, 600, false, 'schmal'],
          [1366, 768, false, 'breit']
        ]) {
          await fenster(w, h, offen)
          const ist = await page.evaluate(
            () =>
              document
                .querySelector('[data-testid="arbeitsflaeche"]')
                ?.getAttribute('data-stufe') ?? null
          )
          assert.equal(ist, stufe, `${w} × ${h}: Stufe`)
          assert.ok(await nochDa(), `nach ${w} × ${h} ist die Vorschau neu aufgebaut`)
        }
      }
    ],
    [
      'keine Konsolenfehler',
      async () => {
        assert.deepEqual(
          ctx.errors.filter((e) => !/Failed to load resource/.test(e)),
          []
        )
      }
    ]
  ])
} finally {
  await ctx.close()
  rmSync(dir, { recursive: true, force: true })
}
