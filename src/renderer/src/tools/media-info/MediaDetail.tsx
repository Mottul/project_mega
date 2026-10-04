// Detailansicht einer analysierten Datei: Kopf mit Merkmal-Chips, „Auf einen
// Blick"-Kacheln, Ampel-Hinweise und aufklappbare Detail-Abschnitte.

import { useState, type ReactNode } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Copy,
  FileCog,
  FolderOpen,
  RefreshCw,
  Trash2,
  XCircle
} from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/lib/toast'
import { cn } from '@renderer/lib/utils'
import type { MediaInfo, MediaVideoTrack } from '@shared/types'
import {
  aspectLabel,
  audioLine,
  channelLabel,
  codecClassLabel,
  codecLine,
  colorLabel,
  fmtBitrate,
  fmtBytes,
  fmtDate,
  fmtDuration,
  fmtFps,
  fmtMBps,
  fmtResolution,
  fpsLabel,
  fpsModeLabel,
  gopLabel,
  hdrLabel,
  languageLabel,
  nf,
  resolutionClass,
  rotationLabel,
  sampleRateLabel,
  scanLabel,
  shortFormat,
  splitPath,
  errorText
} from './format'
import { countLevels, mainVideo, worstLevel, type HintLevel, type MediaHint } from './hints'
import { LEVEL_META } from './levels'
import { factSheet } from './report'
import { useMediaInfo, useMediaInfoPrefs, type MediaEntry } from './store'

export async function copyText(text: string, what: string): Promise<void> {
  const cb = navigator.clipboard
  if (!cb) {
    toast.error('Zwischenablage nicht verfügbar')
    return
  }
  try {
    await cb.writeText(text)
    toast.success(`${what} kopiert`)
  } catch (e) {
    toast.error('Kopieren fehlgeschlagen', e instanceof Error ? e.message : undefined)
  }
}

/** Zusammenfassendes Status-Badge („OK" / „2 Warnungen" / „1 Problem"). */
export function StatusBadge({ hints }: { hints: MediaHint[] }): JSX.Element {
  const worst = worstLevel(hints)
  const c = countLevels(hints)
  const meta = LEVEL_META[worst]
  const text =
    worst === 'problem'
      ? `${c.problem} ${c.problem === 1 ? 'Problem' : 'Probleme'}`
      : worst === 'warning'
        ? `${c.warning} ${c.warning === 1 ? 'Warnung' : 'Warnungen'}`
        : worst === 'info'
          ? `${c.info} ${c.info === 1 ? 'Hinweis' : 'Hinweise'}`
          : 'OK'
  return <Badge tone={meta.tone}>{text}</Badge>
}

// Welche Hinweise zu welcher Kachel gehören (farbiger Rand an der Kachel).
const TILE_HINTS: Record<string, string[]> = {
  resolution: [
    'sar',
    'rotation',
    'hap-mod4',
    'res-odd',
    'res-texture',
    'res-large',
    'res-low',
    'h264-4096',
    'hevc-size'
  ],
  fps: [
    'vfr',
    'fps-unusual',
    'fps-low',
    'fps-high',
    'fps-raster',
    'fps-ntsc',
    'interlaced',
    'scan-unknown'
  ],
  codec: [
    'codec-unknown',
    'codec-legacy',
    'hw-chroma',
    'hw-h264-10bit',
    'hw-av1',
    'webcodec',
    'longgop',
    'hap-player',
    'usb-codec',
    'usb-level',
    'hevc-hev1',
    'gop-long',
    'pixelrate',
    'hap-container',
    'container-mkv'
  ],
  duration: ['duration-unknown', 'av-length', 'incomplete'],
  bitrate: ['bitrate-medium', 'bitrate-high', 'bpp-low'],
  size: ['fat32', 'name-invalid', 'name-chars', 'ext-mismatch'],
  audio: [
    'audio-none',
    'audio-tracks',
    'audio-441',
    'audio-rate',
    'audio-multich',
    'audio-codec',
    'audio-lowbr'
  ],
  color: [
    'hdr',
    'dolby-vision',
    'wide-gamut',
    'color-601',
    'full-range',
    'alpha-webm',
    'alpha-expected'
  ]
}

