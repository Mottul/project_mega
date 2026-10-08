// Auswahl eines ffmpeg-Builds für die Aktualisierung in der fertigen App – rein und getestet.
// Quelle: die täglichen „autobuild-…“-Releases von BtbN/FFmpeg-Builds (dieselben Builds, die
// scripts/download-ffmpeg.mjs als „latest“ holt). Genommen wird der neueste Build, der
// mindestens `minAgeDays` alt ist: Wie bei den npm-Paketen (SICHERHEIT.md) fallen kaputte oder
// kompromittierte Builds meist in den ersten Tagen auf, und die CI hat ihn bis dahin getestet.

/** Ausschnitt eines Releases aus der GitHub-API (nur was gebraucht wird). */
export interface ReleaseInfo {
  tag_name: string
  published_at: string
  assets: { name: string; browser_download_url: string; size: number }[]
}

export type UpdatePlatform = 'win' | 'linux'

export interface BuildCandidate {
  tag: string
  /** „N-127252-ga25ba44c0c“ – auch Ordnername des Builds */
  build: string
  /** fortlaufende Nummer der Entwicklungsversion (größer = neuer) */
  number: number
  publishedAt: string
  asset: string
  url: string
  size: number
  checksumsUrl: string
}

const ASSET_RE: Record<UpdatePlatform, RegExp> = {
  win: /^ffmpeg-(N-(\d+)-g[0-9a-f]{6,40})-win64-gpl\.zip$/,
  linux: /^ffmpeg-(N-(\d+)-g[0-9a-f]{6,40})-linux64-gpl\.tar\.xz$/
}

/** Nummer aus „ffmpeg version N-127252-ga25ba44c0c-20261008 …“ oder einem Build-Namen. */
export function buildNumber(text: string | null | undefined): number | null {
  const m = /\bN-(\d+)-g[0-9a-f]+/.exec(text ?? '')
  return m ? Number(m[1]) : null
}

/**
 * Neuester passender Build, der mindestens `minAgeDays` alt ist; null, wenn keiner passt.
 * `allowedUrlPrefix`: Downloads nur von dort – eine veränderte API-Antwort darf nie bestimmen,
 * von wo eine ausführbare Datei geladen wird.
 */
export function pickCandidate(
  releases: ReleaseInfo[],
  platform: UpdatePlatform,
  now: number,
  minAgeDays: number,
  allowedUrlPrefix: string
): BuildCandidate | null {
  let best: BuildCandidate | null = null
  for (const r of releases) {
    if (!/^autobuild-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(r.tag_name)) continue
    const published = Date.parse(r.published_at)
    if (!Number.isFinite(published) || now - published < minAgeDays * 86_400_000) continue
    const sums = r.assets.find((a) => a.name === 'checksums.sha256')
    if (!sums || !sums.browser_download_url.startsWith(allowedUrlPrefix)) continue
    for (const a of r.assets) {
      const m = ASSET_RE[platform].exec(a.name)
      if (!m || !a.browser_download_url.startsWith(allowedUrlPrefix)) continue
      const number = Number(m[2])
      if (best && best.number >= number) continue
      best = {
        tag: r.tag_name,
        build: m[1],
        number,
        publishedAt: r.published_at,
        asset: a.name,
        url: a.browser_download_url,
        size: a.size,
        checksumsUrl: sums.browser_download_url
      }
    }
  }
  return best
}

/** Prüfsummen-Datei: je Zeile „<sha256>  <dateiname>“ (wie sha256sum). */
export function checksumFor(text: string, file: string): string | null {
  for (const line of text.split('\n')) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)$/i.exec(line.trim())
    if (m && m[2] === file) return m[1].toLowerCase()
  }
  return null
}

/** Was ein Build für die Mottulbox können muss (Selbsttest vor dem Aktivieren). */
export const REQUIRED_ENCODERS = ['libx264', 'prores_ks', 'hap', 'aac', 'pcm_s16le']
export const REQUIRED_FILTERS = ['scale', 'xfade', 'perspective', 'loudnorm', 'setparams']

/** Fehlendes aus den Listen; leer = Build taugt. */
export function missingFeatures(encoders: Set<string>, filters: Set<string>): string[] {
  return [
    ...REQUIRED_ENCODERS.filter((e) => !encoders.has(e)),
    ...REQUIRED_FILTERS.filter((f) => !filters.has(f))
  ]
}
