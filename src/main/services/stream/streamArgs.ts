// Reine Bausteine des Heimnetz-Streams (ohne Electron, getestet): Eingaben begrenzen und die
// ffmpeg-Argumente je Encoder. Der Stream ist live – jede Einstellung hier zielt auf geringe
// Verzögerung und schnellen Einstieg, nicht auf die kleinste Datei.

import type { StreamConfig } from '@shared/types'

/** Größe der Bilder, die ffmpeg bekommt: das paint-Bild, bei Bildschirm-Skalierung größer. */
export interface StreamInput {
  width: number
  height: number
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
  return Math.max(min, Math.min(max, n))
}

/** Werte vom Renderer begrenzen: gerade Maße (yuv420p verlangt sie), Ports ab 1024. */
export function clampStreamConfig(
  cfg: Partial<StreamConfig>,
  defaults: StreamConfig
): StreamConfig {
  const even = (n: number): number => n - (n % 2)
  return {
    width: even(clampInt(cfg.width, 320, 3840, defaults.width)),
    height: even(clampInt(cfg.height, 180, 2160, defaults.height)),
    fps: clampInt(cfg.fps, 1, 60, defaults.fps),
    port: clampInt(cfg.port, 1024, 65535, defaults.port),
    bitrateKbps: clampInt(cfg.bitrateKbps, 500, 20000, defaults.bitrateKbps)
  }
}

/**
 * Encoder-Optionen für Live: konstante Rate (die Box puffert wenig), keine B-Frames (Verzögerung),
 * jede Sekunde ein Schlüsselbild (ein neuer Empfänger hat spätestens dann Bild).
 * H.264 High, Level 4.1 – das spielt jeder Hardware-Decoder in TV-Boxen.
 */
export function streamEncoderArgs(encoder: string, cfg: StreamConfig): string[] {
  const rate = `${cfg.bitrateKbps}k`
  const gop = String(cfg.fps)
  const common = ['-b:v', rate, '-maxrate', rate, '-g', gop, '-bf', '0']
  if (encoder === 'h264_nvenc') {
    return [
      '-c:v',
      encoder,
      '-preset',
      'p3',
      '-tune',
      'll',
      '-rc',
      'cbr',
      ...common,
      '-bufsize',
      rate,
      '-profile:v',
      'high',
      '-level',
      '4.1'
    ]
  }
  if (encoder === 'h264_qsv') {
    return [
      '-c:v',
      encoder,
      '-preset',
      'veryfast',
      '-look_ahead',
      '0',
      ...common,
      '-bufsize',
      rate,
      '-profile:v',
      'high',
      '-level',
      '41'
    ]
  }
  if (encoder === 'h264_amf') {
    return [
      '-c:v',
      encoder,
      '-usage',
      'lowlatency',
      '-rc',
      'cbr',
      ...common,
      '-bufsize',
      rate,
      '-profile:v',
      'high',
      '-level',
      '4.1'
    ]
  }
  if (encoder === 'h264_videotoolbox') {
    return ['-c:v', encoder, '-realtime', '1', ...common, '-profile:v', 'high']
  }
  // libx264: zerolatency schaltet Vorausschau und Frame-Threads ab; halber Puffer glättet weniger,
  // hält aber die Verzögerung klein. sc_threshold 0: Schlüsselbilder nur im festen Takt.
  const half = `${Math.max(250, Math.round(cfg.bitrateKbps / 2))}k`
  return [
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-tune',
    'zerolatency',
    ...common,
    '-bufsize',
    half,
    '-keyint_min',
    gop,
    '-sc_threshold',
    '0',
    '-profile:v',
    'high',
    '-level',
    '4.1'
  ]
}

/** Ton des Streams: so liest ffmpeg ihn vom Sender (Stereo, Float32, 48 kHz) */
export const STREAM_TON_RATE = 48000

export interface StreamTon {
  /** lokaler TCP-Port (127.0.0.1), an dem der Sender den Ton für ffmpeg bereitstellt */
  port: number
  /** Wanduhr beim Start (ms): Hier liegt Sample 0 des Tons (siehe tontakt.ts) */
  startMs: number
}

/**
 * Bildkette: auf die Ausgabegröße bringen, BT.709 im TV-Pegel, fester Takt. Kommt das Bild in
 * einem anderen Seitenverhältnis (die Erfassung malt in der Größe der NDI-Ausgabe, z. B. einer
 * breiten Wand), wird es eingepasst und mit Schwarz aufgefüllt statt verzerrt.
 */
