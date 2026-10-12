import { describe, expect, it, vi } from 'vitest'

// runFfmpeg und log ziehen nur `electron` (app) herein
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false, getAppPath: () => '/x' }
}))
vi.mock('../log', () => ({ logLine: vi.fn() }))

const { JobQueue } = await import('./queue')
const { JobList } = await import('./jobList')
const { FfmpegCanceledError } = await import('../convert/runFfmpeg')

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('Warteschlange', () => {
  it('Spuren: Player wartet nie auf den Konverter, Limits je Spur, Entfernen vor Start', async () => {
    const q = new JobQueue()
    const started: string[] = []
    const gates: Record<string, () => void> = {}
    const job = (id: string) => () =>
      new Promise<void>((res) => {
        started.push(id)
        gates[id] = res
      })
    q.add('k1', 'converter', job('k1'))
    q.add('k2', 'converter', job('k2'))
    q.add('k3', 'converter', job('k3'))
    q.add('p1', 'player', job('p1'))
    q.add('d1', 'download', job('d1'))
    q.add('d2', 'download', job('d2'))
    q.add('d3', 'download', job('d3'))
    await Promise.resolve()
    await Promise.resolve()
    // Downloads: zwei gleichzeitig, unabhängig von den Konvertierungen
    expect(started).toEqual(['k1', 'p1', 'd1', 'd2'])
    expect(q.remove('k3')).toBe(true)
    gates.k1()
    await tick()
    expect(started).toEqual(['k1', 'p1', 'd1', 'd2', 'k2'])
    q.setLimit('converter', 2)
    expect(q.runningCount('converter')).toBe(1)
    expect(q.runningCount('download')).toBe(2)
  })

  it('gleicher Sperr-Schlüssel nie gleichzeitig: wartet ohne Platz, andere ziehen vorbei', async () => {
    const q = new JobQueue()
    q.setLimit('player', 2)
    const started: string[] = []
    const gates: Record<string, () => void> = {}
    const job = (id: string) => () =>
      new Promise<void>((res) => {
        started.push(id)
        gates[id] = res
      })
    q.add('a1', 'player', job('a1'), 'clip.mp4')
    q.add('a2', 'player', job('a2'), 'clip.mp4')
    q.add('b', 'player', job('b'), 'other.mp4')
    q.add('a3', 'player', job('a3'), 'clip.mp4')
    await Promise.resolve()
    expect(started).toEqual(['a1', 'b'])
    // der wartende Doppelgänger ist noch abbrechbar
    expect(q.remove('a3')).toBe(true)
    gates.a1()
    await tick()
    expect(started).toEqual(['a1', 'b', 'a2'])
    expect(q.runningCount('player')).toBe(2)
  })

  it('idle(): wartet auf laufende Aufträge samt Aufräumen, auch auf nachrückende', async () => {
    const q = new JobQueue()
    const gates: Record<string, () => void> = {}
    const cleaned: string[] = []
    // wie ein Auftrag: erst das Ende des Laufs, danach noch Aufräumen
    const job = (id: string) => () =>
      new Promise<void>((res) => (gates[id] = res)).then(async () => {
        await new Promise((r) => setTimeout(r, 5))
        cleaned.push(id)
      })
    q.add('a', 'converter', job('a'))
    q.add('b', 'converter', job('b'))
    expect(q.busy()).toBe(true)
    let idle = false
    const waiting = q.idle().then(() => (idle = true))
    await tick()
    gates.a()
    await new Promise((r) => setTimeout(r, 20))
    // a ist fertig, b ist nachgerückt und läuft noch
    expect(cleaned).toEqual(['a'])
    expect(idle).toBe(false)
    gates.b()
    await waiting
    expect(cleaned).toEqual(['a', 'b'])
    expect(q.busy()).toBe(false)
  })
})

interface TestJob {
  id: string
  status: 'queued' | 'running' | 'done' | 'error' | 'canceled'
  error?: string
  steps: string[]
}

/** Auftragsliste zum Testen: jeder Lauf wartet, bis der Test ihn beendet */
class TestList extends JobList<TestJob, { name: string }> {
  runs: { spec: { name: string }; signal: AbortSignal; finish: (err?: unknown) => void }[] = []
  canceled: string[] = []

