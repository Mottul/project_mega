// ffmpeg in der fertigen App aktuell halten – gegen einen lokalen Schein-Release-Server
// (MOTTULBOX_FFMPEG_RELEASES_URL): Build wählen (mindestens 7 Tage alt), laden, Prüfsumme,
// entpacken, Selbsttest, „bereit“; erst nach dem Neustart aktiv; zurück zum mitgelieferten
// (der abgelehnte Build kommt nicht wieder); falsche Prüfsumme -> nichts installiert.
// Das Archiv enthält das echte gebündelte ffmpeg unter einem erfundenen Build-Namen.
// macOS: keine Aktualisierung in der App (die Quelle liefert keine Prüfsummen) – nur der Hinweis.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findFfmpeg, launchApp, runSteps, Skip, waitFor } from './harness.mjs'

const PORT = 18095
const BASE = `http://127.0.0.1:${PORT}`
const BUILD = 'N-999999-gabcdef0123'
const NEWER_BUT_FRESH = 'N-1000000-gabcdef0456'
const win = process.platform === 'win32'
const suffix = win ? 'win64-gpl.zip' : 'linux64-gpl.tar.xz'
const asset = (build) => `ffmpeg-${build}-${suffix}`
const env = { MOTTULBOX_FFMPEG_RELEASES_URL: `${BASE}/releases` }
const dir = mkdtempSync(join(tmpdir(), 'mottulbox-e2e-ffup-'))
const ffmpeg = findFfmpeg()

/** Archiv wie bei BtbN: <name>/bin/ffmpeg(.exe) + ffprobe(.exe). */
function makeArchive(build) {
  const top = `ffmpeg-${build}-${suffix.replace(/\.(zip|tar\.xz)$/, '')}`
  const bin = join(dir, 'stage', top, 'bin')
  mkdirSync(bin, { recursive: true })
  for (const n of ['ffmpeg', 'ffprobe']) {
    const exe = win ? `${n}.exe` : n
    copyFileSync(ffmpeg.replace(/ffmpeg(\.exe)?$/, exe), join(bin, exe))
  }
  const out = join(dir, asset(build))
  if (win) {
    const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    execFileSync(tar, ['-a', '-cf', out, '-C', join(dir, 'stage'), top])
  } else execFileSync('tar', ['-cJf', out, '-C', join(dir, 'stage'), top])
  rmSync(join(dir, 'stage'), { recursive: true, force: true })
  return out
}

const days = (n) => new Date(Date.now() - n * 86_400_000).toISOString()
let wrongChecksum = false
let archive
const releases = () => [
  // neuer, aber erst 2 Tage alt: darf nicht genommen werden
  {
    tag_name: 'autobuild-2099-01-02-13-00',
    published_at: days(2),
    assets: [
      { name: 'checksums.sha256', browser_download_url: `${BASE}/dl/checksums.sha256`, size: 100 },
      { name: asset(NEWER_BUT_FRESH), browser_download_url: `${BASE}/dl/frisch`, size: 1 }
    ]
  },
  {
    tag_name: 'autobuild-2099-01-01-13-00',
    published_at: days(10),
    assets: [
      { name: 'checksums.sha256', browser_download_url: `${BASE}/dl/checksums.sha256`, size: 100 },
      {
        name: asset(BUILD),
        browser_download_url: `${BASE}/dl/${asset(BUILD)}`,
        size: archive ? readFileSync(archive).length : 0
      }
    ]
  }
]

const server = http.createServer((req, res) => {
  if (req.url === '/releases') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(releases()))
  } else if (req.url === '/dl/checksums.sha256') {
    const sum = createHash('sha256').update(readFileSync(archive)).digest('hex')
    res.end(`${wrongChecksum ? '0'.repeat(64) : sum}  ${asset(BUILD)}\n`)
  } else if (req.url === `/dl/${asset(BUILD)}`) {
    res.writeHead(200, { 'Content-Length': readFileSync(archive).length })
    res.end(readFileSync(archive))
  } else {
    res.writeHead(404)
    res.end()
  }
})

const status = (ctx) => ctx.page.evaluate(() => window.api.ffmpeg.status())