function tileLevel(key: string, hints: MediaHint[]): HintLevel | null {
  const ids = TILE_HINTS[key] ?? []
  const lv = worstLevel(hints.filter((h) => ids.includes(h.id)))
  return lv === 'warning' || lv === 'problem' ? lv : null
}

function Tile({
  label,
  value,
  sub,
  level,
  title
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  level?: HintLevel | null
  title?: string
}): JSX.Element {
  return (
    <div
      title={title}
      className={cn(
        'min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2',
        level === 'warning' && 'border-l-4 border-l-amber-500',
        level === 'problem' && 'border-l-4 border-l-red-500'
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-base font-semibold tabular-nums">{value}</p>
      {sub && <p className="break-words text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Section({
  title,
  defaultOpen = true,
  right,
  children
}: {
  title: string
  defaultOpen?: boolean
  right?: ReactNode
  children: ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
      >
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            !open && '-rotate-90'
          )}
        />
        <span className="flex-1">{title}</span>
        {right}
      </button>
      {open && <div className="border-t border-border px-3 py-2">{children}</div>}
    </section>
  )
}

/** Label/Wert-Zeilen; leere Werte werden weggelassen. */
function KV({ rows }: { rows: [string, ReactNode | null | undefined][] }): JSX.Element {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
  return (
    <dl className="grid grid-cols-[minmax(7rem,38%)_1fr] gap-x-4 gap-y-1 text-sm">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 select-text break-words tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const Raw = ({ children }: { children: ReactNode }): JSX.Element => (
  <span className="ml-1 font-mono text-xs text-muted-foreground">{children}</span>
)

function est(v: string, estimated: boolean): string {
  return estimated ? `≈ ${v}` : v
}

function videoRows(v: MediaVideoTrack): [string, ReactNode | null][] {
  const anamorph = v.displayWidth !== v.width || v.displayHeight !== v.height
  return [
    [
      'Codec',
      <>
        {v.codec}
        {v.fourcc && <Raw>{v.fourcc}</Raw>}
      </>
    ],
    ['Profil / Level', v.profile ? `${v.profile}${v.level ? ` @ ${v.level}` : ''}` : null],
    ['Codec-Art', codecClassLabel(v)],
    ['GOP', gopLabel(v)],
    ['Auflösung (gespeichert)', fmtResolution(v.width, v.height)],
    ['Anzeigegröße', anamorph ? fmtResolution(v.displayWidth, v.displayHeight) : null],
    ['Seitenverhältnis', aspectLabel(v.displayWidth, v.displayHeight)],
    ['Pixel-Seitenverhältnis', v.sar ? `${v.sar} (anamorph)` : '1:1 (quadratisch)'],
    ['Rotation', rotationLabel(v)],
    [
      'Bildrate',
      v.fpsMode === 'still' ? (
        'Standbild'
      ) : (
        <>
          {fpsLabel(v)}
          {v.fpsRational && <Raw>{v.fpsRational}</Raw>}
        </>
      )
    ],
    ['Bildraten-Modus', v.fpsMode === 'still' ? null : fpsModeLabel(v)],
    ['Scan', v.fpsMode === 'still' ? null : scanLabel(v.scan)],
    ['Bilder', v.frames !== null ? est(nf(v.frames), v.framesEstimated) : null],
    ['Bittiefe', v.bitDepth ? `${v.bitDepth} bit` : null],
    ['Farbunterabtastung', v.chroma],
    ['Pixelformat', v.pixFmt ? <span className="font-mono text-xs">{v.pixFmt}</span> : null],
    ['Alpha', v.alpha ? `ja${v.alphaNote ? ` – ${v.alphaNote}` : ''}` : (v.alphaNote ?? 'nein')],
    ['Farbe', colorLabel(v)],
    [
      'HDR',
      hdrLabel(v)
        ? [
            hdrLabel(v),
            v.masteringMaxNits ? `Mastering ${nf(v.masteringMaxNits)} cd/m²` : null,
            v.maxCll ? `MaxCLL ${nf(v.maxCll)}` : null,
            v.maxFall ? `MaxFALL ${nf(v.maxFall)}` : null
          ]
            .filter(Boolean)
            .join(' · ')
        : null
    ],
    ['Bitrate', v.bitRate ? est(fmtBitrate(v.bitRate), v.bitRateEstimated) : null],
    ['Dauer', v.durationSec ? fmtDuration(v.durationSec) : null],
    ['Timecode', v.timecode],
    ['Sprache / Titel', [languageLabel(v.language), v.title].filter(Boolean).join(' · ') || null]
  ]
}

export function MediaDetail({
  entry,
  hints,
  onConvert
}: {
  entry: MediaEntry
  hints: MediaHint[]
  /** null = keine Weitergabe anbieten (Kundenansicht) */
  /** an den Video-Konverter (null = Kundenansicht) */
  onConvert: ((paths: string[]) => void) | null
}): JSX.Element {
  const { dir, name } = splitPath(entry.path)
  const profile = useMediaInfoPrefs((s) => s.profile)
  // Aktionen direkt aus dem Store holen (kein Abo -> kein Re-Render bei jeder Änderung)
  const reanalyze = (): void => useMediaInfo.getState().reanalyze([entry.path])
  const remove = (): void => useMediaInfo.getState().remove(entry.path)

  if (
    entry.status === 'error' ||
    (!entry.info && entry.status !== 'loading' && entry.status !== 'pending')
  ) {
    return (
      <Card className="space-y-3 border-red-500/40 p-5">
        <Header name={name} dir={dir} path={entry.path} />
        <div className="flex items-start gap-2 text-sm">
          <XCircle className="mt-0.5 size-4 shrink-0 text-red-400 light:text-red-600" />
          <div className="min-w-0">
            <p className="font-medium">{entry.error ?? 'Analyse fehlgeschlagen'}</p>
            {entry.detail && (
              <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
                {entry.detail}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={reanalyze}>
            <RefreshCw className="size-4" /> Erneut versuchen
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void api.showItemInFolder(entry.path)}>
            <FolderOpen className="size-4" /> Im Ordner zeigen
          </Button>
          <Button variant="ghost" size="sm" onClick={remove}>
            <Trash2 className="size-4" /> Entfernen
          </Button>
        </div>
      </Card>
    )
  }

  const info = entry.info
  if (!info) {
    return (
      <Card className="space-y-3 p-5">
        <Header name={name} dir={dir} path={entry.path} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">Analysiere …</p>
      </Card>
    )
  }

  const v = mainVideo(info)
  const canConvert = Boolean(v && v.fpsMode !== 'still' && v.codecName)

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Header name={name} dir={dir} path={entry.path} />
          <Chips info={info} />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge hints={hints} />
          {entry.status !== 'done' && (
            <span className="text-xs text-muted-foreground">aktualisiere …</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void copyText(factSheet(info, hints, profile), 'Steckbrief')}
        >
          <Copy className="size-4" /> Steckbrief kopieren
        </Button>
        {canConvert && onConvert && (
          <Button variant="outline" size="sm" onClick={() => onConvert([entry.path])}>
            <FileCog className="size-4" /> Konvertieren …
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => void api.showItemInFolder(entry.path)}>
          <FolderOpen className="size-4" /> Im Ordner zeigen
        </Button>
        <Button variant="ghost" size="sm" onClick={reanalyze}>
          <RefreshCw className="size-4" /> Neu analysieren
        </Button>
        <Button variant="ghost" size="sm" onClick={remove}>
          <Trash2 className="size-4" /> Entfernen
        </Button>
      </div>

      <Tiles info={info} hints={hints} />

      <HintList hints={hints} />

      <div className="space-y-2">
        <Section title="Container">
          <KV
            rows={[
              [
                'Format',
                <>
                  {info.container}
                  {info.formatName && <Raw>{info.formatName}</Raw>}
                </>
              ],
              ['Endung', info.extensionMismatch ? 'passt nicht zum Inhalt' : null],
              [
                'Dateigröße',
                info.sizeBytes ? `${fmtBytes(info.sizeBytes)} (${nf(info.sizeBytes)} Byte)` : null
              ],
              ['Dauer', info.durationSec ? fmtDuration(info.durationSec) : null],
              ['Startzeit', info.startTimeSec ? `${nf(info.startTimeSec, 3)} s` : null],
              [
                'Gesamt-Bitrate',
                info.bitRate
                  ? `${est(fmtBitrate(info.bitRate), info.bitRateEstimated)} (${fmtMBps(info.bitRate)})`
                  : null
              ],
              [
                'Spuren',
                [
                  info.video.length ? `${info.video.length} Video` : null,
                  info.audio.length ? `${info.audio.length} Audio` : null,
                  info.subtitles.length ? `${info.subtitles.length} Untertitel` : null,
                  info.data.length ? `${info.data.length} Daten` : null,
                  info.covers.length ? `${info.covers.length} Coverbild` : null
                ]
                  .filter(Boolean)
                  .join(' · ') || '–'
              ],
              ['Kapitel', info.chapters.length ? String(info.chapters.length) : null],
              [
                'Timecode',
                info.timecode
                  ? `${info.timecode}${info.timecodeSource ? ` (${info.timecodeSource})` : ''}`
                  : null
              ],
              ['Titel', info.title],
              ['Software', info.encoder],
              ['Kamera', info.camera],
              ['Erstellt', info.creationTime ? fmtDate(info.creationTime) : null],
              ['Geändert (Datei)', info.modifiedMs ? fmtDate(info.modifiedMs) : null],
              [
                'Erkennung',
                info.probeScore !== null && info.probeScore < 100
                  ? `Sicherheit ${info.probeScore} %`
                  : null
              ]
            ]}
          />
        </Section>

        {info.video.map((t, i) => (
          <Section key={t.index} title={info.video.length > 1 ? `Video ${i + 1}` : 'Video'}>
            <KV rows={videoRows(t)} />
          </Section>
        ))}

        {info.audio.map((a, i) => (
          <Section
            key={a.index}
            title={info.audio.length > 1 ? `Audio ${i + 1}` : 'Audio'}
            right={a.isDefault && info.audio.length > 1 ? <Badge>Standard</Badge> : undefined}
          >
            <KV
              rows={[
                [
                  'Codec',
                  <>
                    {a.codec}
                    {a.profile && a.codecName === 'aac' ? <Raw>{a.profile}</Raw> : null}
                  </>
                ],
                [
                  'Kanäle',
                  <>
                    {a.channels ?? '–'} · {channelLabel(a)}
                    {a.layoutKnown && a.channelLayout && <Raw>{a.channelLayout}</Raw>}
                  </>
                ],
                ['Abtastrate', sampleRateLabel(a.sampleRate)],
                [
                  'Bittiefe',
                  a.bitDepth
                    ? `${a.bitDepth} bit${a.float ? ' float' : ''}`
                    : a.lossy
                      ? '– (komprimiert)'
                      : null
                ],
                ['Bitrate', a.bitRate ? est(fmtBitrate(a.bitRate), a.bitRateEstimated) : null],
                ['Dauer', a.durationSec ? fmtDuration(a.durationSec) : null],
                ['Sprache', languageLabel(a.language)],
                ['Titel', a.title]
              ]}
            />
          </Section>
        ))}

        {(info.subtitles.length > 0 ||
          info.data.length > 0 ||
          info.covers.length > 0 ||
          info.attachments > 0) && (
          <Section title="Untertitel & Daten">
            <KV
              rows={[
                ...info.subtitles.map((s, i): [string, ReactNode] => [
                  `Untertitel ${i + 1}`,
                  [
                    s.codec,
                    languageLabel(s.language),
                    s.title,
                    s.forced ? 'erzwungen' : null,
                    s.isDefault ? 'Standard' : null
                  ]
                    .filter(Boolean)
                    .join(' · ')
                ]),
                ...info.data.map((d, i): [string, ReactNode] => [
                  `Datenspur ${i + 1}`,
                  [d.kind, d.timecode].filter(Boolean).join(' · ')
                ]),
                ...info.covers.map((c, i): [string, ReactNode] => [
                  `Coverbild ${i + 1}`,
                  `${c.codec}${c.width && c.height ? ` ${fmtResolution(c.width, c.height)}` : ''} – wird nicht als Video abgespielt`
                ]),
                ['Anhänge', info.attachments ? `${info.attachments} (z.B. Schriften)` : null]
              ]}
            />
          </Section>
        )}

        {info.chapters.length > 0 && (
          <Section title={`Kapitel (${info.chapters.length})`} defaultOpen={false}>
            <KV
              rows={info.chapters.map((c, i): [string, ReactNode] => [
                fmtDuration(c.startSec),
                c.title ?? `Kapitel ${i + 1}`
              ])}
            />
          </Section>
        )}

        {info.tags.length > 0 && (
          <Section title={`Metadaten (${info.tags.length})`} defaultOpen={false}>
            <dl className="grid grid-cols-[minmax(7rem,38%)_1fr] gap-x-4 gap-y-1 text-xs">
              {info.tags.map((t, i) => (
                <div key={`${t.scope}-${t.key}-${i}`} className="contents">
                  <dt className="truncate text-muted-foreground" title={`${t.scope}: ${t.key}`}>
                    <span className="text-muted-foreground/70">{t.scope} · </span>
                    {t.key}
                  </dt>
                  <dd className="min-w-0 select-text break-words font-mono">{t.value}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        <RawSection path={entry.path} name={info.name} />
      </div>
    </Card>
  )
}

function Header({ name, dir, path }: { name: string; dir: string; path: string }): JSX.Element {
  return (
    <div className="min-w-0">
      <h2 className="truncate text-lg font-semibold" title={name}>
        {name}
      </h2>
      <button
        type="button"
        className="block max-w-full truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
        title="Im Ordner zeigen"
        onClick={() => void api.showItemInFolder(path)}
      >
        {dir}
      </button>
    </div>
  )
}

function Chips({ info }: { info: MediaInfo }): JSX.Element {
  const v = mainVideo(info)
  const chips: string[] = [info.container]
  if (v) {
    chips.push(v.codec)
    const sf = shortFormat(v)
    if (sf) chips.push(sf)
    if (v.alpha) chips.push('Alpha')
    const hdr = hdrLabel(v)
    if (hdr) chips.push(hdr)
    if (v.scan === 'tff' || v.scan === 'bff') chips.push('Interlaced')
    if (v.fpsMode === 'vfr' || v.fpsMode === 'vfr-suspect') chips.push('VFR')
    if (v.rotation) chips.push(`Rotation ${v.rotation}°`)
    if (v.sar) chips.push('Anamorph')
  } else if (info.audio.length) {
    chips.push('Nur Ton')
  }
  if (info.timecode) chips.push(`TC ${info.timecode}`)
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {/* doppelte Merkmale (z.B. Container „GIF" + Codec „GIF") nur einmal */}
      {[...new Set(chips)].map((c) => (
        <Badge key={c}>{c}</Badge>
      ))}
    </div>
  )
}

function Tiles({ info, hints }: { info: MediaInfo; hints: MediaHint[] }): JSX.Element {
  const v = mainVideo(info)
  const a = info.audio[0]
  const lv = (k: string): HintLevel | null => tileLevel(k, hints)
  const tiles: JSX.Element[] = []
  if (v) {
    const cls = resolutionClass(v.displayWidth, v.displayHeight)
    const anamorph = v.displayWidth !== v.width || v.displayHeight !== v.height
    tiles.push(
      <Tile
        key="res"
        label="Auflösung"
        value={fmtResolution(v.displayWidth, v.displayHeight)}
        sub={[
          aspectLabel(v.displayWidth, v.displayHeight),
          cls,
          anamorph ? `gespeichert ${fmtResolution(v.width, v.height)}` : null
        ]
          .filter(Boolean)
          .join(' · ')}
        level={lv('resolution')}
      />
    )
    if (v.fpsMode !== 'still') {
      tiles.push(
        <Tile
          key="fps"
          label="Bildrate"
          value={v.fps ? `${fmtFps(v.fps)} fps` : '–'}
          sub={[
            v.fpsMode === 'vfr' || v.fpsMode === 'vfr-suspect'
              ? 'variabel (VFR)'
              : v.fpsMode === 'cfr'
                ? 'konstant'
                : null,
            v.scan === 'progressive' ? 'progressiv' : v.scan === 'unknown' ? null : 'interlaced',
            shortFormat(v)
          ]
            .filter(Boolean)
            .join(' · ')}
          level={lv('fps')}
        />
      )
    }
    tiles.push(
      <Tile
        key="codec"
        label="Video-Codec"
        value={v.codec}
        sub={codecLine(v).split(' · ').slice(1).join(' · ') || codecClassLabel(v)}
        title={codecLine(v)}
        level={lv('codec')}
      />
    )
  }
  if (!info.isStill) {
    tiles.push(
      <Tile
        key="dur"
        label="Dauer"
        value={fmtDuration(info.durationSec)}
        sub={v?.frames ? `${v.framesEstimated ? '≈ ' : ''}${nf(v.frames)} Bilder` : undefined}
        level={lv('duration')}
      />
    )
    tiles.push(
      <Tile
        key="br"
        label="Bitrate"
        value={info.bitRate ? est(fmtBitrate(info.bitRate), info.bitRateEstimated) : '–'}
        sub={info.bitRate ? fmtMBps(info.bitRate) : undefined}
        level={lv('bitrate')}
      />
    )
  }
  tiles.push(
    <Tile
      key="size"
      label="Dateigröße"
      value={fmtBytes(info.sizeBytes)}
      sub={info.container}
      title={info.sizeBytes ? `${nf(info.sizeBytes)} Byte` : undefined}
      level={lv('size')}
    />
  )
  if (v && v.fpsMode !== 'still') {
    tiles.push(
      <Tile
        key="audio"
        label="Ton"
        value={a ? `${a.codec}` : 'kein Ton'}
        sub={
          a
            ? `${sampleRateLabel(a.sampleRate)} · ${channelLabel(a)}${info.audio.length > 1 ? ` · +${info.audio.length - 1} Spur(en)` : ''}`
            : undefined
        }
        level={lv('audio')}
      />
    )
  } else if (a) {
    tiles.push(
      <Tile key="audio" label="Ton" value={a.codec} sub={audioLine(a)} level={lv('audio')} />
    )
    tiles.push(
      <Tile
        key="ch"
        label="Kanäle"
        value={channelLabel(a)}
        sub={a.bitDepth ? `${a.bitDepth} bit` : undefined}
      />
    )
  }
  if (v) {
    tiles.push(
      <Tile
        key="color"
        label="Bild/Farbe"
        value={hdrLabel(v) ?? (v.colorTransfer === 'iec61966-2-1' ? 'sRGB' : 'SDR')}
        sub={`${colorLabel(v)} · Alpha ${v.alpha ? 'ja' : 'nein'}`}
        level={lv('color')}
      />
    )
  }
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">{tiles}</div>
}

function HintList({ hints }: { hints: MediaHint[] }): JSX.Element {
  if (!hints.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-emerald-400 light:text-emerald-700" /> Keine
        Auffälligkeiten für das gewählte Prüfprofil.
      </p>
    )
  }
  return (
    <div className="space-y-1.5">
      {hints.map((h) => {
        const meta = LEVEL_META[h.level]
        const Icon = meta.icon
        return (
          <details key={h.id} className="group rounded-md border border-border bg-muted/20">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-sm">
              <Icon className={cn('size-4 shrink-0', meta.className)} aria-label={meta.label} />
              <span className="min-w-0 flex-1">{h.title}</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-3 pb-2 pl-9 text-xs text-muted-foreground">{h.text}</p>
          </details>
        )
      })}
    </div>
  )
}

function RawSection({ path, name }: { path: string; name: string }): JSX.Element {
  // undefined = noch nicht geladen, null = ffprobe lieferte nichts
  const [raw, setRaw] = useState<string | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  async function load(): Promise<void> {
    setLoading(true)
    try {
      setRaw(await api.mediaInfo.raw(path))
    } catch (e) {
      toast.error('Rohdaten konnten nicht geladen werden', errorText(e))
    } finally {
      setLoading(false)
    }
  }
  async function save(text: string): Promise<void> {
    try {
      const saved = await api.util.saveText(text, `${name}.ffprobe.json`)
      if (saved) toast.success('Rohdaten gespeichert', saved)
    } catch (e) {
      toast.error('Speichern fehlgeschlagen', errorText(e))
    }
  }
  return (
    <Section title="Rohdaten (ffprobe JSON)" defaultOpen={false}>
      {raw === undefined ? (
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Lade …' : 'Rohdaten laden'}
        </Button>
      ) : raw === null ? (
        <p className="text-sm text-muted-foreground">
          Keine Rohdaten verfügbar – Datei inzwischen verschoben oder nicht mehr lesbar.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void copyText(raw, 'JSON')}>
              <Copy className="size-4" /> JSON kopieren
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void save(raw)}>
              Als .json speichern
            </Button>
          </div>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs">
            {raw}
          </pre>
        </div>
      )}
    </Section>
  )
}
