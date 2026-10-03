// Zentrale Liste unterstützter Medien-Endungen. EINE Quelle statt bislang vier
// driftender Kopien (Player-Dialog, Drag&Drop-Import, HAP-Import, Idle-Dialog) –
// dort war z.B. der Idle-Dialog nicht deckungsgleich mit dem, was der Konverter
// tatsächlich verarbeitet. Endungen ohne führenden Punkt; `dotted()` liefert die
// Punkt-Variante für extname()-Vergleiche.

export const VIDEO_EXTENSIONS: string[] = [
  'mov',
  'mp4',
  'mxf',
  'avi',
  'mkv',
  'm4v',
  'mpg',
  'mpeg',
  'wmv',
  'mts',
  'm2ts',
  'ts',
  'webm'
]

/** Standbilder (ohne animiertes GIF). */
export const STILL_IMAGE_EXTENSIONS: string[] = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff']

/** Bilder inkl. animiertem GIF (im Player eine „Bild"-Kachel). */
export const IMAGE_EXTENSIONS: string[] = [...STILL_IMAGE_EXTENSIONS, 'gif']

/** Alle vom Player/Konverter akzeptierten Medien. */
export const MEDIA_EXTENSIONS: string[] = [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]

/** Audiodateien (Jingle-Player-Formate + Profi-/Broadcast-Endungen). */
export const AUDIO_EXTENSIONS: string[] = [
  'wav',
  'bwf',
  'mp3',
  'm4a',
  'aac',
  'aif',
  'aiff',
  'flac',
  'ogg',
  'oga',
  'opus',
  'wma',
  'ac3'
]

/** Weitere Containerformate, die nur die Medien-Info liest (nicht Player/Konverter). */
export const PROBE_ONLY_EXTENSIONS: string[] = ['dv', 'mpe', 'vob', 'flv', '3gp', 'ogv', 'mka']

/** Alles, was die Medien-Info beim Durchsuchen von Ordnern aufnimmt. */
export const PROBE_EXTENSIONS: string[] = [
  ...MEDIA_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...PROBE_ONLY_EXTENSIONS
]

/** Endungen mit führendem Punkt (".mp4") – für extname()-Vergleiche. */
export const dotted = (exts: readonly string[]): string[] => exts.map((e) => `.${e}`)
