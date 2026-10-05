import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EncoderInfo } from '@shared/types'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false, getAppPath: () => '/x' }
}))

// ffmpeg simulieren: welche Encoder der Build kennt und welche auf „dieser Hardware“ laufen –
// so lassen sich Erkennung und Rückfall ohne GPU im Testrechner prüfen.
const sim = vi.hoisted(() => ({
  listing: '' as string | null, // null = ffmpeg fehlt
  works: new Set<string>(),
  compatWorks: new Set<string>(),
  probes: [] as string[]
}))

vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    execFile: (
      _bin: string,
      args: string[],
      _opts: unknown,
      cb: (err: Error | null, res?: { stdout: string; stderr: string }) => void
    ) => {
      if (sim.listing === null) return cb(new Error('spawn ffmpeg ENOENT'))
      const stdout = args.includes('-version') ? 'ffmpeg version test\n' : sim.listing
      cb(null, { stdout, stderr: '' })
    },
    spawn: (_bin: string, args: string[]) => {
      const proc = new EventEmitter()
      const enc = args[args.indexOf('-c:v') + 1]
      const compat = args.includes('-maxrate')
      sim.probes.push(compat ? `${enc}+compat` : enc)
      const ok = compat ? sim.compatWorks.has(enc) : sim.works.has(enc)
      setImmediate(() => proc.emit('close', ok ? 0 : 1))
      return proc
    }
  }
})

const {
  CPU_ENCODERS,
  PRORES_FAST,
  detectConverterEncoders,
  detectEncoders,
  encodeWithFallback,
  encoderPixFmt,
  hardwareCandidates,
  hardwareEncoderArgs,
  resolveEncoder
} = await import('./encoders')
const { FfmpegCanceledError } = await import('./runFfmpeg')

const COMPAT = { level: '4.2', maxrate: '60M', bufsize: '120M' }
const after = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1]

