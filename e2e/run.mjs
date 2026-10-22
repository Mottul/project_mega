// Führt die E2E-Skripte nacheinander aus (je Skript eine frische App). Ohne Argument alle,
// sonst nur die genannten: `npm run e2e -- timer player` (Namen ohne .mjs). `paket` (die gepackte
// App aus dist/) läuft nur auf Wunsch – es braucht vorher `npm run package:dir`.
// Der Exit-Code ist 1, sobald irgendein Schritt fehlschlägt.

const all = [
  'smoke',
  'layout',
  'security',
  'testpattern',
  'testton',
  'timer',
  'player',
  'osc',
  'rta',
  'video-generator',
  'projektdatei',
  'kabelverlauf',
  'pdf',
  'fotos',
  'mini-manual',
  'shutdown',
  'ndi',
  'youtube',
  'ffmpeg-update'
]
const nurAufWunsch = ['paket']
const wanted = process.argv.slice(2)
const unknown = wanted.filter((n) => !all.includes(n) && !nurAufWunsch.includes(n))
if (unknown.length) {
  console.error(`Unbekannt: ${unknown.join(', ')} (vorhanden: ${all.join(', ')})`)
  process.exit(2)
}

for (const name of wanted.length ? wanted : all) {
  console.log(`\n=== ${name} ===`)
  await import(`./${name}.mjs`)
}