try {
  if (!ffmpeg) throw new Skip('ffmpeg fehlt (npm run ff:fetch)')
  if (process.platform === 'darwin') {
    await runSteps('ffmpeg-Aktualisierung (macOS)', [
      [
        'keine Aktualisierung in der App, Hinweis auf den Installer',
        async () => {
          const ctx = await launchApp({ env })
          try {
            const s = await status(ctx)
            assert.equal(s.supported, false)
            assert.match(s.unsupportedReason, /macOS/)
          } finally {
            await ctx.close()
          }
        }
      ]
    ])
  } else {
    archive = makeArchive(BUILD)
    await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))
    const userData = mkdtempSync(join(tmpdir(), 'mottulbox-e2e-ffup-data-'))
    let ctx = null
    await runSteps('ffmpeg in der fertigen App aktuell halten', [
      [
        'Start: neuester Build, der mindestens 7 Tage alt ist, wird geladen und geprüft',
        async () => {
          ctx = await launchApp({ env, userData })
          const s = await waitFor(async () => {
            const x = await status(ctx)
            return x.ready || x.lastError ? x : null
          }, 120_000)
          assert.ok(s, 'keine Prüfung')
          assert.equal(s.lastError, null, s.lastError)
          assert.equal(s.ready?.build, BUILD) // nicht der zwei Tage alte, neuere
          assert.equal(s.active.source, 'mitgeliefert') // erst ab dem nächsten Start
          await ctx.close()
        }
      ],
      [
        'nach dem Neustart aktiv, Konvertierung findet ffmpeg, keine zweite Installation',
        async () => {
          ctx = await launchApp({ env, userData })
          const s = await status(ctx)
          assert.equal(s.active.source, 'aktualisiert')
          assert.equal(s.active.build, BUILD)
          assert.equal(s.ready, null)
          const caps = await ctx.page.evaluate(() => window.api.converter.capabilities())
          assert.ok(caps.ffmpegFound, caps.error)
          const again = await ctx.page.evaluate(() => window.api.ffmpeg.checkUpdate())
          assert.match(again.lastResult ?? '', /Aktuell/)
          const dirs = readdirSync(join(userData, 'ffmpeg'))
          assert.ok(!dirs.some((d) => d.startsWith('tmp-')), dirs.join(', '))
        }
      ],
      [
        'zurück zum mitgelieferten: ab dem nächsten Start, der Build kommt nicht wieder',
        async () => {
          const s = await ctx.page.evaluate(() => window.api.ffmpeg.useBundled())
          assert.match(s.lastResult ?? '', /mitgeliefert/)
          await ctx.close()
          ctx = await launchApp({ env, userData })
          const after = await waitFor(async () => {
            const x = await status(ctx)
            return x.lastCheck ? x : null
          }, 60_000)
          assert.equal(after.active.source, 'mitgeliefert')
          assert.equal(after.ready, null)
          assert.match(after.lastResult ?? '', /Aktuell/)
          await ctx.close()
          ctx = null
        }
      ],
      [
        'falsche Prüfsumme: nichts installiert, keine Reste',
        async () => {
          wrongChecksum = true
          const fresh = mkdtempSync(join(tmpdir(), 'mottulbox-e2e-ffup-data-'))
          ctx = await launchApp({ env, userData: fresh })
          try {
            const s = await waitFor(async () => {
              const x = await status(ctx)
              return x.lastError || x.ready ? x : null
            }, 120_000)
            assert.match(s?.lastError ?? '', /Prüfsumme/)
            assert.equal(s.ready, null)
            const left = existsSync(join(fresh, 'ffmpeg')) ? readdirSync(join(fresh, 'ffmpeg')) : []
            assert.deepEqual(left, [])
          } finally {
            await ctx.close()
            ctx = null
            rmSync(fresh, { recursive: true, force: true })
          }
        }
      ]
    ])
    if (ctx) await ctx.close()
    rmSync(userData, { recursive: true, force: true })
  }
} catch (e) {
  if (!(e instanceof Skip)) throw e
  console.log(`– übersprungen: ${e.message}`)
} finally {
  server.close()
  rmSync(dir, { recursive: true, force: true })
}
