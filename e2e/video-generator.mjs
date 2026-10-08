// Video-Generator in der echten App: Rechenlauf im main über die Programmbrücke (ohne
// Oberfläche), Zwischenspeicher beim zweiten Lauf, Schleife mit Musik und Lautheit,
// Abbrechen, Eingabeprüfung und Vorschaubilder über media://vgen.
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
      ...['-show_entries', 'stream=codec_type,nb_read_frames,duration_ts,codec_name', path]
    ],
    { encoding: 'utf8' }
  )
  const streams = JSON.parse(out).streams
  const v = streams.find((s) => s.codec_type === 'video')
  const a = streams.find((s) => s.codec_type === 'audio')
  return {
    frames: v ? Number(v.nb_read_frames) : null,
    codec: v?.codec_name,
    samples: a?.duration_ts ?? null,
    audioCodec: a?.codec_name
  }
}

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
      'Auswahl: Standzeit ändern verlängert die Gesamtdauer, Vorschau zeigt Anfang und Ende',
      async () => {
        await w
          .getByRole('button', { name: /quer\.jpg/ })
          .first()
          .click()
        await w.getByText('Anfang', { exact: true }).waitFor({ timeout: 5_000 })
        const field = w.getByPlaceholder(/Vorgabe 5 s/)
        await field.fill('7,5')
        await field.press('Enter')
        // 7,5 s = 188 Bilder (187,5 aufgerundet): 188 + 125 + 100 − 50 = 363 Bilder = 14,52 s
        assert.ok(await waitFor(() => w.getByText('3 Elemente · 14,5 s').isVisible()))
        await shot('2-auswahl')
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
        assert.equal(counts(out).frames, 363)
        await w.getByRole('button', { name: 'In Player-Bibliothek übernehmen' }).first().waitFor()
        await shot('3-fertig')
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
