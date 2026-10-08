// Beenden mitten in der Arbeit: Video-Konverter, Video-Generator und „Vorschau rechnen“ laufen,
// dann wird die App beendet. Danach darf kein ffmpeg der App weiterlaufen (unter Windows
// sterben Kindprozesse nicht mit), keine halbe Ausgabe und keine halbe Zwischendatei liegen
// bleiben, und das Beenden darf nicht hängen. Braucht das gebündelte ffmpeg.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findFfmpeg, launchApp, runSteps, Skip, sleep, waitFor } from './harness.mjs'

const ffmpeg = findFfmpeg()
const dir = mkdtempSync(join(tmpdir(), 'mottulbox-e2e-beenden-'))
const f = (name) => join(dir, name)

/** Laufende ffmpeg-Prozesse aus dem gebündelten Ordner („pid|pfad“) – fremde zählen nicht. */
function bundledFfmpeg() {
  const me = ffmpeg.toLowerCase()
  if (process.platform === 'win32') {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        // ohne „exit 0“ endet PowerShell mit 1, wenn gar kein ffmpeg läuft
        'Get-Process ffmpeg -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id)|$($_.Path)" }; exit 0'
      ],
      { encoding: 'utf8', windowsHide: true }
    )
    return out.split(/\r?\n/).filter((l) => l.toLowerCase().includes(me))
  }
  return execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.toLowerCase().includes(me))
}

const ctx = await launchApp()
const { page: w } = ctx
const inputs = ['lang.mp4', 'quer.jpg', 'hoch.jpg']

try {
  await w.getByText('Video-Player').first().waitFor({ timeout: 30_000 })
  if (!ffmpeg) throw new Skip('ffmpeg fehlt (npm run ff:fetch)')
  const make = (args) =>
    execFileSync(ffmpeg, ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  make([
    ...['-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=25:d=60'],
    ...['-c:v', 'libx264', '-preset', 'ultrafast', f('lang.mp4')]
  ])
  make(['-f', 'lavfi', '-i', 'testsrc2=s=1600x1200', '-frames:v', '1', f('quer.jpg')])
  make(['-f', 'lavfi', '-i', 'testsrc2=s=1200x1600', '-frames:v', '1', f('hoch.jpg')])
  const before = new Set(bundledFfmpeg())
  const fresh = () => bundledFfmpeg().filter((p) => !before.has(p))

  const element = (id, path) => ({
    id,
    path,
    kind: 'image',
    durationSec: 300,
    inSec: null,
    outSec: null,
    kenBurns: null,
    fit: null,
    transition: null,
    audio: true
  })
  const project = {
    elements: [element('x', f('quer.jpg')), element('y', f('hoch.jpg'))],
    output: {
      width: 1920,
      height: 1080,
      fps: 25,
      format: 'h264',
      quality: 'standard',
      loop: false,
      background: '#000000'
    },
    defaults: {
      imageSec: 5,
      transition: { kind: 'fade', durationSec: 1 },
      kenBurns: { mode: 'auto', strength: 'medium' },
      fit: 'crop'
    },
    music: null,
    loudnorm: null
  }

  await runSteps('Beenden während der Arbeit', [
    [
      'Konverter, Video-Generator und „Vorschau rechnen“ laufen gleichzeitig',
      async () => {
        await w.evaluate((req) => window.api.converter.enqueue(req), {
          inputs: [f('lang.mp4')],
          options: {
            format: 'prores_hq',
            quality: 'standard',
            compat: false,
            keepAlpha: true,
            size: { mode: 'original' },
            fps: { mode: 'original' },
            deinterlace: true,
            toSdr: true,
            audio: 'auto',
            hapCompressor: 'snappy',
            hapChunks: { kind: 'auto' },
            loudnorm: null
          },
          outputDir: dir,
          // zwei Plätze: der Generator teilt sich die Spur mit dem Konverter
          concurrency: 2
        })
        await w.evaluate((req) => window.api.videoGen.enqueue(req), {
          project,
          outputPath: f('generator.mp4')
        })
        // nicht abwarten: Die Vorschau endet erst mit dem Beenden der App
        void w
          .evaluate((req) => window.api.videoGen.preview(req), {
            requestId: 'e2e-beenden',
            project,
            elementId: 'x'
          })
          .catch(() => {})
        // die Konverter-Ausgabe liegt schon (halb) auf der Platte
        assert.ok(
          await waitFor(() => readdirSync(dir).some((n) => n.endsWith('.mov')), 60_000),
          'Konverter schreibt nicht'
        )
        assert.ok(
          await waitFor(() => fresh().length >= 3, 60_000),
          `nur ${fresh().length} ffmpeg laufen`
        )
      }
    ],
    [
      'Beenden hängt nicht, danach läuft kein ffmpeg der App weiter',
      async () => {
        const proc = ctx.app.process()
        const exited = new Promise((resolve) => proc.once('exit', resolve))
        const t0 = Date.now()
        await ctx.app
          .evaluate(({ app }) => {
            setTimeout(() => app.quit(), 0)
          })
          .catch(() => {})
        await Promise.race([exited, sleep(20_000)])
        const ms = Date.now() - t0
        assert.ok(proc.exitCode !== null || proc.signalCode !== null, 'die App läuft noch')
        assert.ok(ms < 10_000, `Beenden dauerte ${ms} ms`)
        const gone = await waitFor(() => fresh().length === 0, 5_000)
        assert.ok(gone, `ffmpeg läuft weiter: ${fresh().join(', ')}`)
      }
    ],
    [
      'keine halben Ausgaben, keine halben Zwischendateien',
      async () => {
        assert.deepEqual(readdirSync(dir).sort(), [...inputs].sort())
        for (const sub of ['pieces', 'previews']) {
          const p = join(ctx.userData, 'vgen-cache', sub)
          const tmp = existsSync(p) ? readdirSync(p).filter((n) => n.includes('_tmp')) : []
          assert.deepEqual(tmp, [], `${sub}: ${tmp.join(', ')}`)
        }
      }
    ]
  ])
} finally {
  await ctx.close()
  rmSync(dir, { recursive: true, force: true })
}
