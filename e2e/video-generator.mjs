// Video-Generator in der echten App: Rechenlauf im main über die Programmbrücke (ohne
// Oberfläche), Zwischenspeicher beim zweiten Lauf, Schleife mit Musik und Lautheit,
// Abbrechen, Eingabeprüfung, Vorschaubilder über media://vgen, „Vorschau rechnen“, Musik mit
// mehreren Titeln und Quelladressen für die Live-Vorschau; danach die Oberfläche bis zum
// fertigen Video (Live-Vorschau, Ken-Burns-Rahmen, Bereichsregler, Musik-Panel).
// Bildzahlen sind exakt erwartet (Zeitachse in ganzen Bildern); ProRes-Ausgaben tragen PCM,
// dort ist auch die Samplezahl exakt. Braucht das gebündelte ffmpeg (`npm run ff:fetch`).

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findFfmpeg, launchApp, runSteps, Skip, waitFor } from './harness.mjs'

const ffmpeg = findFfmpeg()
const ffprobe = ffmpeg?.replace(/ffmpeg(\.exe)?$/, (_m, ext) => `ffprobe${ext ?? ''}`)
const dir = mkdtempSync(join(tmpdir(), 'mottulbox-e2e-vgen-'))
const f = (name) => join(dir, name)

function make(args) {
  execFileSync(ffmpeg, ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
}

function counts(path) {
  const out = execFileSync(
    ffprobe,
    [
      ...['-v', 'error', '-count_frames', '-print_format', 'json'],
      ...['-show_entries', 'stream=codec_type,nb_read_frames,duration_ts,codec_name,width,height'],
      path
    ],
    { encoding: 'utf8' }
  )
  const streams = JSON.parse(out).streams
  const v = streams.find((s) => s.codec_type === 'video')
  const a = streams.find((s) => s.codec_type === 'audio')
  return {
    frames: v ? Number(v.nb_read_frames) : null,
    codec: v?.codec_name,
    width: v?.width,
    height: v?.height,
    samples: a?.duration_ts ?? null,
    audioCodec: a?.codec_name
  }
}

/** Datei hinter einer media://vgen-Adresse (Vorschau) im Cache des Testlaufs. */
const previewFile = (url) => join(ctx.userData, 'vgen-cache', 'previews', url.split('/').pop())

const element = (id, path, p = {}) => ({
  id,
  path,
  kind: 'image',
  durationSec: 2,
  inSec: null,
  outSec: null,
  kenBurns: null,
  fit: null,
  transition: null,
  audio: true,
  ...p
})

const project = (elements, output = {}, p = {}) => ({
  elements,
  output: {
    width: 640,
    height: 360,
    fps: 25,
    format: 'prores_proxy',
    quality: 'standard',
    loop: false,
    background: '#000000',
    ...output
  },
  defaults: {
    imageSec: 2,
    transition: { kind: 'fade', durationSec: 0.5 },
    kenBurns: { mode: 'auto', strength: 'medium' },
    fit: 'crop'
  },
  music: null,
  loudnorm: null,
  ...p
})

const ctx = await launchApp()
const { page: w } = ctx
const enqueue = (req) => w.evaluate((r) => window.api.videoGen.enqueue(r), req)
const job = (id) =>
  w.evaluate(async (i) => (await window.api.videoGen.list()).find((j) => j.id === i), id)
async function finished(id, ms = 180_000) {
  const j = await waitFor(async () => {
    const x = await job(id)
    return x && ['done', 'error', 'canceled'].includes(x.status) ? x : null
  }, ms)
  assert.ok(j, 'Auftrag wurde nicht fertig')
  return j
}

try {
  await w.getByText('Video-Player').first().waitFor({ timeout: 30_000 })
  if (!ffmpeg || !existsSync(ffprobe)) throw new Skip('ffmpeg fehlt (npm run ff:fetch)')

  // Testmedien
  make(['-f', 'lavfi', '-i', 'testsrc2=s=1600x1200', '-frames:v', '1', f('quer.jpg')])
  make(['-f', 'lavfi', '-i', 'testsrc2=s=1200x1600', '-frames:v', '1', f('hoch.jpg')])
  make([
    ...['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30000/1001:d=4'],
    ...['-f', 'lavfi', '-i', 'sine=f=500:r=44100:d=4', '-ac', '1'],
    ...['-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', f('clip.mp4')]
  ])
  make(['-f', 'lavfi', '-i', 'sine=f=300:d=5', f('musik.wav')])
  make(['-f', 'lavfi', '-i', 'sine=f=500:d=30', f('lang.wav')])

  const basic = project([
    element('a', f('quer.jpg'), { kenBurns: { mode: 'zoom-in', strength: 'medium' } }),
    element('b', f('hoch.jpg')),
    element('c', f('clip.mp4'), { kind: 'video', durationSec: null, inSec: 1, outSec: 3 })
  ])

  await runSteps('Video-Generator: Rechenlauf', [
    [
      'drei Elemente, zwei Überblendungen: Bilder und Samples exakt (ProRes + PCM)',
      async () => {
        const { jobId } = await enqueue({ project: basic, outputPath: f('basic.mov') })
        const j = await finished(jobId)
        assert.equal(j.status, 'done', j.error)
        // 3 × 50 Bilder − 2 Übergänge à 13 Bilder (0,5 s bei 25 fps = 12,5, gerundet 13)
        const c = counts(f('basic.mov'))
        const expected = 150 - 2 * Math.round(0.5 * 25)
        assert.equal(c.frames, expected)
        assert.equal(c.samples, expected * 1920)
        assert.equal(c.codec, 'prores')
        assert.equal(j.renderedPieces, 5)
        assert.equal(j.cachedPieces, 0)
      }
    ],
    [
      'zweiter Lauf: alle Stücke aus dem Zwischenspeicher',
      async () => {
        const { jobId } = await enqueue({ project: basic, outputPath: f('basic2.mov') })
        const j = await finished(jobId)
        assert.equal(j.status, 'done', j.error)
        assert.equal(j.cachedPieces, 5)
        assert.equal(j.renderedPieces, 0)
      }
    ],
    [
      'ein Element geändert: nur sein Stück und die angrenzenden Übergänge neu',
      async () => {
        const changed = structuredClone(basic)
        changed.elements[1].durationSec = 2.5
        const { jobId } = await enqueue({ project: changed, outputPath: f('basic3.mov') })
        const j = await finished(jobId)
        assert.equal(j.status, 'done', j.error)
        assert.equal(j.renderedPieces, 3) // Element b + Übergänge a→b und b→c
        assert.equal(j.cachedPieces, 2)
      }
    ],
    [
      'H.264 mit Schleife, Musik und Lautheit: Bildzahl exakt, AAC-Ton',
      async () => {
        const p = project(
          basic.elements,
          { format: 'h264', fps: 30000 / 1001, loop: true },
          {
            music: { path: f('musik.wav'), gainDb: -6, fadeInSec: 1, fadeOutSec: 1 },
            loudnorm: { i: -16, tp: -1.5, lra: 11 }
          }
        )
        const { jobId } = await enqueue({ project: p, outputPath: f('loop.mp4') })
        const j = await finished(jobId)
        assert.equal(j.status, 'done', j.error)
        // 29,97: Bilder 60 (Fotos) und 60 (Ausschnitt 2 s), Übergänge je 15 Bilder, 3 davon
        const c = counts(f('loop.mp4'))
        assert.equal(c.frames, 3 * 60 - 3 * 15)
        assert.equal(c.audioCodec, 'aac')
      }
    ],
    [
      'Abbrechen: Status abgebrochen, keine halbe Ausgabe',
      async () => {
        const long = project(
          [
            element('x', f('quer.jpg'), { durationSec: 120 }),
            element('y', f('hoch.jpg'), { durationSec: 120 })
          ],
          { width: 1920, height: 1080 }
        )
        const { jobId } = await enqueue({ project: long, outputPath: f('abbruch.mov') })
        await waitFor(async () => (await job(jobId))?.stage === 'elements', 60_000)
        await w.evaluate((i) => window.api.videoGen.cancel(i), jobId)
        const j = await finished(jobId, 30_000)
        assert.equal(j.status, 'canceled')
        assert.equal(existsSync(f('abbruch.mov')), false)
      }
    ],
    [
      'Eingabeprüfung: Zieldatei = Quelle, falsche Endung, ungültiges Projekt',
      async () => {
        const reject = (req) =>
          w.evaluate(
            (r) =>
              window.api.videoGen.enqueue(r).then(
                () => 'ok',
                (e) => String(e)
              ),
            req
          )
        assert.match(
          await reject({ project: basic, outputPath: f('clip.mp4') }),
          /Ungültige Zieldatei|Quelle/
        )
        const h264 = project(basic.elements, { format: 'h264' })
        assert.match(await reject({ project: h264, outputPath: f('clip.mp4') }), /Quelle/)
        assert.match(
          await reject({ project: basic, outputPath: f('x.mp4') }),
          /Ungültige Zieldatei/
        )
        assert.match(
          await reject({ project: { elements: 'x' }, outputPath: f('x.mov') }),
          /Ungültiges Projekt/
        )
      }
    ],
    [
      'Vorschaubild über media://vgen lädt im Renderer',
      async () => {
        const url = await w.evaluate((p) => window.api.videoGen.thumb(p, null), f('hoch.jpg'))
        assert.match(url, /^media:\/\/vgen\/[0-9a-f]+\.jpg$/)
        const size = await w.evaluate(
          (u) =>
            new Promise((resolve) => {
              const img = new Image()
              img.onload = () => resolve([img.naturalWidth, img.naturalHeight])
              img.onerror = () => resolve(null)
              img.src = u
            }),
          url
        )
        assert.equal(size?.[0], 320) // 320 px breit, Höhe gerade und im Seitenverhältnis
        assert.ok(size[1] % 2 === 0 && Math.abs(size[1] - 427) <= 2, String(size))
        const clipThumb = await w.evaluate((p) => window.api.videoGen.thumb(p, 2.5), f('clip.mp4'))
        assert.match(clipThumb, /^media:\/\/vgen\//)
        assert.equal(
          await w.evaluate((p) => window.api.videoGen.thumb(p, null), f('fehlt.jpg')),
          null
        )
      }
    ],
    [
      'Vorschau rechnen: Bereich um ein Element bildgenau, beim zweiten Mal aus dem Speicher',
      async () => {
        const preview = (elementId, p = basic) =>
          w.evaluate((r) => window.api.videoGen.preview(r), {
            requestId: `e2e-${elementId}-${Date.now()}`,
            project: p,
            elementId
          })
        const res = await preview('b')
        assert.ok(res.ok, res.error)
        // b beginnt bei Bild 37 (50 − 13) und ist 50 lang; je 25 Bilder davor/danach
        assert.equal(res.elementStartSec, 1)
        assert.equal(res.elementEndSec, 3)
        assert.equal(res.cached, false)
        const c = counts(previewFile(res.url))
        assert.deepEqual([c.frames, c.width, c.height, c.codec], [100, 640, 360, 'h264'])
        assert.equal(c.audioCodec, 'aac')
        const again = await preview('b')
        assert.equal(again.cached, true)
        assert.equal(again.url, res.url)
        // spielt im Renderer über media://vgen
        const dur = await w.evaluate(
          (u) =>
            new Promise((resolve) => {
              const v = document.createElement('video')
              v.onloadedmetadata = () => resolve(v.duration)
              v.onerror = () => resolve(null)
              v.src = u
            }),
          res.url
        )
        assert.ok(Math.abs(dur - 4) < 0.1, String(dur))
      }
    ],
    [
      'Vorschau rechnen: neue Anfrage bricht die laufende ab',
      async () => {
        const long = project(
          [element('x', f('quer.jpg'), { durationSec: 300 }), element('y', f('hoch.jpg'))],
          { width: 1920, height: 1080 }
        )
        const first = w.evaluate((r) => window.api.videoGen.preview(r), {
          requestId: 'e2e-lang',
          project: long,
          elementId: 'x'
        })
        await new Promise((r) => setTimeout(r, 800))
        const second = await w.evaluate((r) => window.api.videoGen.preview(r), {
          requestId: 'e2e-kurz',
          project: basic,
          elementId: 'a'
        })
        assert.ok(second.ok, second.error)
        const r1 = await first
        assert.equal(r1.ok, false)
        assert.equal(r1.canceled, true)
      }
    ],
    [
      'Musik mit zwei Titeln (Überblendung, Absenken): Bilder und Samples exakt',
      async () => {
        const p = project(
          basic.elements,
          {},
          {
            music: {
              tracks: [f('musik.wav'), f('lang.wav')],
              gainDb: -6,
              fadeInSec: 1,
              fadeOutSec: 1,
              crossfadeSec: 2,
              duckDb: -12
            }
          }
        )
        const { jobId } = await enqueue({ project: p, outputPath: f('musik.mov') })
        const j = await finished(jobId)
        assert.equal(j.status, 'done', j.error)
        const c = counts(f('musik.mov'))
        assert.equal(c.frames, 124)
        assert.equal(c.samples, 124 * 1920)
      }
    ],
    [
      'Quelladressen der Live-Vorschau: nur Medien, spielbar über media://vgen/src',
      async () => {
        const src = (p) => w.evaluate((x) => window.api.videoGen.source(x), p)
        const url = await src(f('clip.mp4'))
        assert.match(url, /^media:\/\/vgen\/src\/[0-9a-f]{32}\/media\.mp4$/)
        assert.equal(await src(f('clip.mp4')), url) // gleiche Datei, gleiche Adresse
        assert.equal(await src(f('quer.jpg')), null) // Bilder laufen über Vorschaubilder
        assert.equal(await src(f('fehlt.mp4')), null)
        assert.equal(await src('relativ.mp4'), null)
        const dur = await w.evaluate(
          (u) =>
            new Promise((resolve) => {
              const v = document.createElement('video')
              v.onloadedmetadata = () => resolve(v.duration)
              v.onerror = () => resolve(null)
              v.src = u
            }),
          url
        )
        assert.ok(Math.abs(dur - 4) < 0.1, String(dur))
        // erfundenes Zeichen: nichts
        const bad = await w.evaluate(
          () =>
            fetch(`media://vgen/src/${'0'.repeat(32)}/media.mp4`).then(
              (r) => r.status,
              () => 'fehler'
            ),
          null
        )
        assert.notEqual(bad, 200)
      }
    ]
  ])

  // Oberfläche: Dateien über den (gestubbten) Dialog, Storyboard, Auswahl, Vorschau, Erzeugen
  const shots = process.env.VGEN_SHOTS ? process.env.VGEN_SHOTS : null
  const shot = async (name) => shots && (await w.screenshot({ path: join(shots, `${name}.png`) }))
  await runSteps('Video-Generator: Oberfläche', [
    [
      'Werkzeug öffnet sich, Dateien hinzufügen füllt das Storyboard mit Vorschaubildern',
      async () => {
        await w.setViewportSize({ width: 1500, height: 950 })
        await w.evaluate(() => {
          location.hash = '#/tool/video-generator'
        })
        await w.getByRole('button', { name: /Bilder & Videos/ }).waitFor({ timeout: 15_000 })
        await ctx.app.evaluate(
          ({ dialog }, files) => {
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files })
          },
          [f('quer.jpg'), f('hoch.jpg'), f('clip.mp4')]
        )
        await w.getByRole('button', { name: /Bilder & Videos/ }).click()
        await w.getByText('3 Elemente').waitFor({ timeout: 15_000 })
        // Vorschaubilder kommen über media://vgen
        assert.ok(
          await waitFor(() =>
            w.evaluate(
              () =>
                [...document.querySelectorAll('img')].filter(
                  (i) => i.src.startsWith('media://vgen/') && i.naturalWidth > 0
                ).length >= 3
            )
          ),
          'Vorschaubilder fehlen'
        )
        // Gesamtdauer nach der Analyse: 5 s + 5 s + 4 s Video − 2 × 1 s Überblenden = 12 s
        assert.ok(await waitFor(() => w.getByText('3 Elemente · 12 s').isVisible()), 'Dauer fehlt')
        await shot('1-storyboard')
      }
    ],
    [
      'Auswahl: Standzeit ändern verlängert die Gesamtdauer, Live-Vorschau zeigt das Bild',
      async () => {
        await w
          .getByRole('button', { name: /quer\.jpg/ })
          .first()
          .click()
        const stage = w.getByTestId('vgen-stage')
        await stage.waitFor({ timeout: 5_000 })
        assert.ok(
          await waitFor(() =>
            stage.evaluate((s) => [...s.querySelectorAll('img')].some((i) => i.naturalWidth > 0))
          ),
          'kein Bild auf der Bühne'
        )
        const field = w.getByPlaceholder(/Vorgabe 5 s/)
        await field.fill('7,5')
        await field.press('Enter')
        // 7,5 s = 188 Bilder (187,5 aufgerundet): 188 + 125 + 100 − 50 = 363 Bilder = 14,52 s
        assert.ok(await waitFor(() => w.getByText('3 Elemente · 14,5 s').isVisible()))
        await shot('2-auswahl')
      }
    ],
    [
      'Live-Vorschau: Abspielen bewegt den Abspielkopf, Pause hält ihn an',
      async () => {
        const pos = w.getByRole('slider', { name: 'Abspielposition' })
        const start = Number(await pos.inputValue())
        await w.getByRole('button', { name: 'Abspielen' }).click()
        assert.ok(
          await waitFor(async () => Number(await pos.inputValue()) > start + 10),
          'Abspielkopf steht'
        )
        await w.getByRole('button', { name: 'Pause' }).click()
        const held = Number(await pos.inputValue())
        await new Promise((r) => setTimeout(r, 400))
        assert.equal(Number(await pos.inputValue()), held)
        // in einen Übergang gesprungen (quer → hoch: Bilder 163..188): zwei Ebenen auf der Bühne
        await pos.evaluate((el, v) => {
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          set.call(el, v)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }, '176')
        assert.ok(
          await waitFor(() => w.getByTestId('vgen-stage').evaluate((s) => s.children.length === 2)),
          'im Übergang keine zwei Ebenen'
        )
      }
    ],
    [
      'Ken-Burns-Rahmen: eigener Rahmen, Start auf dem Bild verschieben',
      async () => {
        await w
          .getByRole('button', { name: /quer\.jpg/ })
          .first()
          .click()
        await w.getByRole('combobox', { name: 'Ken-Burns-Einstellung' }).selectOption('own')
        await w.getByRole('combobox', { name: 'Ken Burns der Auswahl' }).selectOption('custom')
        const editor = w.getByTestId('vgen-kb-editor')
        await editor.waitFor({ timeout: 5_000 })
        const startBox = w.getByRole('slider', { name: 'Startausschnitt' })
        const before = await startBox.getAttribute('aria-valuetext')
        // Zoom per Taste (Platz zum Verschieben), dann mit der Maus nach rechts unten ziehen
        await startBox.focus()
        for (let i = 0; i < 6; i++) await w.keyboard.press('=')
        const zoomed = await startBox.getAttribute('aria-valuetext')
        assert.notEqual(zoomed, before)
        const box = await startBox.boundingBox()
        await w.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await w.mouse.down()
        await w.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 25, { steps: 5 })
        await w.mouse.up()
        assert.notEqual(await startBox.getAttribute('aria-valuetext'), zoomed)
        await shot('3-kenburns')
        // Bühne wieder auf Live
        await w.getByRole('button', { name: 'Live', exact: true }).click()
      }
    ],
    [
      'Bereichsregler: Start des Videos um 1 s nach hinten, Gesamtdauer sinkt',
      async () => {
        await w
          .getByRole('button', { name: /clip\.mp4/ })
          .first()
          .click()
        const handle = w.getByRole('slider', { name: 'Start des Ausschnitts' })
        await handle.waitFor({ timeout: 10_000 })
        await handle.focus()
        for (let i = 0; i < 10; i++) await w.keyboard.press('ArrowRight')
        // 188 + 125 + 75 − 50 = 338 Bilder = 13,52 s
        assert.ok(await waitFor(() => w.getByText('3 Elemente · 13,5 s').isVisible()))
        await shot('4-ausschnitt')
      }
    ],
    [
      'Vorschau rechnen in der Oberfläche: gerechnetes Video läuft, 4 s um den Clip',
      async () => {
        await w.getByRole('button', { name: 'Vorschau rechnen' }).click()
        const video = w.getByTestId('vgen-rendered')
        const failed = w.getByText(/Vorschau fehlgeschlagen/)
        await video.or(failed).waitFor({ timeout: 120_000 })
        if (await failed.isVisible()) throw new Error(await failed.innerText())
        const dur = await waitFor(() =>
          video.evaluate((v) => (v.readyState >= 1 ? v.duration : null))
        )
        // Clip ab Bild 263, Ausschnitt 238..338 (am Ende gekappt) = 100 Bilder
        assert.ok(Math.abs(dur - 4) < 0.1, String(dur))
        await shot('5-gerechnet')
        await w.getByRole('button', { name: 'Live', exact: true }).click()
      }
    ],
    [
      'Video erzeugen: Speicherdialog, Auftrag läuft durch, Bildzahl exakt',
      async () => {
        const out = f('ui.mp4')
        await ctx.app.evaluate(({ dialog }, file) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
        }, out)
        await w.getByRole('button', { name: 'Video erzeugen' }).click()
        await w.getByText('Aufträge').waitFor({ timeout: 10_000 })
        const id = await waitFor(
          async () =>
            (await w.evaluate(() => window.api.videoGen.list())).find((j) =>
              j.outputPath.endsWith('ui.mp4')
            )?.id
        )
        assert.ok(id, 'kein Auftrag')
        const j = await finished(id)
        assert.equal(j.status, 'done', j.error)
        assert.equal(counts(out).frames, 338)
        await w.getByRole('button', { name: 'In Player-Bibliothek übernehmen' }).first().waitFor()
        await shot('6-fertig')
      }
    ],
    [
      'Musik: zwei Titel, „Standzeit an Musik anpassen“ trifft die Musiklänge',
      async () => {
        await ctx.app.evaluate(
          ({ dialog }, files) => {
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files })
          },
          [f('musik.wav'), f('lang.wav')]
        )
        await w.getByRole('button', { name: /Musik wählen/ }).click()
        const list = w.getByRole('list', { name: 'Musiktitel' })
        assert.ok(await waitFor(async () => (await list.locator('li').count()) === 2))
        // Musik 5 + 30 − 2 s Überblendung = 33 s; quer (eigene 7,5 s) und der Clip (3 s) bleiben
        assert.ok(await waitFor(() => w.getByText('Musik 33 s', { exact: false }).isVisible()))
        await w.getByRole('button', { name: /Standzeit an Musik anpassen/ }).click()
        assert.ok(await waitFor(() => w.getByText('3 Elemente · 33 s').isVisible()))
        await shot('7-musik')
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
