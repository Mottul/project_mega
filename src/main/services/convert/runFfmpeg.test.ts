import { describe, expect, it, vi } from 'vitest'

// Statt ffmpeg läuft Node selbst: so lässt sich ein lange laufender Prozess ohne gebündeltes
// ffmpeg nachstellen
vi.mock('../ffmpeg/ffmpegPath', () => ({ ffmpegBinPath: () => process.execPath }))

const { FfmpegCanceledError, killAllFfmpeg, runFfmpeg, runningFfmpegCount } =
  await import('./runFfmpeg')

const forever = ['-e', 'setTimeout(() => {}, 30000)']

describe('runFfmpeg – laufende Prozesse beim Beenden', () => {
  it('werden gezählt und von killAllFfmpeg hart beendet', async () => {
    const a = runFfmpeg(forever)
    const b = runFfmpeg(forever)
    expect(runningFfmpegCount()).toBe(2)
    expect(killAllFfmpeg()).toBe(2)
    // beide Erwartungen zugleich: sonst wäre die zweite Ablehnung kurz unbehandelt
    await Promise.all([expect(a).rejects.toThrow(/beendet/), expect(b).rejects.toThrow(/beendet/)])
    expect(runningFfmpegCount()).toBe(0)
  })

  it('ein fertiger oder abgebrochener Lauf trägt sich wieder aus', async () => {
    await runFfmpeg(['-e', 'process.exit(0)'])
    expect(runningFfmpegCount()).toBe(0)
    const abort = new AbortController()
    const run = runFfmpeg(forever, { signal: abort.signal })
    expect(runningFfmpegCount()).toBe(1)
    abort.abort()
    await expect(run).rejects.toBeInstanceOf(FfmpegCanceledError)
    expect(runningFfmpegCount()).toBe(0)
    expect(killAllFfmpeg()).toBe(0)
  })
})