export function streamVideoFilter(pixFmt: string, cfg: StreamConfig, input: StreamInput): string {
  const farbe = 'out_color_matrix=bt709:out_range=tv'
  const gleich = Math.abs(input.width / input.height - cfg.width / cfg.height) < 0.01
  if (gleich) return `scale=w=${cfg.width}:h=${cfg.height}:${farbe},format=${pixFmt},fps=${cfg.fps}`
  return (
    `scale=w=${cfg.width}:h=${cfg.height}:force_original_aspect_ratio=decrease:` +
    `force_divisible_by=2:${farbe},format=yuv420p,` +
    `pad=${cfg.width}:${cfg.height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `format=${pixFmt},fps=${cfg.fps}`
  )
}

/**
 * ffmpeg liest rohe BGRA-Bilder von stdin und schreibt MPEG-TS auf stdout. resend_headers:
 * PAT/PMT kommen regelmäßig – ein Empfänger, der mitten im Strom einsteigt, erkennt ihn sofort.
 * flush_packets: nichts im Muxer liegen lassen.
 *
 * Die Zeit im Strom kommt von der Uhr, nicht aus der Bildzahl: Jedes Bild bekommt beim Lesen
 * die Wanduhr als Zeitstempel, der fps-Filter macht daraus den festen Takt und füllt Lücken mit
 * dem letzten Bild. Stufe 1 zählte nur Bilder – jedes ausgelassene (main-Prozess hing, ffmpeg
 * kam nicht nach) ließ die Zeit im Strom dauerhaft hinter der Uhr zurück, bis der Empfänger leer
 * lief und sekundenlang stockte (gemessen: fünf Hänger zu 0,8 s = 4 s Rückstand).
 *
 * Mit Ton (Video-Player): Der Ton kommt ohne Zeitstempel über einen lokalen TCP-Port, lückenlos
 * vom Ton-Takt des Senders. asetpts legt Sample n auf Start + n / 48000 – auf dieselbe Uhr wie
 * die Bilder; -copyts behält beide Zeiten absolut, auch über einen Neustart von ffmpeg hinweg.
 * (-itsoffset greift bei Roh-PCM nicht: Ihre Pakete haben gar keinen Zeitstempel.)
 */
export function buildStreamArgs(
  encoder: string,
  cfg: StreamConfig,
  input: StreamInput = cfg,
  ton?: StreamTon
): string[] {
  const pixFmt = encoder === 'h264_qsv' ? 'nv12' : 'yuv420p'
  const tonEingang = ton
    ? [
        '-f',
        'f32le',
        '-sample_rate',
        String(STREAM_TON_RATE),
        '-ch_layout',
        'stereo',
        '-i',
        `tcp://127.0.0.1:${ton.port}`,
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-af',
        `asetpts=N/SR/TB+${(ton.startMs / 1000).toFixed(3)}/TB`
      ]
    : ['-an']
  const tonKodierung = ton ? ['-c:a', 'aac', '-b:a', '160k'] : []
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-use_wallclock_as_timestamps',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'bgra',
    '-s',
    `${input.width}x${input.height}`,
    '-framerate',
    String(cfg.fps),
    '-i',
    'pipe:0',
    ...tonEingang,
    // Die Zeitstempel bleiben die der Wanduhr, absolut statt ab 0: Startet ffmpeg neu (andere
    // Bildgröße, NDI an oder aus), macht der neue Strom dort weiter, wo die Uhr steht – für den
    // Empfänger eine kurze Lücke. Ab 0 sprang die Zeit zurück (nachgestellt: 5,5 s), und der
    // Empfänger lief dauerhaft hinterher (einmal auf dem macOS-Runner gesehen: 11,5 s).
    '-copyts',
    // Auf die Ausgabegröße bringt ffmpeg das Bild selbst (bei Bildschirm-Skalierung kommt es
    // größer) – im main-Prozess kostete das je Bild Zeit, in der er nichts anderes tun kann.
    // Begrenzter Bereich (TV-Pegel) und BT.709 ausdrücklich: sonst raten Decoder bei HD-Material
    // verschieden, und Schwarz wird grau.
    '-vf',
    streamVideoFilter(pixFmt, cfg, input),
    ...tonKodierung,
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-colorspace',
    'bt709',
    ...streamEncoderArgs(encoder, cfg),
    '-f',
    'mpegts',
    '-mpegts_flags',
    'resend_headers',
    '-flush_packets',
    '1',
    'pipe:1'
  ]
}
