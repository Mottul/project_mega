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
 */
export function buildStreamArgs(
  encoder: string,
  cfg: StreamConfig,
  input: StreamInput = cfg
): string[] {
  const pixFmt = encoder === 'h264_qsv' ? 'nv12' : 'yuv420p'
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
    '-an',
    // Auf die Ausgabegröße bringt ffmpeg das Bild selbst (bei Bildschirm-Skalierung kommt es
    // größer) – im main-Prozess kostete das je Bild Zeit, in der er nichts anderes tun kann.
    // Begrenzter Bereich (TV-Pegel) und BT.709 ausdrücklich: sonst raten Decoder bei HD-Material
    // verschieden, und Schwarz wird grau.
    '-vf',
    `scale=w=${cfg.width}:h=${cfg.height}:out_color_matrix=bt709:out_range=tv,` +
      `format=${pixFmt},fps=${cfg.fps}`,
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
