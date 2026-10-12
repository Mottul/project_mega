// Gemeinsames Gerüst der Auftragslisten (Video-Konverter, Player-Import, Video-Generator,
// YouTube-Downloader): Aufträge halten und jede Änderung melden, über die gemeinsame
// Warteschlange starten, abbrechen, Fertige entfernen und Fehler von Abbrüchen trennen. Was ein
// Auftrag tut, steht in run() der jeweiligen Liste.
//
// Regeln, die so für alle gelten (früher je Liste von Hand, nicht überall gleich):
// - Abbrechen nimmt einen wartenden Auftrag aus der Schlange und löst bei einem laufenden das
//   Signal aus; ein Fehler, der danach noch ankommt, überschreibt „abgebrochen“ nicht.
// - Gemeldet wird eine Kopie: Der Empfänger (IPC) darf sie nicht mit dem Auftrag teilen.

import { logLine } from '../log'
import { FfmpegCanceledError } from '../convert/runFfmpeg'
import { jobQueue, type JobQueue, type Lane } from './queue'

export interface BaseJob {
  id: string
  status: string
  error?: string
}

export const isFinished = (job: { status: string }): boolean =>
  job.status === 'done' || job.status === 'error' || job.status === 'canceled'

export abstract class JobList<J extends BaseJob, S> {
  private jobs = new Map<string, J>()
  private specs = new Map<string, S>()
  private aborts = new Map<string, AbortController>()
  private sink: (job: J) => void = () => {}

  constructor(
    /** Spur der Warteschlange */
    private readonly lane: Lane,
    /** Präfix der Logzeilen, z. B. '[konverter]' */
    private readonly tag: string,
    private readonly sharedQueue: JobQueue = jobQueue
  ) {}

  setSink(sink: (job: J) => void): void {
    this.sink = sink
  }

  list(): J[] {
    return [...this.jobs.values()]
  }

  /** Läuft gerade ein Auftrag dieser Liste? */
  running(): boolean {
    return this.aborts.size > 0
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job || isFinished(job)) return
    this.sharedQueue.remove(id)
    this.update(job, this.canceledPatch())
    this.aborts.get(id)?.abort()
    this.onCanceled(id)
  }

  cancelAll(): void {
    for (const id of this.jobs.keys()) this.cancel(id)
  }

  clearFinished(): void {
    for (const [id, job] of this.jobs) {
      if (isFinished(job)) {
        this.jobs.delete(id)
        this.specs.delete(id)
      }
    }
  }

  /** Den Auftrag ausführen. Fehler fängt run() selbst (Aufräumen) und gibt sie an fail(). */
  protected abstract run(job: J, spec: S, signal: AbortSignal): Promise<void>

  /** Kurzbeschreibung für die Logzeile eines Fehlers (Quelle bzw. Ziel) */
  protected abstract label(job: J): string

  /** Status beim Abbrechen (der Video-Generator ergänzt Text und Zeitpunkt) */
  protected canceledPatch(): Partial<J> {
    return { status: 'canceled' } as Partial<J>
  }

  /** Nach dem Abbrechen, z. B. halbe Ausgaben löschen (ein laufender Auftrag räumt selbst nach) */
  protected onCanceled(_id: string): void {}

  /** Kopie für die Meldung; Listen im Auftrag (Schritte, Hinweise) mitkopieren */
  protected snapshot(job: J): J {
    return { ...job }
  }

  /**
   * Methode statt Feldzugriff: cancel() kann den Status jederzeit ändern (sonst „weiß“
   * TypeScript nach einem await fälschlich noch den alten Wert).
   */
  protected isCanceled(job: J): boolean {
    return job.status === 'canceled'
  }

  /** Abgebrochen – per cancel() oder weil ffmpeg auf das Signal hin endete? */
  protected isAbort(job: J, err: unknown): boolean {
    return this.isCanceled(job) || err instanceof FfmpegCanceledError
  }

  protected update(job: J, patch: Partial<J>): void {
    Object.assign(job, patch)
    this.sink(this.snapshot(job))
  }

  /** Auftrag aufnehmen, melden und einreihen; gleicher `key` läuft nie gleichzeitig. */
  protected add(job: J, spec: S, key?: string): void {
    this.jobs.set(job.id, job)
    this.specs.set(job.id, spec)
    this.sink(this.snapshot(job))
    this.sharedQueue.add(job.id, this.lane, () => this.start(job), key)
  }

  /** Ende mit Fehler: ein Abbruch wird „abgebrochen“, alles andere „Fehler“ mit Text. */
  protected fail(job: J, err: unknown, patch: Partial<J> = {}): void {
    if (this.isAbort(job, err)) {
      if (!this.isCanceled(job)) this.update(job, this.canceledPatch())
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    logLine(this.tag, 'Fehler', this.label(job), '->', message)
    this.update(job, { ...patch, status: 'error', error: message })
  }

  private async start(job: J): Promise<void> {
    if (this.isCanceled(job)) return
    const spec = this.specs.get(job.id)
    if (spec === undefined) return
    const abort = new AbortController()
    this.aborts.set(job.id, abort)
    try {
      await this.run(job, spec, abort.signal)
    } finally {
      this.aborts.delete(job.id)
    }
  }
}
