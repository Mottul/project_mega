// Führt die E2E-Skripte nacheinander aus (je Skript eine frische App). Ohne Argument alle,
// sonst nur die genannten: `npm run e2e -- timer player` (Namen ohne .mjs).
// Der Exit-Code ist 1, sobald irgendein Schritt fehlschlägt.

const all = [
  'smoke',
  'testpattern',
  'timer',
  'player',
  'video-generator',
  'shutdown',
  'ffmpeg-update'
]
const wanted = process.argv.slice(2)
const unknown = wanted.filter((n) => !all.includes(n))
if (unknown.length) {
  console.error(`Unbekannt: ${unknown.join(', ')} (vorhanden: ${all.join(', ')})`)
  process.exit(2)
}

for (const name of wanted.length ? wanted : all) {
  console.log(`\n=== ${name} ===`)
  await import(`./${name}.mjs`)
}
