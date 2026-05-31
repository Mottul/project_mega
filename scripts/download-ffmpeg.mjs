// Laedt HAP-faehige ffmpeg/ffprobe-Builds pro Plattform nach resources/ffmpeg/<os>/.
// HAP braucht --enable-libsnappy zur Compile-Zeit -> diese Quellen liefern das:
//   win   : BtbN "win64-gpl"   (GPL, .zip mit libsnappy/HAP)
//   linux : BtbN "linux64-gpl"
//   mac   : evermeet.cx        (einzelne Binaries)
// Aufruf: node scripts/download-ffmpeg.mjs [--platform win|mac|linux] [--all]
// (ohne Argumente: aktuelle Plattform)

import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  mkdirSync,
  readdirSync,
  rmSync
} from 'node:fs'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const SOURCES = {
  win: {
    type: 'zip',
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    bins: ['ffmpeg.exe', 'ffprobe.exe']
  },
  linux: {
    type: 'tar.xz',
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
    bins: ['ffmpeg', 'ffprobe']
  },
  mac: {
    type: 'evermeet',
    urls: {
      ffmpeg: 'https://evermeet.cx/ffmpeg/getrelease/zip',
      ffprobe: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip'
    },
    bins: ['ffmpeg', 'ffprobe']
  }
}

function osKey(platform = process.platform) {
  if (platform === 'win32' || platform === 'win') return 'win'
  if (platform === 'darwin' || platform === 'mac') return 'mac'
  return 'linux'
}

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('Zu viele Redirects'))
    https
      .get(url, { headers: { 'User-Agent': 'av-toolbox-build' } }, (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          resolve(download(res.headers.location, dest, redirects + 1))
          return
        }
        if (status !== 200) {
          res.resume()
          reject(new Error(`HTTP ${status} bei ${url}`))
          return
        }
        const out = createWriteStream(dest)
        res.pipe(out)
        out.on('finish', () => out.close(() => resolve()))
        out.on('error', reject)
      })
      .on('error', reject)
  })
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`${cmd} fehlgeschlagen (Code ${r.status})`)
}

function findFile(dir, name) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const fp = join(dir, e.name)
    if (e.isDirectory()) {
      const found = findFile(fp, name)
      if (found) return found
    } else if (e.name.toLowerCase() === name.toLowerCase()) {
      return fp
    }
  }
  return null
}

function extract(file, destDir, type) {
  if (type === 'tar.xz') {
    run('tar', ['-xJf', file, '-C', destDir])
  } else if (process.platform === 'win32') {
    run('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Force -Path "${file}" -DestinationPath "${destDir}"`
    ])
  } else {
    run('unzip', ['-o', file, '-d', destDir])
  }
}

async function build(targetOs) {
  const src = SOURCES[targetOs]
  const outDir = join(ROOT, 'resources', 'ffmpeg', targetOs)
  mkdirSync(outDir, { recursive: true })
  const tmp = join(tmpdir(), `ff-${targetOs}-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })

  try {
    if (src.type === 'evermeet') {
      for (const bin of src.bins) {
        const zip = join(tmp, `${bin}.zip`)
        console.log(`  ↓ ${src.urls[bin]}`)
        await download(src.urls[bin], zip)
        extract(zip, tmp, 'zip')
      }
    } else {
      const archive = join(tmp, src.type === 'zip' ? 'ffmpeg.zip' : 'ffmpeg.tar.xz')
      console.log(`  ↓ ${src.url}`)
      await download(src.url, archive)
      extract(archive, tmp, src.type)
    }

    for (const bin of src.bins) {
      const found = findFile(tmp, bin)
      if (!found) throw new Error(`${bin} im Archiv nicht gefunden`)
      const target = join(outDir, bin)
      copyFileSync(found, target)
      if (targetOs !== 'win') chmodSync(target, 0o755)
    }

    // Verifikation nur moeglich, wenn das Ziel der aktuellen Plattform entspricht
    if (targetOs === osKey()) {
      const ffmpegBin = join(outDir, targetOs === 'win' ? 'ffmpeg.exe' : 'ffmpeg')
      const r = spawnSync(ffmpegBin, ['-hide_banner', '-encoders'], { encoding: 'utf-8' })
      const hasHap = (r.stdout ?? '').split('\n').some((l) => /^\s*[A-Z.]{6}\s+hap\b/i.test(l))
      console.log(hasHap ? '  ✓ HAP-Encoder vorhanden' : '  ⚠ HAP-Encoder NICHT gefunden!')
    }
    console.log(`  ✓ abgelegt in ${outDir}`)
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

const argv = process.argv.slice(2)
let targets = [osKey()]
if (argv.includes('--all')) targets = ['win', 'mac', 'linux']
else if (argv.includes('--platform')) targets = [osKey(argv[argv.indexOf('--platform') + 1])]

for (const t of targets) {
  console.log(`\n=== ffmpeg fuer ${t} ===`)
  await build(t)
}
