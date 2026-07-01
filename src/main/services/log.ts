// Einfacher Datei-Logger fuer den main-Prozess. Schreibt nach
// <userData>/avtoolbox-debug.log -- im gepackten App ist die main-Konsole sonst
// unsichtbar. Bewusst synchron + best effort (wirft nie).

import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

let cachedPath: string | null = null

export function logFilePath(): string {
  if (!cachedPath) {
    const dir = app.getPath('userData')
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      /* ignore */
    }
    cachedPath = join(dir, 'avtoolbox-debug.log')
  }
  return cachedPath
}

function fmt(p: unknown): string {
  if (typeof p === 'string') return p
  try {
    return JSON.stringify(p)
  } catch {
    return String(p)
  }
}

export function logLine(...parts: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${parts.map(fmt).join(' ')}\n`
  try {
    appendFileSync(logFilePath(), line)
  } catch {
    /* ignore */
  }
  console.log('[avtoolbox]', ...parts)
}