  constructor(queue: InstanceType<typeof JobQueue>) {
    super('converter', '[test]', queue)
  }

  enqueue(id: string): TestJob {
    const job: TestJob = { id, status: 'queued', steps: [] }
    this.add(job, { name: `spec-${id}` })
    return job
  }

  protected label(job: TestJob): string {
    return job.id
  }

  protected snapshot(job: TestJob): TestJob {
    return { ...job, steps: [...job.steps] }
  }

  protected onCanceled(id: string): void {
    this.canceled.push(id)
  }

  protected run(job: TestJob, spec: { name: string }, signal: AbortSignal): Promise<void> {
    this.update(job, { status: 'running', steps: ['läuft'] })
    return new Promise((resolve) => {
      this.runs.push({
        spec,
        signal,
        finish: (err) => {
          if (err) this.fail(job, err)
          else this.update(job, { status: 'done' })
          resolve()
        }
      })
    })
  }
}

function setup(limit = 1): { list: TestList; sent: TestJob[] } {
  const queue = new JobQueue()
  queue.setLimit('converter', limit)
  const list = new TestList(queue)
  const sent: TestJob[] = []
  list.setSink((job) => sent.push(job))
  return { list, sent }
}

describe('Auftragsliste (gemeinsame Basis)', () => {
  it('meldet Kopien, startet über die Spur mit Spezifikation und Signal', async () => {
    const { list, sent } = setup()
    const job = list.enqueue('a')
    expect(sent[0]).toEqual({ id: 'a', status: 'queued', steps: [] })
    expect(sent[0]).not.toBe(job)
    await tick()
    expect(list.runs[0].spec).toEqual({ name: 'spec-a' })
    expect(list.running()).toBe(true)
    // auch die Liste im Auftrag ist eine Kopie – der Empfänger teilt nichts mit dem Auftrag
    expect(sent.at(-1)?.steps).toEqual(['läuft'])
    expect(sent.at(-1)?.steps).not.toBe(job.steps)
    list.runs[0].finish()
    await tick()
    expect(list.running()).toBe(false)
    expect(sent.at(-1)?.status).toBe('done')
    expect(list.list()).toEqual([job])
  })

  it('Abbrechen: wartend aus der Schlange, laufend über das Signal; ein späterer Fehler ändert nichts', async () => {
    const { list } = setup(1)
    const a = list.enqueue('a')
    const b = list.enqueue('b')
    await tick()
    list.cancel('b')
    expect(b.status).toBe('canceled')
    list.cancel('a')
    expect(a.status).toBe('canceled')
    expect(list.runs[0].signal.aborted).toBe(true)
    // der Lauf endet erst jetzt – mit dem Fehler, den der Abbruch auslöste
    list.runs[0].finish(new Error('ffmpeg beendet mit Code 255'))
    await tick()
    expect(a).toMatchObject({ status: 'canceled' })
    expect(a.error).toBeUndefined()
    expect(list.runs).toHaveLength(1) // b ist nie gestartet
    expect(list.canceled).toEqual(['b', 'a'])
  })

  it('Fehler mit Text; endet ffmpeg auf das Signal hin, heißt das „abgebrochen“', async () => {
    const { list } = setup(2)
    const a = list.enqueue('a')
    const b = list.enqueue('b')
    await tick()
    list.runs[0].finish(new Error('Keine Videospur gefunden'))
    list.runs[1].finish(new FfmpegCanceledError())
    await tick()
    expect(a).toMatchObject({ status: 'error', error: 'Keine Videospur gefunden' })
    expect(b.status).toBe('canceled')
  })

  it('Fertige entfernen, Laufende bleiben; fertige Aufträge lassen sich nicht mehr abbrechen', async () => {
    const { list } = setup(2)
    const a = list.enqueue('a')
    list.enqueue('b')
    await tick()
    list.runs[0].finish()
    await tick()
    list.cancel('a')
    expect(a.status).toBe('done')
    list.clearFinished()
    expect(list.list().map((j) => j.id)).toEqual(['b'])
    list.cancelAll()
    expect(list.list()[0].status).toBe('canceled')
    expect(list.canceled).toEqual(['b'])
  })
})
