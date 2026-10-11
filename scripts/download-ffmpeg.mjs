// Laedt HAP-faehige ffmpeg/ffprobe-Builds pro Plattform nach resources/ffmpeg/<os>/.
// HAP braucht --enable-libsnappy zur Compile-Zeit -> diese Quellen liefern das:
//   win   : BtbN "win64-gpl"   (GPL, .zip mit libsnappy/HAP)
//   linux : BtbN "linux64-gpl"
//   mac   : evermeet.cx        (einzelne Binaries)
// Aufruf: node scripts/download-ffmpeg.mjs [--platform win|mac|linux] [--all] [--force]
//         [--max-age <tage>]
// (ohne Argumente: aktuelle Plattform, nur laden, wenn noch keins da ist)
//
// --max-age: aktuell halten – neu laden, wenn der vorhandene Build älter ist (Stand in
// stand.json neben den Binaries). Läuft vor `dev`/`start`/`e2e` und beim Paketieren; schlägt
// das Laden fehl (offline, ffmpeg gerade in Benutzung), geht es mit dem vorhandenen weiter.
//
// Geprüft wird jeder Download, bevor er ausgepackt wird: BtbN gegen die checksums.sha256
// DESSELBEN Releases (wie die Aktualisierung in der App, services/ffmpeg/ffmpegUpdate.ts),
// evermeet gegen die veröffentlichte Größe der versionierten Datei (evermeet signiert nur per GPG).

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
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
    // je Binary: Name, Version, Größe und Adresse der versionierten zip
    infos: {
      ffmpeg: 'https://evermeet.cx/ffmpeg/info/ffmpeg/release',
      ffprobe: 'https://evermeet.cx/ffmpeg/info/ffprobe/release'
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

/** Kleine Textantwort (Prüfsummen, Infos) laden – über dieselben Umleitungen wie download(). */
async function fetchText(url) {
  const tmp = join(tmpdir(), `ff-text-${process.pid}-${Date.now()}`)
  try {
    await download(url, tmp)
    return readFileSync(tmp, 'utf8')
  } finally {
    rmSync(tmp, { force: true })
  }
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/** Prüfsummen-Datei: je Zeile „<sha256>  <dateiname>“ (wie checksumFor in ffmpegUpdatePlan.ts). */
function checksumFor(text, name) {
  for (const line of text.split('\n')) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)$/i.exec(line.trim())
    if (m && m[2] === name) return m[1].toLowerCase()
  }
  return null
}

