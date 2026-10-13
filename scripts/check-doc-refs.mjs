// Prüft, ob die Dateien, die CLAUDE.md, README, docs/ und die Projekt-Skills nennen, noch existieren.
// Nach dem Verschieben oder Umbenennen zeigten sie sonst still ins Leere – und Skills leiten
// künftige Arbeit an die falsche Stelle (main/services nach Bereichen geordnet, Oktober 2026).
// Geprüft wird jeder Verweis in Backticks mit Dateiendung: voller Pfad, Teilpfad (`player/x.ts`
// passt auf src/main/services/player/x.ts) oder bloßer Dateiname irgendwo im Repository.
// Aufruf: npm run check:refs (läuft auch in der CI). Ohne Treffer still, sonst Liste und Code 1.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REF = /`(@?[\w./-]+\.(?:tsx?|mjs|cjs|js|json|md|ya?ml|css|html))`/g
const ALIAS = [
  ['@shared/', 'src/shared/'],
  ['@renderer/', 'src/renderer/src/']
]
/** Gibt es nur zur Laufzeit, im Build oder in einem Paket – nicht im Repository */
const ELSEWHERE = new Set([
  'settings.json', // userData
  'sw.js', // Service Worker der Rechner-PWA (Build)
  'index.js', // NDI-Binding in vendor/grandiose
  'install.js' // node_modules/electron
])

/** Verweise eines Textes, die auf keine der Dateien passen; leer = alles gut. */
export function findMissing(text, files) {
  const names = new Set(files.map((f) => basename(f)))
  const missing = []
  for (const [, raw] of text.matchAll(REF)) {
    if (ELSEWHERE.has(raw)) continue
    let ref = raw.replace(/^\.\//, '')
    for (const [from, to] of ALIAS) if (ref.startsWith(from)) ref = to + ref.slice(from.length)
    const found = ref.includes('/')
      ? files.some((f) => f === ref || f.endsWith('/' + ref))
      : names.has(ref)
    if (!found && !missing.includes(raw)) missing.push(raw)
  }
  return missing
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // auch neue, noch nicht vorgemerkte Dateien: sonst prüft der lokale Lauf ein frisch angelegtes
  // Skill nicht, und erst die CI meldet seine Verweise
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      encoding: 'utf8',
      maxBuffer: 64 << 20
    }
  )
  const files = out.split('\0').filter(Boolean)
  const docs = files.filter(
    (f) =>
      f === 'CLAUDE.md' ||
      f === 'README.md' ||
      /^docs\/[^/]+\.md$/.test(f) ||
      /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f)
  )
  const problems = []
  for (const doc of docs) {
    const missing = findMissing(readFileSync(doc, 'utf8'), files).filter(
      // Pfade in Paketen (z. B. electron/checksums.json) zählen als vorhanden
      (ref) => !existsSync(join('node_modules', ref))
    )
    for (const ref of missing) problems.push(`${doc}: \`${ref}\``)
  }
  if (problems.length) {
    console.error('Verweise auf Dateien, die es nicht (mehr) gibt:')
    for (const p of problems) console.error('  ' + p)
    process.exit(1)
  }
}
