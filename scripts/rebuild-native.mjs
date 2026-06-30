// Baut die nativen Module (better-sqlite3) gegen die ABI der gebuendelten
// Electron-Version -- OHNE node-gyp/Compiler, indem prebuild-install das
// passende, vorgebaute Binary aus dem GitHub-Release des Pakets laedt.
//
// Wird als postinstall ausgefuehrt. Bewusst KEIN electron-builder/@electron/rebuild,
// damit die verwundbare node-gyp/tar-Kette nicht im Dependency-Baum landet.
//
// WICHTIG: prebuild-install wird ueber `node <bin.js>` ohne Shell gestartet (nicht
// ueber den .cmd-Shim mit shell:true). Sonst zerlegt cmd.exe Projektpfade mit
// Leerzeichen (z.B. "E:\Meine Programme\...") und der Aufruf schlaegt fehl.
//
// Fallback bei fehlendem Prebuild: lokale Build-Tools noetig (siehe README).

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const NATIVE_MODULES = ['better-sqlite3']

function pkgVersion(name) {
  try {
    return require(`${name}/package.json`).version
  } catch {
    return null
  }
}

// Pfad zur prebuild-install-CLI (bin.js), aufgeloest aus Sicht des nativen Moduls
// (prebuild-install ist dessen Dependency -- funktioniert gehoistet wie nested).
function resolvePrebuildBin(fromDir) {
  const pkgJsonPath = require.resolve('prebuild-install/package.json', { paths: [fromDir] })
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['prebuild-install']
  return join(dirname(pkgJsonPath), rel)
}

const version = pkgVersion('electron')
if (!version) {
  console.log(
    '[rebuild-native] electron nicht gefunden — ueberspringe (vermutlich CI/ohne devDeps).'
  )
  process.exit(0)
}

let failed = false
for (const mod of NATIVE_MODULES) {
  let pkgDir
  try {
    pkgDir = dirname(require.resolve(`${mod}/package.json`))
  } catch {
    console.log(`[rebuild-native] ${mod} nicht installiert — uebersprungen.`)
    continue
  }

  let prebuildBin
  try {
    prebuildBin = resolvePrebuildBin(pkgDir)
  } catch {
    failed = true
    console.error(`[rebuild-native] ${mod}: prebuild-install nicht gefunden.`)
    continue
  }

  console.log(`[rebuild-native] ${mod}: hole Electron-Prebuild (target=${version})`)
  // Kein shell:true und process.execPath als Programm -> Leerzeichen im Pfad sind unkritisch.
  const r = spawnSync(
    process.execPath,
    [prebuildBin, '--runtime=electron', `--target=${version}`, `--arch=${process.arch}`],
    { cwd: pkgDir, stdio: 'inherit' }
  )
  if (r.error || r.status !== 0) {
    failed = true
    console.error(
      `[rebuild-native] ${mod}: Prebuild-Download fehlgeschlagen (Code ${r.status ?? r.error?.code}).`
    )
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
