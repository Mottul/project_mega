// Gemeinsamer Lader für das optionale NDI-Binding (rse/grandiose) -- genutzt
// von Timer- und Player-NDI-Ausgabe. Bevorzugt wird das .node-Binary DIREKT
// geladen (build/Release/grandiose.node): so braucht die paketierte App
// grandioses node_modules (bindings) nicht -- electron-builder kopiert
// node_modules in extraResources nämlich nicht mit. Der Verzeichnis-/Paket-
// Require bleibt als Fallback für ein regulär installiertes Modul.
// Einrichtung: `npm run ndi:setup` (siehe scripts/setup-ndi.mjs + README).

import { app } from 'electron'
import { join } from 'node:path'
import { logLine } from './log'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Grandiose = {
  send(opts: { name: string; clockVideo?: boolean; clockAudio?: boolean }): Promise<any>
  initialize?: () => unknown
  FOURCC_BGRA?: number
  FOURCC_BGRX?: number
  FOURCC_FLTp?: number
  FORMAT_TYPE_PROGRESSIVE?: number
}

let grandiose: Grandiose | null = null
let loadError: string | null = null
let loadTried = false

/** FourCC wie in grandiose/index.js -- die Konstanten leben dort im JS-Wrapper,
 *  den wir beim Direkt-Laden des .node-Binaries bewusst umgehen. */
export function fourcc(s: string): number {
  return (
    s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24)
  )
}

export function getNdiLoadError(): string | null {
  return loadError
}

export function loadGrandiose(): Grandiose | null {
  if (loadTried) return grandiose
  loadTried = true
  const bases = [
    join(process.resourcesPath ?? '', 'vendor', 'grandiose'), // paketierte App (extraResources)
    join(app.getAppPath(), 'vendor', 'grandiose') // Entwicklung (npm run ndi:setup)
  ]
  const attempts = [
    ...bases.flatMap((b) => [join(b, 'build', 'Release', 'grandiose.node'), b]),
    'grandiose' // regulär installiertes Modul (node_modules)
  ]
  const errors: string[] = []
  for (const attempt of attempts) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(attempt) as Grandiose
      if (typeof mod.send !== 'function') {
        errors.push(`${attempt}: kann nicht senden (sende-fähigen Fork rse/grandiose nutzen)`)
        continue
      }
      // Konstanten normalisieren: beim rohen Addon fehlen die JS-Wrapper-Werte.
      grandiose = {
        send: mod.send.bind(mod),
        initialize: mod.initialize?.bind(mod),
        FOURCC_BGRA: mod.FOURCC_BGRA ?? fourcc('BGRA'),
        FOURCC_BGRX: mod.FOURCC_BGRX ?? fourcc('BGRX'),
        FOURCC_FLTp: mod.FOURCC_FLTp ?? fourcc('FLTp'),
        FORMAT_TYPE_PROGRESSIVE: mod.FORMAT_TYPE_PROGRESSIVE ?? 1
      }
      logLine('[ndi] Binding geladen:', attempt)
      return grandiose
    } catch (err) {
      errors.push(`${attempt}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  loadError = `NDI-Modul nicht geladen (npm run ndi:setup ausführen). ${errors.join(' | ')}`
  return null
}

let ndiInitialized = false

/** NDI-Laufzeit einmalig initialisieren (offiziell vor der Nutzung vorgesehen). */
export async function ensureNdiInitialized(g: Grandiose): Promise<void> {
  if (ndiInitialized) return
  if (g.initialize) {
    try {
      await Promise.resolve(g.initialize())
    } catch (err) {
      logLine('[ndi] initialize():', err instanceof Error ? err.message : String(err))
    }
  }
  ndiInitialized = true
}
