// Reine Bausteine des Heimnetz-Streams (ohne Electron, getestet): Eingaben begrenzen, die
// ffmpeg-Argumente je Encoder und der Bildtakt. Der Stream ist live – jede Einstellung hier
// zielt auf geringe Verzögerung und schnellen Einstieg, nicht auf die kleinste Datei.

import type { StreamConfig } from '@shared/types'

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
 * ffmpeg liest rohe BGRA-Bilder von stdin (fester Takt, siehe framesDue) und schreibt MPEG-TS auf
 * stdout. resend_headers: PAT/PMT kommen regelmäßig – ein Empfänger, der mitten im Strom
 * einsteigt, erkennt ihn sofort. flush_packets: nichts im Muxer liegen lassen.
 */
export function buildStreamArgs(encoder: string, cfg: StreamConfig): string[] {
  const pixFmt = encoder === 'h264_qsv' ? 'nv12' : 'yuv420p'
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'bgra',
    '-s',
    `${cfg.width}x${cfg.height}`,
    '-framerate',
    String(cfg.fps),
    '-i',
    'pipe:0',
    '-an',
    // Begrenzter Bereich (TV-Pegel) und BT.709 ausdrücklich: sonst raten Decoder bei HD-Material
    // verschieden, und Schwarz wird grau.
    '-vf',
    `scale=out_color_matrix=bt709:out_range=tv,format=${pixFmt}`,
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

/**
 * Wie viele Bilder müssten seit dem Start im Takt geschrieben sein? ffmpeg zählt die Zeit nur
 * über die Bildanzahl – kommen weniger Bilder als der Takt, läuft der Stream langsamer als die
 * Uhr, und der Empfänger stockt. Deshalb schreibt der Sender nach dieser Uhr, nicht nach den
 * paint-Ereignissen (die bei Standbildern ganz ausbleiben).
 */
export function framesDue(startMs: number, nowMs: number, fps: number): number {
  return Math.max(0, Math.floor(((nowMs - startMs) * fps) / 1000))
}
