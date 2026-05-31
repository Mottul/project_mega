// Baut die nativen Module (better-sqlite3) gegen die ABI der gebuendelten
// Electron-Version -- OHNE node-gyp/Compiler, indem prebuild-install das
// passende, vorgebaute Binary aus dem GitHub-Release des Pakets laedt.
//
// Wird als postinstall ausgefuehrt. Bewusst KEIN electron-builder/@electron/rebuild,
// damit die verwundbare node-gyp/tar-Kette nicht im Dependency-Baum landet.
//
// Fallback: schlaegt der Prebuild-Download fehl (z.B. exotische Plattform),
// versucht prebuild-install selbst node-gyp -- dann braucht es lokal Build-Tools.

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

function electronVersion() {
  try {
    // electron exportiert seine Version als String aus package.json
    return require('electron/package.json').version
  } catch {
    return null
  }
}

const NATIVE_MODULES = ['better-sqlite3']

const version = electronVersion()
if (!version) {
  console.log('[rebuild-native] electron nicht gefunden — ueberspringe (vermutlich CI/ohne devDeps).')
  process.exit(0)
}

const isWin = process.platform === 'win32'
const binName = isWin ? 'prebuild-install.cmd' : 'prebuild-install'

let failed = false
for (const mod of NATIVE_MODULES) {
  let pkgDir
  try {
    pkgDir = dirname(require.resolve(`${mod}/package.json`))
  } catch {
    console.log(`[rebuild-native] ${mod} nicht installiert — uebersprungen.`)
    continue
  }
  const bin = join(ROOT, 'node_modules', '.bin', binName)
  console.log(`[rebuild-native] ${mod}: hole Electron-Prebuild (target=${version})`)
  const r = spawnSync(
    bin,
    ['--runtime=electron', `--target=${version}`, `--arch=${process.arch}`],
    { cwd: pkgDir, stdio: 'inherit', shell: isWin }
  )
  if (r.status !== 0) {
    failed = true
    console.error(`[rebuild-native] ${mod}: Prebuild-Download fehlgeschlagen (Code ${r.status}).`)
  }
}

if (failed) {
  console.error(
    '\n[rebuild-native] Mindestens ein natives Modul konnte nicht vorgebaut werden.\n' +
      'Internetzugang pruefen oder lokale Build-Tools installieren (Visual Studio "Desktop\n' +
      'development with C++" / Xcode CLT / build-essential), dann erneut: npm run rebuild:native'
  )
  process.exit(1)
}
console.log('[rebuild-native] fertig.')
