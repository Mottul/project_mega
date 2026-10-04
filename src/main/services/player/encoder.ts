// Player-spezifische ffmpeg-Bausteine. Die eigentliche Konvertierung (Fit auf die
// Wand, Korrekturen, Encoder-Argumente) kommt aus dem gemeinsamen Konvertierungs-Kern
// (shared/convertPlan + convert/args); die Encoder-Erkennung aus convert/encoders.

export { detectEncoders, resolveEncoder } from '../convert/encoders'

/** ffmpeg-Argumente: Vorschaubild (480px breit) aus Video/Bild. */
export function buildThumbArgs(opts: {
  input: string
  output: string
  seekSec: number
  isVideo: boolean
}): string[] {
  const seek = opts.isVideo ? ['-ss', String(Math.max(0, opts.seekSec))] : []
  return [
    '-hide_banner',
    ...seek,
    '-i',
    opts.input,
    '-frames:v',
    '1',
    '-vf',
    'scale=480:-2',
    '-q:v',
    '3',
    '-y',
    opts.output
  ]
}