describe('GPU-Encoder: Kandidaten und Argumente', () => {
  it('Kandidaten je Plattform (bester zuerst), ProRes in Hardware nur auf dem Mac', () => {
    const ids = (f: 'h264' | 'hevc' | 'prores', p: NodeJS.Platform): string[] =>
      hardwareCandidates(f, p).map((e) => e.id)
    expect(ids('h264', 'win32')).toEqual(['h264_nvenc', 'h264_amf', 'h264_qsv'])
    expect(ids('hevc', 'linux')).toEqual(['hevc_nvenc', 'hevc_qsv'])
    expect(ids('h264', 'darwin')).toEqual(['h264_videotoolbox'])
    expect(ids('prores', 'darwin')).toEqual(['prores_videotoolbox'])
    expect(ids('prores', 'win32')).toEqual([])
    expect(hardwareCandidates('hevc', 'win32').every((e) => e.hardware)).toBe(true)
  })

  it('Standard-Qualität = die bewährten Werte des Player-Imports', () => {
    expect(hardwareEncoderArgs('h264_nvenc')).toEqual([
      '-c:v',
      'h264_nvenc',
      '-preset',
      'p5',
      '-rc',
      'vbr',
      '-cq',
      '23',
      '-b:v',
      '0'
    ])
    expect(hardwareEncoderArgs('h264_qsv')).toEqual(['-c:v', 'h264_qsv', '-global_quality', '23'])
    expect(after(hardwareEncoderArgs('h264_amf'), '-qp_i')).toBe('22')
    expect(after(hardwareEncoderArgs('h264_amf'), '-qp_p')).toBe('22')
    expect(hardwareEncoderArgs('h264_videotoolbox')).toEqual([
      '-c:v',
      'h264_videotoolbox',
      '-q:v',
      '55'
    ])
  })

  it('Qualitätsstufen; H.265 wie bei x265 zwei Stufen höher', () => {
    expect(after(hardwareEncoderArgs('h264_nvenc', 'high'), '-cq')).toBe('19')
    expect(after(hardwareEncoderArgs('hevc_nvenc', 'standard'), '-cq')).toBe('25')
    expect(after(hardwareEncoderArgs('hevc_qsv', 'small'), '-global_quality')).toBe('30')
    // VideoToolbox: größer = besser
    expect(after(hardwareEncoderArgs('hevc_videotoolbox', 'high'), '-q:v')).toBe('65')
    expect(hardwareEncoderArgs('prores_videotoolbox')).toEqual(['-c:v', 'prores_videotoolbox'])
  })

  it('Player-Boxen: Level und Bitraten-Deckel je Encoder in dessen Schreibweise', () => {
    const nv = hardwareEncoderArgs('h264_nvenc', 'standard', COMPAT)
    expect(after(nv, '-maxrate')).toBe('60M')
    expect(after(nv, '-bufsize')).toBe('120M')
    expect(after(nv, '-level:v')).toBe('4.2')
    const qsv = hardwareEncoderArgs('h264_qsv', 'standard', COMPAT)
    expect(after(qsv, '-level')).toBe('42')
    expect(after(qsv, '-b:v')).toBe('30M')
    expect(qsv).not.toContain('-global_quality')
    const amf = hardwareEncoderArgs('h264_amf', 'standard', COMPAT)
    expect(after(amf, '-rc')).toBe('vbr_peak')
    expect(after(amf, '-level')).toBe('4.2')
    expect(amf).not.toContain('-qp_i')
    // VideoToolbox kennt keinen Deckel -> Player-Boxen bekommen dort die CPU (compat=false)
    expect(hardwareEncoderArgs('h264_videotoolbox', 'standard', COMPAT)).not.toContain('-maxrate')
  })

  it('Quick Sync rechnet intern in nv12, alle anderen im geplanten Format', () => {
    expect(encoderPixFmt('h264_qsv', 'yuv420p')).toBe('nv12')
    expect(encoderPixFmt('hevc_qsv', 'yuv420p')).toBe('nv12')
    expect(encoderPixFmt('h264_nvenc', 'yuv420p')).toBe('yuv420p')
    expect(encoderPixFmt('prores_aw', 'yuva444p10le')).toBe('yuva444p10le')
  })
})

describe('Rückfall auf die CPU', () => {
  const gpu: EncoderInfo = { id: 'h264_nvenc', label: 'NVENC', hardware: true }

  it('GPU scheitert mitten im Auftrag -> genau ein Versuch auf der CPU', async () => {
    const used: string[] = []
    const onFallback = vi.fn()
    const res = await encodeWithFallback(
      gpu,
      CPU_ENCODERS.h264,
      async (e) => {
        used.push(e.id)
        if (e.hardware) throw new Error('OpenEncodeSessionEx failed: out of memory')
      },
      onFallback
    )
    expect(res).toBe(CPU_ENCODERS.h264)
    expect(used).toEqual(['h264_nvenc', 'libx264'])
    expect(onFallback).toHaveBeenCalledOnce()
    // GPU klappt -> kein zweiter Lauf
    used.length = 0
    expect(
      await encodeWithFallback(gpu, CPU_ENCODERS.h264, async (e) => void used.push(e.id))
    ).toBe(gpu)
    expect(used).toEqual(['h264_nvenc'])
  })

  it('Abbruch, CPU-Fehler und doppeltes Scheitern werden nicht verschluckt', async () => {
    const used: string[] = []
    await expect(
      encodeWithFallback(gpu, CPU_ENCODERS.h264, async (e) => {
        used.push(e.id)
        throw new FfmpegCanceledError()
      })
    ).rejects.toBeInstanceOf(FfmpegCanceledError)
    expect(used).toEqual(['h264_nvenc'])
    // kein Hardware-Encoder (z. B. kaputte Quelle mit libx264): nicht sinnlos wiederholen
    used.length = 0
    await expect(
      encodeWithFallback(PRORES_FAST, CPU_ENCODERS.prores, async (e) => {
        used.push(e.id)
        throw new Error('kaputt')
      })
    ).rejects.toThrow('kaputt')
    expect(used).toEqual(['prores_aw'])
    // beide scheitern: der Fehler des CPU-Laufs zählt
    await expect(
      encodeWithFallback(gpu, CPU_ENCODERS.h264, async (e) => {
        throw new Error(`Fehler ${e.id}`)
      })
    ).rejects.toThrow('Fehler libx264')
  })
})

