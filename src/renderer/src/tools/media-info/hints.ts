// Show-Tauglichkeit: aus MediaInfo + Prüfprofil (Zielsystem, Show-Raster,
// Datenträger) eine Ampel-Liste ableiten. Rein und deterministisch -> bei
// Profilwechsel sofort neu bewertet (kein neuer ffprobe-Lauf) und testbar.
// Schwellen/Grenzen: Stand 2026, bewusst als Hinweis („prüfen") formuliert.

import type { HapFormat, MediaInfo, MediaVideoTrack } from '@shared/types'
import {
  channelLabel,
  fmtBitrate,
  fmtFps,
  fmtMBps,
  fmtResolution,
  nf,
  sampleRateLabel
} from './format'

export type HintLevel = 'problem' | 'warning' | 'info' | 'ok'

export interface MediaHint {
  id: string
  level: HintLevel
  title: string
  text: string
}

export type TargetSystem = 'general' | 'mediaserver' | 'mac' | 'laptop' | 'usb'
export type ShowRaster = 'none' | '25' | '30' | 'ntsc' | 'film'
export type StorageMedium = 'none' | 'wifi' | 'usb-stick' | 'net-1g' | 'ssd' | 'nvme'

export interface CheckProfile {
  target: TargetSystem
  raster: ShowRaster
  medium: StorageMedium
}

export const DEFAULT_PROFILE: CheckProfile = { target: 'general', raster: 'none', medium: 'none' }

export const TARGET_OPTIONS: { value: TargetSystem; label: string }[] = [
  { value: 'general', label: 'Allgemein' },
  { value: 'mediaserver', label: 'Medienserver (Resolume, MadMapper, Millumin …)' },
  { value: 'mac', label: 'QLab / macOS' },
  { value: 'laptop', label: 'Laptop-Playout (Mottulbox-Player, VLC, PowerPoint)' },
  { value: 'usb', label: 'USB-/LED-Player, Beamer/TV per USB' }
]

export const RASTER_OPTIONS: { value: ShowRaster; label: string }[] = [
  { value: 'none', label: 'keine Vorgabe' },
  { value: '25', label: '25/50 Hz (Europa)' },
  { value: '30', label: '30/60 Hz' },
  { value: 'ntsc', label: '29,97/59,94 (NTSC)' },
  { value: 'film', label: '24/48 (Film)' }
]

export const MEDIUM_OPTIONS: { value: StorageMedium; label: string }[] = [
  { value: 'none', label: 'keine Vorgabe' },
  { value: 'wifi', label: 'WLAN' },
  { value: 'usb-stick', label: 'USB-Stick' },
  { value: 'net-1g', label: 'Netzlaufwerk (1 GbE)' },
  { value: 'ssd', label: 'SATA-/USB-3-SSD' },
  { value: 'nvme', label: 'NVMe-SSD' }
]

// Richtwerte Dauerlesen (MB/s); Warnung ab 50 %, Problem ab 80 % – Reserve für
// mehrere Layer, Fragmentierung und Loop-Sprünge.
const MEDIUM_MBPS: Record<Exclude<StorageMedium, 'none'>, number> = {
  wifi: 10,
  'usb-stick': 40,
  'net-1g': 100,
  ssd: 400,
  nvme: 1500
}

const LEVEL_ORDER: Record<HintLevel, number> = { problem: 3, warning: 2, info: 1, ok: 0 }

export function worstLevel(hints: MediaHint[]): HintLevel {
  return hints.reduce<HintLevel>(
    (worst, h) => (LEVEL_ORDER[h.level] > LEVEL_ORDER[worst] ? h.level : worst),
    'ok'
  )
}

export function sortHints(hints: MediaHint[]): MediaHint[] {
  return [...hints].sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level])
}

export function countLevels(hints: MediaHint[]): Record<HintLevel, number> {
  const c: Record<HintLevel, number> = { problem: 0, warning: 0, info: 0, ok: 0 }
  for (const h of hints) c[h.level]++
  return c
}

const STANDARD_FPS = [
  24000 / 1001,
  24,
  25,
  30000 / 1001,
  30,
  48000 / 1001,
  48,
  50,
  60000 / 1001,
  60,
  100,
  120000 / 1001,
  120
]
const isStandardFps = (f: number): boolean => STANDARD_FPS.some((s) => Math.abs(f - s) / s < 0.0005)
const NTSC_FPS = [24000 / 1001, 30000 / 1001, 60000 / 1001]
const RASTER_BASE: Record<Exclude<ShowRaster, 'none'>, { base: number; label: string }> = {
  '25': { base: 25, label: '25/50 Hz' },
  '30': { base: 30, label: '30/60 Hz' },
  ntsc: { base: 30000 / 1001, label: '29,97/59,94' },
  film: { base: 24, label: '24/48' }
}

const LEGACY_CODECS = new Set([
  'mpeg4',
  'msmpeg4v2',
  'msmpeg4v3',
  'wmv1',
  'wmv2',
  'wmv3',
  'vc1',
  'flv1',
  'h263',
  'theora',
  'vp6',
  'vp6f',
  'cinepak',
  'svq1',
  'svq3',
  'indeo5'
])
const SCAN_SUSPECT_CODECS = new Set(['mpeg2video', 'h264', 'dvvideo', 'prores', 'dnxhd', 'mjpeg'])
const PROBLEM_AUDIO = new Set(['ac3', 'eac3', 'dts', 'truehd', 'mlp', 'wmav2', 'wmapro'])

