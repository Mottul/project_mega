// SMPTE-Timecode-Mathematik (reine Funktionen): Timecode <-> Framenummer <->
// Echtzeit, inkl. Drop-Frame fuer 29.97/59.94 (NTSC). Drop-Frame laesst FRAME-
// NUMMERN aus (keine Bilder!): je Minute 2 bzw. 4 Nummern, ausser jeder 10.

export interface TcRate {
  key: string
  label: string
  /** nominelle Frames je TC-Sekunde (Zaehlbasis) */
  nominal: number
  /** echte Frames je Echtzeit-Sekunde */
  exact: number
  drop: boolean
}

export const TC_RATES: TcRate[] = [
  {
    key: '23.976',
    label: '23,976 fps (24 ÷ 1,001)',
    nominal: 24,
    exact: 24000 / 1001,
    drop: false
  },
  { key: '24', label: '24 fps (Film)', nominal: 24, exact: 24, drop: false },
  { key: '25', label: '25 fps (PAL/EBU)', nominal: 25, exact: 25, drop: false },
  {
    key: '29.97df',
    label: '29,97 fps Drop-Frame (NTSC)',
    nominal: 30,
    exact: 30000 / 1001,
    drop: true
  },
  { key: '29.97', label: '29,97 fps Non-Drop', nominal: 30, exact: 30000 / 1001, drop: false },
  { key: '30', label: '30 fps', nominal: 30, exact: 30, drop: false },
  { key: '50', label: '50 fps', nominal: 50, exact: 50, drop: false },
  { key: '59.94df', label: '59,94 fps Drop-Frame', nominal: 60, exact: 60000 / 1001, drop: true },
  { key: '59.94', label: '59,94 fps Non-Drop', nominal: 60, exact: 60000 / 1001, drop: false },
  { key: '60', label: '60 fps', nominal: 60, exact: 60, drop: false }
]

/** Anzahl je Minute uebersprungener Frame-NUMMERN (2 bei 29,97, 4 bei 59,94). */
function dropPerMinute(rate: TcRate): number {
  return rate.drop ? Math.round(rate.nominal * 0.06666666666) : 0
}

export interface TcParts {
  hh: number
  mm: number
  ss: number
  ff: number
}

/** Framenummer -> Timecode-Bestandteile. */
export function framesToTc(frameNumber: number, rate: TcRate): TcParts {
  let fn = Math.max(0, Math.round(frameNumber))
  const fps = rate.nominal
  const dp = dropPerMinute(rate)
  if (dp > 0) {
    const framesPerMinute = fps * 60 - dp // zaehlbare Nummern je Minute (ausser 10.)
    const framesPer10Min = fps * 600 - dp * 9
    const d = Math.floor(fn / framesPer10Min)
    const m = fn % framesPer10Min
    if (m > dp) fn += dp * 9 * d + dp * Math.floor((m - dp) / framesPerMinute)
    else fn += dp * 9 * d
  }
  const ff = fn % fps
  const ss = Math.floor(fn / fps) % 60
  const mm = Math.floor(fn / (fps * 60)) % 60
  const hh = Math.floor(fn / (fps * 3600))
  return { hh, mm, ss, ff }
}

/** Timecode-Bestandteile -> Framenummer. Bei Drop-Frame werden unzulaessige
 *  Frames (00/01 bzw. 00–03 am Minutenanfang) auf den ersten gueltigen gehoben. */
export function tcToFrames(tc: TcParts, rate: TcRate): number {
  const fps = rate.nominal
  const dp = dropPerMinute(rate)
  let { ff } = tc
  if (dp > 0 && tc.ss === 0 && tc.mm % 10 !== 0 && ff < dp) ff = dp
  const totalMinutes = tc.hh * 60 + tc.mm
  return (
    tc.hh * 3600 * fps +
    tc.mm * 60 * fps +
    tc.ss * fps +
    ff -
    dp * (totalMinutes - Math.floor(totalMinutes / 10))
  )
}

export function framesToSeconds(frames: number, rate: TcRate): number {
  return frames / rate.exact
}

export function secondsToFrames(seconds: number, rate: TcRate): number {
  return Math.round(seconds * rate.exact)
}

/** "1:02:03:12", "02:03:12", "03:12", "12" -> Teile (fehlende links = 0).
 *  Trennzeichen : ; . erlaubt. null bei Unfug. */
export function parseTc(input: string, rate: TcRate): TcParts | null {
  const groups = input.trim().split(/[:;.,]/)
  if (
    groups.length === 0 ||
    groups.length > 4 ||
    groups.some((g) => g === '' || !/^\d{1,3}$/.test(g))
  ) {
    return null
  }
  const nums = groups.map((g) => parseInt(g, 10))
  while (nums.length < 4) nums.unshift(0)
  const [hh, mm, ss, ff] = nums
  if (mm > 59 || ss > 59 || ff >= rate.nominal) return null
  return { hh, mm, ss, ff }
}

export function formatTc(tc: TcParts, rate: TcRate): string {
  const sep = rate.drop ? ';' : ':'
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(tc.hh)}:${p(tc.mm)}:${p(tc.ss)}${sep}${p(tc.ff)}`
}

/** Echtzeit hh:mm:ss.mmm fuer Anzeige. */
export function formatRealtime(seconds: number): string {
  const neg = seconds < 0
  const s = Math.abs(seconds)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const core = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${ss.toFixed(3).padStart(6, '0')}`
  return neg ? `−${core}` : core
}