describe('Erkennung mit Probelauf (simuliertes ffmpeg)', () => {
  const families = ['h264', 'hevc', 'prores'] as const
  const allCandidates = families.flatMap((f) => hardwareCandidates(f).map((e) => e.id))
  const listing = (ids: string[]): string =>
    ['Encoders:', ...ids.map((id) => ` V....D ${id.padEnd(20)} Test`)].join('\n')

  beforeEach(() => {
    sim.listing = listing([...allCandidates, 'libx264', 'libx265', 'prores_aw', 'prores_ks'])
    sim.works.clear()
    sim.compatWorks.clear()
    sim.probes.length = 0
  })

  it('im Build, aber ohne passende Hardware -> CPU; ProRes schnell vor kompakt', async () => {
    const s = await detectConverterEncoders(true)
    expect(s.h264).toEqual([CPU_ENCODERS.h264])
    expect(s.hevc).toEqual([CPU_ENCODERS.hevc])
    expect(s.prores).toEqual([PRORES_FAST, CPU_ENCODERS.prores])
    // jeder Kandidat genau einmal probiert, kein Player-Box-Lauf nach gescheitertem Probelauf
    expect([...sim.probes].sort()).toEqual([...allCandidates].sort())
  })

  it('laufende GPU zuerst; Player-Box-Tauglichkeit eigens geprüft und gecacht', async () => {
    const [first] = hardwareCandidates('h264')
    const vt = first.id.endsWith('_videotoolbox')
    sim.works.add(first.id)
    let s = await detectConverterEncoders(true)
    expect(s.h264).toEqual([{ ...first, compat: false }, CPU_ENCODERS.h264])
    expect(sim.probes.includes(`${first.id}+compat`)).toBe(!vt)

    sim.compatWorks.add(first.id)
    s = await detectConverterEncoders(true)
    expect(s.h264[0]).toEqual({ ...first, compat: !vt })
    // ohne force: keine neuen Probeläufe
    const n = sim.probes.length
    await detectConverterEncoders()
    expect(sim.probes.length).toBe(n)
  })

  it('nicht im Build enthaltene Encoder werden gar nicht erst probiert', async () => {
    sim.listing = listing(['libx264', 'libx265', 'prores_ks', 'prores_aw'])
    await detectConverterEncoders(true)
    expect(sim.probes).toEqual([])
  })

  it('Player: Einstellung -> geprüfter Encoder; fehlendes ffmpeg wird später erneut gesucht', async () => {
    const [first] = hardwareCandidates('h264')
    sim.works.add(first.id)
    const st = await detectEncoders(true)
    expect(st.recommended).toBe(first.id)
    expect((await resolveEncoder('cpu')).id).toBe('libx264')
    expect((await resolveEncoder('auto')).id).toBe(first.id)
    expect((await resolveEncoder('libx264')).id).toBe('libx264')
    // gemerkter Encoder hier (nicht mehr) nutzbar -> Empfehlung statt Fehlschlag
    expect((await resolveEncoder('h264_gibtsnicht')).id).toBe(first.id)

    sim.listing = null
    const missing = await detectEncoders(true)
    expect(missing.ffmpegFound).toBe(false)
    expect(missing.recommended).toBe('libx264')
    sim.listing = listing(['libx264'])
    const found = await detectEncoders()
    expect(found.ffmpegFound).toBe(true)
    expect(found.version).toBe('ffmpeg version test')
  })
})
