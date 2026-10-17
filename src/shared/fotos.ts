// Fotos in Projektdateien: Sie liegen im main unter ihrem sha256 (services/fotos/fotoStore.ts);
// Werkzeuge kennen nur den Hash. Angezeigt werden sie über das Protokoll `foto://bild/<hash>`.
// Seitenbauer schreiben dieselbe Adresse ins HTML – für das PDF setzt main die Bilder ein
// (services/pdf/htmlToPdf.ts), so laufen nie Megabytes über IPC.

/** Protokoll der Fotos (registriert in main/index.ts, erlaubt in der CSP der App) */
export const FOTO_PROTOCOL = 'foto'

const HASH = /^[0-9a-f]{64}$/
const URL_RE = /foto:\/\/bild\/([0-9a-f]{64})/g

/** Längste Seite eines eingefügten Fotos in Pixeln */
export const FOTO_MAX_SIDE = 2000

export function isFotoHash(v: unknown): v is string {
  return typeof v === 'string' && HASH.test(v)
}

export function fotoUrl(hash: string): string {
  return `${FOTO_PROTOCOL}://bild/${hash}`
}

/** Foto-Adressen im HTML ersetzen; `null` lässt die Adresse stehen. */
export function replaceFotoUrls(html: string, fn: (hash: string) => string | null): string {
  return html.replace(URL_RE, (all, hash: string) => fn(hash) ?? all)
}

/** Alle Hashes, auf die das HTML verweist (ohne Doppelte) */
export function fotoHashesIn(html: string): string[] {
  return [...new Set(Array.from(html.matchAll(URL_RE), (m) => m[1]))]
}
