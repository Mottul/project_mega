// Regeln der Fenster-Wächter und der Shell-Aufrufe – rein (ohne Electron), getestet in
// windowPolicy.test.ts. Angewendet von windowGuards.ts, appWindows.ts und dialog.handlers.ts.

/** Wo die App-Seite liegt: gebaute index.html (file://) bzw. im Entwickeln der Vite-Server. */
export interface AppPages {
  /** file://-Adresse der gebauten index.html */
  indexFile: string
  /** Ursprung des Vite-Servers (http://localhost:5173), sonst null */
  devOrigin: string | null
}

/**
 * Adresse des Vite-Servers – nur beim Entwickeln und nur auf diesem Rechner. Die fertige App
 * folgt `ELECTRON_RENDERER_URL` nie: Sonst lüde sie mit gesetzter Umgebungsvariable eine fremde
 * Seite und gäbe ihr die App-API (Preload).
 */
export function devServerUrl(isPackaged: boolean, env: string | undefined): string | null {
  if (isPackaged || !env) return null
  try {
    const u = new URL(env)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'
    return (u.protocol === 'http:' || u.protocol === 'https:') && local ? env : null
  } catch {
    return null
  }
}

/** Gehört die Adresse zur App-Seite (beliebige Route im Hash)? */
export function isAppPage(url: string | undefined, pages: AppPages): boolean {
  if (!url) return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (pages.devOrigin) return u.origin === pages.devOrigin
  if (u.protocol !== 'file:') return false
  // Laufwerksbuchstabe und Groß-/Kleinschreibung können je nach Quelle abweichen
  const path = (p: string): string => decodeURIComponent(p).toLowerCase()
  return path(u.pathname) === path(new URL(pages.indexFile).pathname)
}

/**
 * Browser-Berechtigungen: Die App braucht fast keine. Erlaubt nur für die App-Seite selbst:
 * Vollbild, Text in die Zwischenablage und (als Abfrage) die Wahl des Audio-Ausgabegeräts im
 * Jingle-Player. Kamera, Mikrofon, Standort, Benachrichtigungen, MIDI, USB … nie – auch nicht
 * „media“ als Abfrage: Die Ausgabegeräte behalten ihre Namen auch ohne (gemessen), eine Seite
 * sähe damit aber die Namen aller Mikrofone.
 */
const REQUESTS = new Set(['fullscreen', 'clipboard-sanitized-write'])
const CHECKS = new Set(['fullscreen', 'clipboard-sanitized-write', 'speaker-selection'])

export function permissionAllowed(
  kind: 'request' | 'check',
  permission: string,
  fromApp: boolean
): boolean {
  return fromApp && (kind === 'request' ? REQUESTS : CHECKS).has(permission)
}

/**
 * Pfad für die Shell (Ordner öffnen, im Ordner zeigen): nur ein absoluter Pfad, kein Protokoll
 * (`file:`, `http:` …), kein Nullbyte. Netzwerkpfade (`\\server\freigabe`) nur mit `network` –
 * Windows meldet sich beim Zugriff dort an, ein fremder Server bekäme so Anmeldedaten zu sehen.
 */
export function shellTarget(target: unknown, opts: { network: boolean }): string | null {
  if (typeof target !== 'string' || !target || target.length > 4096) return null
  if (target.includes('\0')) return null
  const unc = /^[\\/]{2}[^\\/]/.test(target)
  if (unc) return opts.network ? target : null
  const windowsAbs = /^[a-z]:[\\/]/i.test(target)
  const posixAbs = target.startsWith('/') && !target.startsWith('//')
  return windowsAbs || posixAbs ? target : null
}

/** Nur http(s) an den Standardbrowser – nie `file:`, `javascript:` oder eigene Protokolle. */
export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}