/** BtbN: Archiv gegen die checksums.sha256 desselben Releases prüfen. */
async function verifyBtbN(url, archive) {
  const name = url.slice(url.lastIndexOf('/') + 1)
  const sums = await fetchText(url.slice(0, url.lastIndexOf('/') + 1) + 'checksums.sha256')
  const expected = checksumFor(sums, name)
  if (!expected) throw new Error(`keine Prüfsumme für ${name} veröffentlicht`)
  const actual = sha256(archive)
  // „latest“ kann zwischen beiden Downloads wechseln – dann einfach später noch einmal
  if (actual !== expected) throw new Error(`Prüfsumme von ${name} stimmt nicht – nicht übernommen`)
  console.log(`  ✓ Prüfsumme stimmt (${actual.slice(0, 12)}…)`)
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

const outDirOf = (targetOs) => join(ROOT, 'resources', 'ffmpeg', targetOs)
const hasBins = (targetOs) =>
  SOURCES[targetOs].bins.every((b) => existsSync(join(outDirOf(targetOs), b)))

/** Alter des vorhandenen Builds in Tagen (aus stand.json); null = unbekannt. */
function ageDays(outDir) {
  try {
    const { geladen } = JSON.parse(readFileSync(join(outDir, 'stand.json'), 'utf8'))
    const t = Date.parse(geladen)
    return Number.isFinite(t) ? (Date.now() - t) / 86_400_000 : null
  } catch {
    return null
  }
}

async function build(targetOs) {
  const src = SOURCES[targetOs]
  const outDir = outDirOf(targetOs)
  mkdirSync(outDir, { recursive: true })

  // Schon vorhanden? -> nicht erneut laden (spart ~220 MB pro Lauf); mit --max-age nur, solange
  // der Build jung genug ist; mit --force immer neu
  if (!FORCE && hasBins(targetOs)) {
    const age = ageDays(outDir)
    if (MAX_AGE === null) {
      console.log(`  ✓ bereits vorhanden in ${outDir} (mit --force neu laden)`)
      return
    }
    if (age !== null && age < MAX_AGE) {
      console.log(`  ✓ aktuell (vor ${age.toFixed(1).replace('.', ',')} Tagen geladen)`)
      return
    }
    console.log(
      age === null
        ? '  ↻ Stand unbekannt – lade den neuesten Build'
        : `  ↻ ${Math.floor(age)} Tage alt – lade den neuesten Build`
    )
  }
  const tmp = join(tmpdir(), `ff-${targetOs}-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })

  try {
    if (src.type === 'evermeet') {
      for (const bin of src.bins) {
        const info = JSON.parse(await fetchText(src.infos[bin]))
        const zipInfo = info?.download?.zip
        if (!zipInfo?.url || !Number.isFinite(zipInfo.size)) {
          throw new Error(`evermeet: keine Download-Angaben für ${bin}`)
        }
        const zip = join(tmp, `${bin}.zip`)
        console.log(`  ↓ ${zipInfo.url}`)
        await download(zipInfo.url, zip)
        const size = statSync(zip).size
        if (size !== zipInfo.size) {
          throw new Error(`${bin}: ${size} statt ${zipInfo.size} Bytes – nicht übernommen`)
        }
        console.log(`  ✓ Größe stimmt (${bin} ${info.version})`)
        extract(zip, tmp, 'zip')
      }
    } else {
      const archive = join(tmp, src.type === 'zip' ? 'ffmpeg.zip' : 'ffmpeg.tar.xz')
      console.log(`  ↓ ${src.url}`)
      await download(src.url, archive)
      await verifyBtbN(src.url, archive)
      extract(archive, tmp, src.type)
    }

    // erst alle neben das Ziel kopieren, dann austauschen: ein abgebrochener Lauf hinterlässt
    // nie eine halbe Binary (läuft ffmpeg gerade, scheitert unter Windows das Umbenennen)
    const fresh = src.bins.map((bin) => {
      const found = findFile(tmp, bin)
      if (!found) throw new Error(`${bin} im Archiv nicht gefunden`)
      const next = join(outDir, `${bin}.neu`)
      copyFileSync(found, next)
      if (targetOs !== 'win') chmodSync(next, 0o755)
      return { next, target: join(outDir, bin) }
    })
    try {
      for (const f of fresh) renameSync(f.next, f.target)
    } finally {
      for (const f of fresh) rmSync(f.next, { force: true })
    }

    // Verifikation nur moeglich, wenn das Ziel der aktuellen Plattform entspricht
    let version = null
    if (targetOs === osKey()) {
      const ffmpegBin = join(outDir, targetOs === 'win' ? 'ffmpeg.exe' : 'ffmpeg')
      const r = spawnSync(ffmpegBin, ['-hide_banner', '-encoders'], { encoding: 'utf-8' })
      const hasHap = (r.stdout ?? '').split('\n').some((l) => /^\s*[A-Z.]{6}\s+hap\b/i.test(l))
      console.log(hasHap ? '  ✓ HAP-Encoder vorhanden' : '  ⚠ HAP-Encoder NICHT gefunden!')
      const v = spawnSync(ffmpegBin, ['-version'], { encoding: 'utf-8' })
      version = (v.stdout ?? '').split('\n')[0].trim() || null
      if (version) console.log(`  ✓ ${version}`)
    }
    writeFileSync(
      join(outDir, 'stand.json'),
      JSON.stringify(
        { geladen: new Date().toISOString(), quelle: src.url ?? src.infos, version },
        null,
        2
      ) + '\n'
    )
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
const FORCE = argv.includes('--force')
const MAX_AGE = argv.includes('--max-age') ? Number(argv[argv.indexOf('--max-age') + 1]) : null
if (MAX_AGE !== null && !(MAX_AGE >= 0)) throw new Error('--max-age braucht eine Zahl (Tage)')
let targets = [osKey()]
if (argv.includes('--all')) targets = ['win', 'mac', 'linux']
else if (argv.includes('--platform')) targets = [osKey(argv[argv.indexOf('--platform') + 1])]

for (const t of targets) {
  console.log(`\n=== ffmpeg fuer ${t} ===`)
  try {
    await build(t)
  } catch (err) {
    // Aktuell-Halten darf den Start nie blockieren: offline oder ffmpeg in Benutzung -> weiter
    if (MAX_AGE === null) throw err
    console.warn(
      hasBins(t)
        ? `  ⚠ Aktualisieren fehlgeschlagen (${err.message}) – weiter mit dem vorhandenen ffmpeg`
        : `  ⚠ ffmpeg nicht geladen (${err.message}) – die Werkzeuge zeigen einen Hinweis`
    )
  }
}