/** Erste echte Videospur (keine Standbilder). */
export function mainVideo(info: MediaInfo): MediaVideoTrack | null {
  return info.video.find((v) => v.fpsMode !== 'still') ?? info.video[0] ?? null
}

/** Bewertung einer Datei für das Prüfprofil. */
export function analyzeMedia(info: MediaInfo, profile: CheckProfile): MediaHint[] {
  const out: MediaHint[] = []
  const t = profile.target
  const add = (id: string, level: HintLevel | null, title: string, text: string): void => {
    if (level) out.push({ id, level, title, text })
  }
  const v = mainVideo(info)
  const moving = v && v.fpsMode !== 'still' ? v : null
  const name = info.name

  /* ---------------------------- Datei & Container -------------------------- */
  if (info.incomplete) {
    add(
      'incomplete',
      'problem',
      'Datei unvollständig',
      'Der Index der Datei verspricht mehr Daten, als vorhanden sind – Kopie oder Aufnahme wurde abgebrochen. Erneut kopieren und bis zum Ende probespielen.'
    )
  }
  if (info.sizeBytes && info.sizeBytes > 4294967295) {
    add(
      'fat32',
      t === 'usb' ? 'problem' : 'warning',
      'Größer als 4 GB – nicht FAT32-tauglich',
      'USB-Sticks, SD-Karten und viele LED-, Beamer- und TV-Player nutzen FAT32; Dateien ab 4 GiB lassen sich dort nicht speichern. Stick mit exFAT/NTFS formatieren (Player-Kompatibilität prüfen) oder kleiner kodieren.'
    )
  }
  // Steuerzeichen per Codepoint prüfen (Regex-Klassen mit \x00 sind für ESLint tabu)
  const hasControl = [...name].some((ch) => ch.charCodeAt(0) < 32)
  if (/[<>:"/\\|?*]/.test(name) || hasControl || /[ .]$/.test(name)) {
    add(
      'name-invalid',
      'warning',
      'Dateiname unter Windows/FAT32 ungültig',
      'Zeichen wie < > : " / \\ | ? * oder ein Leerzeichen/Punkt am Ende: Kopieren auf Windows-Rechner oder USB-Sticks schlägt fehl bzw. die Datei wird umbenannt.'
    )
  } else if (t === 'usb' && /[^A-Za-z0-9 _\-.()]/.test(name)) {
    add(
      'name-chars',
      'info',
      'Sonderzeichen im Dateinamen',
      'LED-/USB-Player scheitern teils an Umlauten, ß oder # % & +. Sicher sind A–Z, 0–9, _ und -.'
    )
  }
  if (info.extensionMismatch) {
    add(
      'ext-mismatch',
      'warning',
      `Endung passt nicht zum Inhalt (${info.container})`,
      'Viele Player wählen den Demuxer nach der Endung und lehnen die Datei dann ab. Passend umbenennen oder umverpacken.'
    )
  }
  if (info.probeScore !== null && info.probeScore <= 25) {
    add(
      'probe-score',
      'warning',
      'Format nur unsicher erkannt',
      'ffprobe ist sich beim Dateiformat nicht sicher – falsche Endung oder ungewöhnliche Datei. Ausspielung vorher testen.'
    )
  }
  const fmt = info.formatName ?? ''
  if (fmt.startsWith('matroska') && v) {
    add(
      'container-mkv',
      t === 'mac' ? 'problem' : t === 'mediaserver' ? 'warning' : 'info',
      'MKV/WebM-Container',
      'Viele Medienserver und macOS-Programme (QLab, QuickTime) öffnen MKV/WebM nicht. Passt der Codec, lässt sich verlustfrei in MOV/MP4 umverpacken.'
    )
  }
  if (moving && !info.isStill && info.durationSec === null) {
    add(
      'duration-unknown',
      'warning',
      'Dauer unbekannt',
      'Vermutlich unvollständig (abgebrochene Aufnahme) oder ein Mitschnitt ohne Index. Bis zum Ende probespielen.'
    )
  }

  /* ------------------------------ Codec ------------------------------------ */
  if (v && !v.codecName) {
    add(
      'codec-unknown',
      'problem',
      `Video-Codec nicht decodierbar (${v.fourcc ?? 'unbekannt'})`,
      'ffmpeg kennt diesen Codec nicht – weder Vorschau noch Konvertierung möglich. Datei beim Ersteller in einem gängigen Format anfordern.'
    )
  }
  if (moving) {
    const c = moving.codecName ?? ''
    if (c === 'hap' && !fmt.startsWith('mov,mp4')) {
      add(
        'hap-container',
        'problem',
        'HAP nicht im MOV-Container',
        'Medienserver lesen HAP nur aus QuickTime-MOV.'
      )
    }
    if (c === 'hap') {
      if (t === 'laptop' || t === 'usb') {
        add(
          'hap-player',
          t === 'usb' ? 'problem' : 'warning',
          'HAP in Standard-Playern nicht abspielbar',
          'PowerPoint, Windows-Player, Beamer und LED-Player-Boxen kennen HAP nicht (der Mottulbox-Player konvertiert beim Import).'
        )
      } else {
        add(
          'hap-ok',
          'ok',
          'GPU-Codec HAP – ideal für Medienserver',
          'Das Bild geht als Textur direkt an die Grafikkarte; Engpass ist nur die Datenrate des Datenträgers.'
        )
      }
      if (moving.fourcc === 'Hap1') {
        add(
          'hap-dxt1',
          'info',
          'HAP (DXT1): sichtbare Kompression möglich',
          'In Verläufen und feinen Farbübergängen können Banding und Blockkanten auffallen. Für hochwertige Inhalte HAP Q.'
        )
      }
    }
    if (t === 'usb' && !['h264', 'hevc'].includes(c)) {
      add(
        'usb-codec',
        'problem',
        'Für USB-/LED-Player ungeeignet',
        'Player-Boxen, Beamer und TVs spielen per USB meist nur H.264/H.265 in MP4. HAP, ProRes und DNx werden nicht erkannt – Datenblatt prüfen.'
      )
    }
    if (moving.codecClass === 'longgop' && !moving.gop?.allIntra) {
      add(
        'longgop',
        t === 'mediaserver' ? 'warning' : t === 'general' ? 'info' : null,
        'Long-GOP-Codec',
        'Bilder hängen voneinander ab: Scrubbing, Rückwärts-/Speed-Wiedergabe, schnelle Cue-Wechsel und viele Layer belasten den Decoder. Für Medienserver HAP, ProRes oder DNxHR verwenden (→ HAP-Konverter).'
      )
    }
    if (LEGACY_CODECS.has(c)) {
      add(
        'codec-legacy',
        'warning',
        `Veralteter Codec (${moving.codec})`,
        'Aktuelle Medienserver und macOS unterstützen ihn oft nicht mehr. In H.264 bzw. HAP/ProRes neu kodieren.'
      )
    }
    if (c === 'hevc' && moving.fourcc === 'hev1' && fmt.startsWith('mov,mp4')) {
      add(
        'hevc-hev1',
        t === 'mac' ? 'problem' : 'info',
        'HEVC mit Kennung „hev1"',
        'macOS/QuickTime (QLab, Keynote) spielt nur „hvc1". Ohne Neukodierung umtaggen: ffmpeg -c copy -tag:v hvc1.'
      )
    }
    if (
      (c === 'h264' || c === 'hevc') &&
      (moving.chroma === '4:2:2' || moving.chroma === '4:4:4')
    ) {
      add(
        'hw-chroma',
        t === 'usb' ? 'problem' : 'warning',
        `${moving.codec} mit ${moving.chroma} – kaum Hardware-Decoding`,
        'Typisch für Kamera-Originale. Hardware-Decoding nur auf neuerer Hardware, sonst CPU-Last und Ruckler. Für die Show in 4:2:0 bzw. HAP/ProRes wandeln.'
      )
    }
    if (c === 'h264' && (moving.bitDepth ?? 8) >= 10) {
      add(
        'hw-h264-10bit',
        t === 'usb' ? 'problem' : 'warning',
        'H.264 mit 10 bit',
        'Kaum Hardware-Unterstützung – Decoding auf der CPU. In H.264 8 bit oder HEVC Main 10 wandeln.'
      )
    }
    if (c === 'av1') {
      add(
        'hw-av1',
        t === 'usb' ? 'problem' : t === 'laptop' ? 'warning' : 'info',
        'AV1 – Hardware-Decoding nur auf neuerer Hardware',
        'Ältere Show-Rechner decodieren per Software (4K kaum flüssig); viele Medienserver kennen AV1 nicht.'
      )
    }
    if (c === 'vp9' || c === 'vp8') {
      add(
        'webcodec',
        t === 'mediaserver' || t === 'mac' || t === 'usb' ? 'warning' : 'info',
        `Web-Codec (${moving.codec})`,
        'Meist ein YouTube-/Web-Download. In Medienservern und auf macOS selten unterstützt.'
      )
    }
    const maxSide = Math.max(moving.width, moving.height)
    if (c === 'h264' && maxSide > 4096) {
      add(
        'h264-4096',
        t === 'usb' ? 'problem' : 'warning',
        `H.264 über 4096 px (${fmtResolution(moving.width, moving.height)})`,
        'Die meisten H.264-Hardware-Decoder enden bei 4096 px – Folge: CPU-Decoding und Ruckler. Für breite LED-Canvases HAP oder HEVC verwenden.'
      )
    }
    if (c === 'hevc' && maxSide > 4096) {
      add(
        'hevc-size',
        maxSide > 8192 ? 'warning' : 'info',
        `HEVC über ${maxSide > 8192 ? '8192' : '4096'} px`,
        'Hardware-Decoder enden meist bei 8192 px, ältere GPUs schon bei 4096 px.'
      )
    }
    if (t === 'usb' && c === 'h264' && moving.fps) {
      const rate = moving.width * moving.height * moving.fps
      if (rate > 1920 * 1080 * 60 * 1.01 || Number(moving.level ?? 0) > 4.2) {
        add(
          'usb-level',
          'warning',
          'Über 1080p60 für USB-Player',
          'Viele Player-Boxen schaffen höchstens 1080p60 (H.264 Level 4.2). Datenblatt prüfen.'
        )
      }
    }
    if (moving.codecClass === 'longgop' && moving.fps) {
      const pixRate = moving.width * moving.height * moving.fps
      if (pixRate > 3840 * 2160 * 60 * 1.01) {
        add(
          'pixelrate',
          'warning',
          'Sehr hohe Pixelrate (über 4K60)',
          'Auch Hardware-Decoder kommen hier an ihre Grenze. Ausspielung vorher testen.'
        )
      }
      const bpp = moving.bitRate ? moving.bitRate / pixRate : null
      const minBpp = c === 'h264' || c === 'mpeg2video' ? 0.05 : 0.03
      if (bpp !== null && bpp < minBpp) {
        add(
          'bpp-low',
          'info',
          `Niedrige Bitrate für die Auflösung (${nf(bpp, 3)} bit/Pixel)`,
          'Vermutlich Web-/Streaming-Qualität. Auf großen LED-Flächen und Projektionen werden Blockartefakte und Banding sichtbar – Original in höherer Qualität anfordern.'
        )
      }
    }
    if (moving.gop && !moving.gop.allIntra && moving.gop.keyframeInterval && moving.fps) {
      const sec = moving.gop.keyframeInterval / moving.fps
      if (sec > 2) {
        const g = moving.gop
        const wholeClip = g.keyframeIntervalAtLeast && moving.frames && g.packets >= moving.frames
        const atLeast = g.keyframeIntervalAtLeast ? 'mindestens ' : ''
        add(
          'gop-long',
          sec > 5 && (t === 'mediaserver' || t === 'mac') ? 'warning' : 'info',
          wholeClip
            ? 'Lange GOP (nur ein Keyframe im ganzen Clip)'
            : `Lange GOP (Keyframe ${atLeast}alle ${nf(sec, 1)} s)`,
          'Sprünge, Cue-Starts mitten im Clip und Scrubbing reagieren verzögert, Loop-Punkte werden unsauber. Für die Show Keyframe-Abstand ≤ 1 s oder einen Intra-Codec.'
        )
      }
    }
  }

  /* ---------------------------- Bildgeometrie ------------------------------ */
  if (v) {
    const w = v.width
    const h = v.height
    if (w && h && (w % 4 || h % 4)) {
      const pw = Math.ceil(w / 4) * 4
      const ph = Math.ceil(h / 4) * 4
      add(
        'hap-mod4',
        'info',
        `Für HAP nicht durch 4 teilbar (→ ${fmtResolution(pw, ph)})`,
        `HAP komprimiert 4×4-Pixelblöcke; der HAP-Konverter füllt rechts/unten schwarz auf (+${pw - w}/${ph - h} px). Bei pixelgenauem LED-Mapping als Linie sichtbar – besser vorher passend skalieren oder zuschneiden.`
      )
    }
    if ((w % 2 || h % 2) && !info.isStill) {
      add(
        'res-odd',
        'warning',
        `Ungerade Bildmaße (${fmtResolution(w, h)})`,
        '4:2:0-Encoder (H.264/HEVC) brauchen gerade Maße: Konvertierungen schneiden 1 px ab oder brechen ab.'
      )
    }
    const maxSide = Math.max(w, h)
    if (maxSide > 16384) {
      add(
        'res-texture',
        t === 'mediaserver' ? 'problem' : 'warning',
        'Über 16384 px – GPU-Texturgrenze',
        'Übersteigt die maximale Texturgröße vieler Grafikkarten. In Teil-Clips (Slices) aufteilen.'
      )
    } else if (w * h > 7680 * 4320) {
      add(
        'res-large',
        'warning',
        'Sehr große Auflösung (über 8K)',
        'Hohe Anforderungen an Decoder, GPU-Speicher und Datenträger – Ausspielung vorher testen.'
      )
    } else if (w * h > 4096 * 2160) {
      add(
        'res-large',
        'info',
        'Große Auflösung (über 4K)',
        'Decoder, GPU-Speicher und Datenträger vorher prüfen.'
      )
    }
    if (v.sar) {
      add(
        'sar',
        t === 'laptop' ? 'info' : 'warning',
        `Anamorphe Pixel (SAR ${v.sar})`,
        `Gespeichert ${fmtResolution(w, h)}, Anzeige ${fmtResolution(v.displayWidth, v.displayHeight)}. Viele Medienserver und der HAP-Pfad ignorieren das Pixel-Seitenverhältnis – das Bild erscheint gestaucht. Vor der Show auf quadratische Pixel skalieren.`
      )
    }
    if (v.rotation || v.mirrored) {
      add(
        'rotation',
        t === 'laptop' ? 'info' : 'warning',
        v.mirrored && !v.rotation
          ? 'Spiegelung per Metadaten'
          : `Drehung per Metadaten (${v.rotation}°)`,
        'Das Bild wird nur per Metadaten gedreht/gespiegelt. Medienserver und LED-Player ignorieren das teils – dann liegt das Bild falsch. HAP-Konverter und Mottulbox-Player rechnen die Drehung fest ein.'
      )
    }
    if (v.displayHeight > v.displayWidth) {
      add(
        'portrait',
        'info',
        'Hochformat',
        'Auf Querformat-Wänden und Beamern Pillarbox oder Zuschnitt einplanen.'
      )
    }
    if (!info.isStill && v.displayWidth * v.displayHeight < 921600 && v.displayWidth > 0) {
      add(
        'res-low',
        'info',
        `Geringe Auflösung (${fmtResolution(v.displayWidth, v.displayHeight)})`,
        'Wird auf LED-Wand oder Beamer stark hochskaliert und wirkt unscharf.'
      )
    }
  }

  /* ---------------------------- Bildrate & Scan ---------------------------- */
  if (moving) {
    const f = moving.fps
    if (moving.fpsMode === 'vfr' || moving.fpsMode === 'vfr-suspect') {
      add(
        'vfr',
        'warning',
        moving.fpsMode === 'vfr' ? 'Variable Bildrate (VFR)' : 'Variable Bildrate vermutet',
        'Typisch für Handy- und Bildschirmaufnahmen. Medienserver und Timecode-Shows erwarten konstante Bildraten – Folgen: Ruckler, Ton-Versatz, falsche Clip-Länge. Beim Konvertieren auf eine feste Bildrate bringen.'
      )
    } else if (f && !isStandardFps(f)) {
      add(
        'fps-unusual',
        'warning',
        `Ungewöhnliche Bildrate (${fmtFps(f)} fps)`,
        f < 20
          ? 'Sehr niedrige Bildrate (Screen-Recording/Animation?) – Bewegung wirkt ruckelig und passt zu keinem Ausgaberaster.'
          : 'Passt zu keinem Ausgaberaster, Bewegungen werden ungleichmäßig. Auf 25/50 bzw. 30/60 fps konvertieren.'
      )
    }
    if (f && f > 60.5) {
      add(
        'fps-high',
        'info',
        `Über 60 fps (${fmtFps(f)} fps)`,
        'Ausgänge und LED-Prozessoren laufen meist mit 50/60 Hz – überzählige Bilder werden verworfen, die Datenrate ist unnötig hoch.'
      )
    }
    if (f && profile.raster !== 'none' && moving.fpsMode !== 'vfr') {
      const { base, label } = RASTER_BASE[profile.raster]
      const k = Math.round(f / base)
      const exact = k >= 1 && Math.abs(f / base - k) < 0.001
      // Raster-Vielfache und Teiler (z.B. 25 fps auf 50 Hz) sind sauber
      const divisor = base / f >= 1 && Math.abs(base / f - Math.round(base / f)) < 0.001
      if (!exact && !divisor) {
        const drift = k >= 1 ? Math.abs(f - k * base) : Infinity
        if (drift / f < 0.002) {
          add(
            'fps-raster',
            'warning',
            `Bildrate weicht minimal vom Raster ab (${fmtFps(f)} fps bei ${label})`,
            `Etwa alle ${nf(1 / drift, 1)} s wird ein Bild doppelt gezeigt oder ausgelassen – bei Schwenks sichtbar. Clip auf das Show-Raster konvertieren.`
          )
        } else {
          add(
            'fps-raster',
            'warning',
            `Bildrate passt nicht zum Show-Raster (${fmtFps(f)} fps bei ${label})`,
            'Ungleichmäßige Bildwiederholung bei jeder Bewegung, auf LED-Wänden im Kamerabild besonders sichtbar. Clip auf das Show-Raster konvertieren.'
          )
        }
      }
    } else if (f && profile.raster === 'none' && NTSC_FPS.some((n) => Math.abs(f - n) < 0.002)) {
      add(
        'fps-ntsc',
        'info',
        `NTSC-Bildrate (${fmtFps(f)} fps)`,
        'In 50-Hz-Umgebungen (Europa, TV-Kameras, LED-Prozessor mit Genlock) ruckeln Schwenks; bei 60-Hz-Ausgabe gibt es etwa alle 17 s ein doppeltes Bild.'
      )
    }
    if (moving.scan === 'tff' || moving.scan === 'bff') {
      add(
        'interlaced',
        'warning',
        `Interlaced (Halbbilder, ${moving.scan === 'tff' ? 'TFF' : 'BFF'})`,
        'LED-Wände und Beamer sind progressiv. Ohne Deinterlacing entstehen Kammeffekte bei Bewegung – Medienserver deinterlacen meist nicht. Vorher deinterlacen (z.B. 1080i/25 → 1080p/50).'
      )
    } else if (
      moving.scan === 'unknown' &&
      SCAN_SUSPECT_CODECS.has(moving.codecName ?? '') &&
      [480, 486, 576, 1080].includes(moving.height)
    ) {
      add(
        'scan-unknown',
        'info',
        'Scan-Typ unbekannt',
        'SD- oder 1080-Material aus Kamera/TV ist möglicherweise interlaced. Bildkontrolle bei Bewegung (oder Tiefenanalyse einschalten).'
      )
    }
  }

  /* --------------------------- Datenrate/Datenträger ----------------------- */
  const rate = info.bitRate
  if (rate && !info.isStill) {
    if (profile.medium !== 'none') {
      const cap = MEDIUM_MBPS[profile.medium] * 8e6
      const label = MEDIUM_OPTIONS.find((m) => m.value === profile.medium)?.label ?? ''
      const level: HintLevel | null =
        rate >= cap * 0.8 ? 'problem' : rate >= cap * 0.5 ? 'warning' : null
      add(
        'bitrate-medium',
        level,
        `Datenrate zu hoch für ${label} (${fmtBitrate(rate)} ≈ ${fmtMBps(rate)})`,
        'Gilt pro Datei; bei mehreren gleichzeitigen Layern addieren sich die Raten. Schnelleren Datenträger nutzen oder mit niedrigerer Datenrate kodieren.'
      )
    } else if (rate >= 640e6) {
      add(
        'bitrate-high',
        'warning',
        `Sehr hohe Datenrate (${fmtBitrate(rate)} ≈ ${fmtMBps(rate)})`,
        'Nur von SSD sinnvoll, nicht über Gigabit-Netz, WLAN oder USB-Stick.'
      )
    } else if (rate >= 160e6) {
      add(
        'bitrate-high',
        'info',
        `Hohe Datenrate (${fmtBitrate(rate)} ≈ ${fmtMBps(rate)})`,
        'Nicht für USB-Stick oder WLAN geeignet – von SSD abspielen.'
      )
    }
  }

  /* ------------------------------ Farbe/HDR/Alpha -------------------------- */
  if (v) {
    if (v.dolbyVision) {
      add(
        'dolby-vision',
        v.dolbyVision.startsWith('5') ? 'problem' : 'warning',
        `Dolby Vision (Profil ${v.dolbyVision})`,
        'Ohne Dolby-Decoder wird nur der Basis-Layer gezeigt; Profil 5 hat keinen kompatiblen Basis-Layer (lila-grüne Farben).'
      )
    }
    if (v.hdr) {
      add(
        'hdr',
        'warning',
        `HDR-Material (${v.hdr === 'pq' ? 'PQ/HDR10' : 'HLG'})`,
        'Auf SDR-Ausspielung ohne Tone-Mapping flau, zu dunkel und farblich falsch – das betrifft die meisten Medienserver, LED-Prozessoren im SDR-Modus und Beamer. iPhone-Videos sind standardmäßig HDR. Nach Rec. 709 SDR konvertieren, außer die ganze Kette ist HDR-fähig.'
      )
    } else if (v.colorPrimaries === 'bt2020') {
      add(
        'wide-gamut',
        'info',
        'Rec. 2020 ohne HDR',
        'Auf Rec.-709-Ausspielung entsättigt oder farblich verfälscht.'
      )
    }
    if ((v.colorSpace === 'smpte170m' || v.colorSpace === 'bt470bg') && v.height >= 720) {
      add(
        'color-601',
        'info',
        'SD-Farbmatrix (Rec. 601) bei HD',
        'Falsch gekennzeichnet oder falsch konvertiert – Rot-/Grünverschiebungen möglich.'
      )
    }
    if (v.colorRange === 'pc' && v.chroma && v.chroma.includes(':') && !info.isStill) {
      add(
        'full-range',
        'info',
        'Full-Range-YUV (0–255)',
        'Manche Player behandeln die Datei als Limited – Schwarz/Weiß werden abgeschnitten oder das Bild wirkt flau.'
      )
    }
    if (v.alpha) {
      if (v.alphaNote?.includes('WebM')) {
        add(
          'alpha-webm',
          'warning',
          'Alpha nur als WebM/VP9',
          'Medienserver und macOS lesen den VP9-Alpha meist nicht – der Hintergrund wird schwarz. Nach HAP Alpha bzw. ProRes 4444 konvertieren.'
        )
      } else {
        add(
          'alpha',
          'info',
          `Alpha-Kanal vorhanden (${v.codec})`,
          'Transparenz bleibt nur in Alpha-fähigen Codecs erhalten (HAP Alpha, ProRes 4444, PNG, QuickTime Animation) – im HAP-Konverter „HAP Alpha" wählen.'
        )
      }
    } else if (/alpha|transparent|rgba|keyed|overlay/i.test(name) && !info.isStill) {
      add(
        'alpha-expected',
        'warning',
        'Kein Alpha-Kanal, obwohl der Name es nahelegt',
        'Vermutlich falsch exportiert (z.B. als H.264) – die Transparenz fehlt. Beim Ersteller ProRes 4444 bzw. HAP Alpha anfordern.'
      )
    }
  }

  /* ----------------------------------- Ton --------------------------------- */
  if (moving && info.audio.length === 0 && t !== 'mediaserver') {
    add(
      'audio-none',
      'info',
      'Keine Tonspur',
      'Für reine Video-Zuspielung normal. Falls Ton erwartet wird: Export prüfen.'
    )
  }
  if (info.audio.length > 1) {
    const a0 = info.audio[0]
    add(
      'audio-tracks',
      'warning',
      `Mehrere Tonspuren (${info.audio.length})`,
      `Medienserver und Player nutzen meist nur eine Spur (oft die erste: ${a0.codec}, ${channelLabel(a0)}). Prüfen, welche aktiv ist.`
    )
  }
  for (const a of info.audio.slice(0, 1)) {
    if (a.sampleRate === 44100) {
      add(
        'audio-441',
        'info',
        '44,1 kHz Abtastrate',
        'Veranstaltungs-Audio (Dante, MADI, SDI) läuft mit 48 kHz – der Player resampelt. Für lippensynchrone Videos und Timecode-Shows besser 48 kHz.'
      )
    } else if (a.sampleRate && ![48000, 88200, 96000, 192000].includes(a.sampleRate)) {
      add(
        'audio-rate',
        'warning',
        `Ungewöhnliche Abtastrate (${sampleRateLabel(a.sampleRate)})`,
        'Hinweis auf eine alte oder Web-Quelle; nicht alle Interfaces und Player unterstützen das.'
      )
    }
    if (a.channels && a.channels > 2) {
      add(
        'audio-multich',
        'info',
        `Mehrkanal-Ton (${channelLabel(a)})`,
        a.layoutKnown
          ? 'Bei Stereo-Ausgabe mischen manche Player herunter, andere geben nur Kanal 1/2 aus – dann fehlt der Center mit der Sprache. Stereo-Downmix bereitstellen oder Routing prüfen.'
          : 'Kanalbelegung nicht definiert (z.B. Stems aus dem Schnitt) – mit dem Ersteller klären.'
      )
    }
    const c = a.codecName ?? ''
    const inMp4 = fmt.startsWith('mov,mp4')
    if (PROBLEM_AUDIO.has(c) || ((c === 'opus' || c === 'vorbis') && inMp4)) {
      add(
        'audio-codec',
        t === 'general' ? 'info' : 'warning',
        `Ton-Codec ${a.codec}`,
        'Viele Medienserver, Chromium-basierte Player und LED-Player decodieren das nicht – der Clip bleibt stumm. In AAC oder PCM wandeln.'
      )
    }
    if (a.lossy && a.bitRate && a.channels && a.bitRate / a.channels < 64000) {
      add(
        'audio-lowbr',
        'info',
        `Niedrige Ton-Bitrate (${fmtBitrate(a.bitRate)})`,
        'Auf großer PA hörbare Artefakte – vermutlich Web-Download.'
      )
    }
  }
  if (moving && info.audio[0]?.durationSec && moving.durationSec) {
    const diff = moving.durationSec - info.audio[0].durationSec
    if (Math.abs(diff) > Math.max(0.5, moving.durationSec * 0.02)) {
      add(
        'av-length',
        'info',
        `Ton und Bild unterschiedlich lang (Ton ${nf(Math.abs(diff), 1)} s ${diff > 0 ? 'kürzer' : 'länger'})`,
        'Am Clipende Stille bzw. Standbild – bei Loops ein hör- oder sichtbarer Sprung.'
      )
    }
  }

  /* ------------------------------ Timecode/Meta ---------------------------- */
  if (info.timecode && !/^00:00:00[:;.]00/.test(info.timecode)) {
    add(
      'tc-start',
      'info',
      `Start-Timecode ${info.timecode}`,
      'Bei TC-gesteuerten Shows prüfen, ob der Player den Clip-Timecode oder die Timeline-Position verwendet.'
    )
  }
  if (info.timecode?.includes(';')) {
    add(
      'tc-df',
      'info',
      'Drop-Frame-Timecode',
      '29,97 DF überspringt Zählnummern – in 25-fps-Umgebungen ungewöhnlich.'
    )
  }
  if (info.location) {
    add(
      'gps',
      'info',
      'GPS-Position in den Metadaten',
      'Vor der Weitergabe an Dritte ggf. entfernen (Datenschutz).'
    )
  }

  return sortHints(out)
}

/* ------------------------------ Mehrere Dateien ---------------------------- */

export type CompareKey = 'resolution' | 'fps' | 'scan' | 'codec' | 'depth' | 'audio'

export const COMPARE_LABELS: Record<CompareKey, string> = {
  resolution: 'Auflösung',
  fps: 'Bildrate',
  scan: 'Scan',
  codec: 'Codec',
  depth: 'Bit/Chroma',
  audio: 'Ton'
}

/** Vergleichswerte einer Datei (null = nicht vergleichbar, z.B. reine Audiodatei). */
export function compareValues(info: MediaInfo): Record<CompareKey, string | null> {
  const v = mainVideo(info)
  const a = info.audio[0]
  const moving = v && v.fpsMode !== 'still'
  return {
    resolution: v ? `${v.displayWidth}x${v.displayHeight}` : null,
    fps: moving && v.fps ? fmtFps(v.fps) : null,
    scan: moving ? (v.scan === 'unknown' ? null : v.scan === 'progressive' ? 'p' : 'i') : null,
    codec: v ? v.codec : null,
    depth: v ? `${v.bitDepth ?? '?'}-${v.chroma ?? '?'}${v.alpha ? '-a' : ''}` : null,
    audio: a ? `${a.sampleRate ?? '?'}-${a.channels ?? '?'}` : null
  }
}

/**
 * Abweichungen vom Mehrheitswert je Spalte (Playlist-Konsistenz). Bei Gleichstand
 * gilt der Wert der ersten Datei als Referenz.
 */
export function findDeviations(infos: MediaInfo[]): {
  byPath: Map<string, Set<CompareKey>>
  majority: Partial<Record<CompareKey, string>>
} {
  const byPath = new Map<string, Set<CompareKey>>()
  const majority: Partial<Record<CompareKey, string>> = {}
  if (infos.length < 2) return { byPath, majority }
  const values = infos.map((i) => ({ path: i.path, vals: compareValues(i) }))
  for (const key of Object.keys(COMPARE_LABELS) as CompareKey[]) {
    const counts = new Map<string, number>()
    for (const { vals } of values) {
      const val = vals[key]
      if (val !== null) counts.set(val, (counts.get(val) ?? 0) + 1)
    }
    if (counts.size < 2) continue
    let best: string | null = null
    let bestN = 0
    for (const { vals } of values) {
      const val = vals[key]
      if (val === null) continue
      const n = counts.get(val) ?? 0
      if (n > bestN) [best, bestN] = [val, n]
    }
    if (best === null) continue
    majority[key] = best
    for (const { path, vals } of values) {
      if (vals[key] !== null && vals[key] !== best) {
        const set = byPath.get(path) ?? new Set<CompareKey>()
        set.add(key)
        byPath.set(path, set)
      }
    }
  }
  return { byPath, majority }
}

const FPS_FAMILIES: [string, number[]][] = [
  ['25/50', [25, 50, 100]],
  ['30/60', [30, 60, 120]],
  ['29,97/59,94', [30000 / 1001, 60000 / 1001, 120000 / 1001]],
  ['24/48', [24, 48]],
  ['23,976', [24000 / 1001, 48000 / 1001]]
]

function fpsFamily(f: number): string {
  for (const [name, list] of FPS_FAMILIES) if (list.some((x) => Math.abs(f - x) < 0.01)) return name
  return fmtFps(f)
}

/** Hinweise über die ganze Liste (gemischte Raster, HDR/SDR, Interlace …). */
export function playlistHints(infos: MediaInfo[]): MediaHint[] {
  const out: MediaHint[] = []
  const videos = infos
    .map((i) => mainVideo(i))
    .filter((v): v is MediaVideoTrack => !!v && v.fpsMode !== 'still')
  if (videos.length < 2) return out
  const res = new Set(videos.map((v) => `${v.displayWidth}x${v.displayHeight}`))
  if (res.size > 1) {
    out.push({
      id: 'mix-res',
      level: 'warning',
      title: `Gemischte Auflösungen (${res.size} verschiedene)`,
      text: 'Clips mit abweichender Auflösung werden skaliert – auf pixelgenauen LED-Wänden unscharf oder mit Rändern.'
    })
  }
  const fams = new Set(videos.filter((v) => v.fps).map((v) => fpsFamily(v.fps as number)))
  if (fams.size > 1) {
    out.push({
      id: 'mix-fps',
      level: 'warning',
      title: `Gemischte Bildraten (${[...fams].join(' · ')})`,
      text: 'Unterschiedliche Bildraster in einer Show führen zu Rucklern bei einem Teil der Clips. Auf ein Raster vereinheitlichen.'
    })
  }
  const scans = new Set(
    videos.filter((v) => v.scan !== 'unknown').map((v) => (v.scan === 'progressive' ? 'p' : 'i'))
  )
  if (scans.size > 1) {
    out.push({
      id: 'mix-scan',
      level: 'warning',
      title: 'Interlaced und progressiv gemischt',
      text: 'Interlaced-Clips vor der Show deinterlacen.'
    })
  }
  const hdr = new Set(videos.map((v) => Boolean(v.hdr)))
  if (hdr.size > 1) {
    out.push({
      id: 'mix-hdr',
      level: 'warning',
      title: 'HDR- und SDR-Clips gemischt',
      text: 'HDR-Clips wirken auf SDR-Ausspielung flau und farbverfälscht – nach SDR wandeln.'
    })
  }
  const classes = new Set(videos.map((v) => v.codecClass))
  if (classes.size > 1) {
    out.push({
      id: 'mix-codec',
      level: 'info',
      title: 'Codec-Arten gemischt',
      text: 'GPU-, Intra- und Long-GOP-Codecs verhalten sich bei Scrubbing und vielen Layern sehr unterschiedlich.'
    })
  }
  const rates = new Set(infos.map((i) => i.audio[0]?.sampleRate).filter(Boolean))
  if (rates.size > 1) {
    out.push({
      id: 'mix-audio',
      level: 'info',
      title: `Ton uneinheitlich (${[...rates].map((r) => sampleRateLabel(r as number)).join(' / ')})`,
      text: 'Unterschiedliche Abtastraten werden vom Player umgerechnet.'
    })
  }
  return out
}

/* ----------------------------- HAP-Konverter ------------------------------ */

/** Kurz-Hinweise für eine Eingabedatei des HAP-Konverters (gewähltes Format). */
export function hapInputHints(info: MediaInfo, format: HapFormat): MediaHint[] {
  const out: MediaHint[] = []
  const v = mainVideo(info)
  if (!v || v.fpsMode === 'still') {
    out.push({
      id: 'hap-novideo',
      level: 'problem',
      title: 'Keine Videospur',
      text: 'Reine Audio-/Bilddatei – nicht als HAP konvertierbar.'
    })
    return out
  }
  if (!v.codecName) {
    out.push({
      id: 'hap-undecodable',
      level: 'problem',
      title: 'Codec nicht decodierbar',
      text: 'ffmpeg kann diese Videospur nicht lesen.'
    })
  }
  if (v.codecName === 'hap') {
    out.push({
      id: 'hap-already',
      level: 'info',
      title: `Bereits ${v.codec}`,
      text: 'Eine erneute Konvertierung ist meist nicht nötig.'
    })
  }
  if (v.width % 4 || v.height % 4) {
    const pw = Math.ceil(v.width / 4) * 4
    const ph = Math.ceil(v.height / 4) * 4
    out.push({
      id: 'hap-pad',
      level: 'info',
      title: `Wird auf ${fmtResolution(pw, ph)} aufgefüllt`,
      text: 'Schwarzer Rand rechts/unten, weil HAP durch 4 teilbare Maße braucht.'
    })
  }
  if (v.alpha && format !== 'hap_alpha') {
    out.push({
      id: 'hap-alpha-lost',
      level: 'warning',
      title: 'Alpha geht verloren',
      text: 'Die Quelle hat Transparenz – Format „HAP Alpha" wählen.'
    })
  }
  if (!v.alpha && format === 'hap_alpha') {
    out.push({
      id: 'hap-alpha-none',
      level: 'info',
      title: 'Quelle ohne Alpha',
      text: 'HAP Alpha bringt hier nichts – HAP Q reicht.'
    })
  }
  if (v.scan === 'tff' || v.scan === 'bff') {
    out.push({
      id: 'hap-interlaced',
      level: 'warning',
      title: 'Interlaced',
      text: 'Wird nicht deinterlaced – Kammeffekte bleiben im HAP-Clip.'
    })
  }
  if (v.fpsMode === 'vfr' || v.fpsMode === 'vfr-suspect') {
    out.push({
      id: 'hap-vfr',
      level: 'warning',
      title: 'Variable Bildrate',
      text: 'Bleibt im HAP-Clip erhalten – Ruckler im Medienserver möglich.'
    })
  }
  if (v.rotation === 90 || v.rotation === 270) {
    out.push({
      id: 'hap-rotation',
      level: 'info',
      title: `Drehung wird eingerechnet (→ ${fmtResolution(v.height, v.width)})`,
      text: 'Der HAP-Clip wird hochkant gespeichert – Medienserver brauchen das Flag dann nicht mehr.'
    })
  }
  if (v.sar) {
    out.push({
      id: 'hap-sar',
      level: 'warning',
      title: 'Anamorphe Pixel',
      text: 'Das Pixel-Seitenverhältnis bleibt; Medienserver zeigen das Bild ggf. gestaucht.'
    })
  }
  if (v.hdr) {
    out.push({
      id: 'hap-hdr',
      level: 'warning',
      title: 'HDR-Quelle',
      text: 'Wird nicht nach SDR gewandelt – Farben/Helligkeit prüfen.'
    })
  }
  return sortHints(out)
}
