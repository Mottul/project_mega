// Datei-Bindung eines Werkzeugs an eine Projektdatei (.mottul) – für alle Werkzeuge mit Dateien
// gleich (LED-Wall, später Anleitung, Packliste). Regeln (docs/PLAN-MINI-MANUAL.md):
// - Ohne Datei arbeitet das Werkzeug wie immer; erst „Speichern unter“ legt eine Datei an.
// - Speichern schreibt nur den eigenen Abschnitt; main erkennt Konflikte über die Prüfsumme des
//   Abschnitts beim Öffnen (baseSha).
// - „Ungespeichert“ = Prüfsumme der aktuellen Daten ≠ Prüfsumme beim letzten Öffnen/Speichern.
//   Kein Setter muss dafür etwas tun, und eine zurückgenommene Änderung gilt wieder als sauber.
// - Die Bindung liegt im persistierten Store des Werkzeugs: alle Fenster zeigen dieselbe Datei,
//   auch nach einem Neustart – aber NEBEN den Daten, damit Vorlagen sie nicht mitnehmen.
// - Rückfragen sperren nur das eigene Fenster. Jede Aktion hält daher zu Beginn Daten und Bindung
//   fest, schreibt genau diese und bricht ab, wenn ein anderes Fenster währenddessen etwas geändert
//   hat – sonst landete eine fremde Planung in der Datei, der man gerade zugestimmt hat.

import { useEffect, useRef, useState } from 'react'
import { digest, projectDisplayName, type ProjectSectionKey } from '@shared/projectFile'
import type { ProjectFileProblem, ProjectSaveResult, ProjectSectionInfo } from '@shared/types'
import { api } from './api'
import type { ProjectBinding } from './projectBinding'
import { setTitleDetail } from './windowTitle'

export { sanitizeBinding, type ProjectBinding } from './projectBinding'

export const PROBLEM_TEXT: Record<ProjectFileProblem, string> = {
  'kein-projekt': 'Das ist keine Mottulbox-Projektdatei.',
  neuer: 'Die Datei stammt aus einer neueren Mottulbox. Bitte Mottulbox aktualisieren.',
  kaputt: 'Die Datei ist beschädigt und lässt sich nicht lesen.',
  fehlt: 'Die Datei ist nicht (mehr) erreichbar – vielleicht ist das Netzlaufwerk getrennt.',
  'zu-gross': 'Die Datei ist zu groß – oder würde es mit diesen Daten (sehr große Wand?).',
  'nicht-freigegeben': 'In diese Datei kann nur über „Speichern unter“ geschrieben werden.',
  ungueltig: 'Die Daten ließen sich nicht speichern.',
  'foto-fehlt':
    'Ein benutztes Foto ist nicht mehr da (weder in der Datei noch im Foto-Speicher). Bitte das Foto neu einfügen.',
  fehler: 'Lesen oder Schreiben ist fehlgeschlagen (Einzelheiten im Debug-Log).'
}

interface StoreLike<S> {
  getState: () => S
  subscribe: (listener: (state: S) => void) => () => void
}

export interface ProjectFileOptions<S> {
  section: ProjectSectionKey
  /** Schema-Version, die dieses Werkzeug schreibt */
  version: number
  /** Anzeigename des Abschnitts („LED-Wall-Planung“) */
  label: string
  store: StoreLike<S>
  /** Daten des Abschnitts (ohne Bedienzustand und ohne Vorlagen) */
  data: (s: S) => unknown
  binding: (s: S) => ProjectBinding | null
  setBinding: (b: ProjectBinding | null) => void
  /** Daten aus der Datei übernehmen (prüfen, migrieren); false = unbrauchbar */
  apply: (data: unknown, version: number) => boolean
  /** „Neu“: zurück auf die Vorgaben */
  reset: () => void
  /** Daten nach reset() – für „Leere anlegen“, ohne den Arbeitsstand vorher anzufassen */
  blank: () => unknown
  /** Gibt es etwas, das beim Ersetzen verloren ginge (ohne Datei)? */
  isEmpty: (s: S) => boolean
  suggestedName: (s: S) => string
  /** kurz für Rückfragen, z. B. „Messe Dornbirn · Beispiel GmbH“ */
  describe: (data: unknown) => string
  /** benutzte Fotos (Hashes) in den Daten – nur Werkzeuge mit Fotos */
  fotos?: (data: unknown) => string[]
}

export interface ProjectFileControls {
  binding: ProjectBinding | null
  dirty: boolean
  busy: boolean
  newFile: () => Promise<void>
  open: (path?: string) => Promise<void>
  save: () => Promise<boolean>
  saveAs: () => Promise<boolean>
}

const samePath = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** Gepufferte Felder (useDraft) übernehmen ihren Text erst beim Verlassen – vor dem Speichern. */
async function commitPendingInput(): Promise<void> {
  const el = document.activeElement
  if (el instanceof HTMLElement && el !== document.body) el.blur()
  await new Promise((r) => setTimeout(r, 0))
}

/** Stand zu Beginn einer Aktion: was geschrieben wird und woran es gebunden war. */
interface Snapshot {
  data: unknown
  digest: string
  path: string | null
}

function listSections(sections: ProjectSectionInfo[]): string {
  return sections.map((x) => `${x.label} (Stand ${x.rev})`).join(', ')
}

export function useProjectFile<S>(opts: ProjectFileOptions<S>): ProjectFileControls {
  // Optionen ändern sich mit jedem Render (Funktionen) – über ein Ref immer die aktuellen nutzen
  const o = useRef(opts)
  o.current = opts
  const read = (): { b: ProjectBinding | null; dirty: boolean } => {
    const s = o.current.store.getState()
    const b = o.current.binding(s)
    return { b, dirty: b ? digest(o.current.data(s)) !== b.savedDigest : false }
  }
  const [state, setState] = useState(read)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    const update = (): void => {
      const next = read()
      setState((prev) => (prev.b === next.b && prev.dirty === next.dirty ? prev : next))
    }
    update()
    return o.current.store.subscribe(update)
  }, [])

  // Fenstertitel: „● Name“ solange ungespeichert
  useEffect(() => {
    setTitleDetail(state.b ? `${state.dirty ? '● ' : ''}${state.b.name}` : null)
  }, [state])
  useEffect(() => () => setTitleDetail(null), [])

  const notify = (message: string, detail?: string): Promise<void> =>
    api.notify({ message, detail, kind: 'warning' })

  /** Nach dem Speichern binden – außer ein anderes Fenster hat inzwischen anders gebunden. */
  function bindAfterSave(
    res: Extract<ProjectSaveResult, { ok: true }>,
    savedDigest: string,
    boundBefore: string | null
  ): void {
    const now = o.current.binding(o.current.store.getState())?.path ?? null
    if (now !== boundBefore && !(now && samePath(now, res.path))) return
    o.current.setBinding({
      path: res.path,
      name: res.name,
      baseSha: res.sha256,
      rev: res.rev,
      savedDigest
    })
  }

  function snapshot(): Snapshot {
    const s = o.current.store.getState()
    const data = o.current.data(s)
    return { data, digest: digest(data), path: o.current.binding(s)?.path ?? null }
  }

  /** Nach einer Rückfrage: Hat ein anderes Fenster inzwischen geändert oder neu gebunden? */
  async function changedMeanwhile(snap: Snapshot): Promise<boolean> {
    const s = o.current.store.getState()
    const path = o.current.binding(s)?.path ?? null
    if (path === snap.path && digest(o.current.data(s)) === snap.digest) return false
    await notify(
      `Die ${o.current.label} wurde inzwischen in einem anderen Fenster geändert oder dort eine andere Datei geöffnet.`,
      'Es wurde nichts gespeichert oder ersetzt – bitte noch einmal versuchen.'
    )
    return true
  }

  /**
   * Abschnitt schreiben. `data` ist der festgehaltene Stand (Vorgabe: der aus `snap`);
   * `afterWrite` läuft nur nach Erfolg, vor dem Binden („Leere anlegen“: erst jetzt zurücksetzen).
   */
  async function writeTo(
    path: string,
    baseSha: string | null,
    force: boolean,
    snap: Snapshot,
    data: unknown = snap.data,
    afterWrite?: () => void
  ): Promise<boolean> {
    const res = await api.projects.save({
      path,
      section: o.current.section,
      version: o.current.version,
      data,
      baseSha,
      force,
      fotos: o.current.fotos?.(data)
    })
    if (res.ok) {
      afterWrite?.()
      bindAfterSave(res, digest(data), snap.path)
      return true
    }
    if (res.reason === 'konflikt') {
      // Ziel nennen, nicht die Bindung: „Speichern unter“ und „hinzufügen“ schreiben woandershin
      const choice = await api.choose({
        message: `Die ${o.current.label} in „${projectDisplayName(path)}“ wurde inzwischen anderswo geändert (Stand ${res.rev}).`,
        detail:
          'Überschreiben ersetzt die Fassung in der Datei durch diese hier – vorher legt Mottulbox eine Sicherung der Datei an. Mit „Speichern unter …“ bleiben beide erhalten.',
        buttons: ['Überschreiben', 'Speichern unter …', 'Abbrechen'],
        cancelId: 2,
        defaultId: 1,
        danger: true
      })
      if (choice === 0) {
        if (await changedMeanwhile(snap)) return false
        return writeTo(path, res.sha256 || null, true, snap, data, afterWrite)
      }
      // festgehaltenen Stand mitgeben – bei „Leere anlegen“ also die leere Planung samt Zurücksetzen
      if (choice === 1) return doSaveAs({ snap, data, afterWrite })
      return false
    }
    if (res.reason === 'fehlt' || res.reason === 'nicht-freigegeben') {
      const choice = await api.choose({
        message: PROBLEM_TEXT[res.reason],
        detail: path,
        buttons: ['Speichern unter …', 'Abbrechen'],
        cancelId: 1
      })
      return choice === 0 ? doSaveAs({ snap, data, afterWrite }) : false
    }
    await notify(PROBLEM_TEXT[res.reason], path)
    return false
  }

  async function doSave(): Promise<boolean> {
    await commitPendingInput()
    const b = o.current.binding(o.current.store.getState())
    if (!b) return doSaveAs()
    return writeTo(b.path, b.baseSha, false, snapshot())
  }

  /** `carry`: Stand einer laufenden Aktion (Ausweg aus einem Konflikt), statt ihn neu zu nehmen. */
  async function doSaveAs(carry?: {
    snap: Snapshot
    data: unknown
    afterWrite?: () => void
  }): Promise<boolean> {
    await commitPendingInput()
    const s = o.current.store.getState()
    const b = o.current.binding(s)
    const snap = carry?.snap ?? snapshot()
    const t = await api.projects.chooseTarget(
      o.current.section,
      b?.name ?? o.current.suggestedName(s),
      !b
    )
    if (!t) return false
    if (!t.ok) {
      await notify(PROBLEM_TEXT[t.reason], t.path)
      return false
    }
    let baseSha: string | null = null
    let force = false
    if (t.section) {
      const ok = await api.confirm({
        message: `„${t.name}“ enthält schon eine ${o.current.label}.`,
        detail: `${o.current.describe(t.section.data)} · Stand ${t.section.rev}. Ersetzen? Die anderen Teile der Datei bleiben unverändert.`,
        confirmLabel: 'Ersetzen',
        danger: true
      })
      if (!ok) return false
      baseSha = t.section.sha256
      force = true
    } else if (t.exists && t.sections.length) {
      const ok = await api.confirm({
        message: `„${t.name}“ enthält schon: ${listSections(t.sections)}.`,
        detail: `Die ${o.current.label} wird hinzugefügt, die anderen Teile bleiben unverändert.`,
        confirmLabel: 'Hinzufügen'
      })
      if (!ok) return false
    }
    if (await changedMeanwhile(snap)) return false
    return writeTo(t.path, baseSha, force, snap, carry ? carry.data : snap.data, carry?.afterWrite)
  }

  /** Vor dem Ersetzen des Arbeitsstands: ungespeicherte Änderungen sichern oder verwerfen? */
  async function guardUnsaved(): Promise<boolean> {
    const s = o.current.store.getState()
    const b = o.current.binding(s)
    const unsaved = b ? digest(o.current.data(s)) !== b.savedDigest : !o.current.isEmpty(s)
    if (!unsaved) return true
    const snap = snapshot()
    const choice = await api.choose({
      message: b
        ? `Änderungen an „${b.name}“ speichern?`
        : `Die aktuelle ${o.current.label} ist in keiner Datei gespeichert.`,
      detail: b ? undefined : o.current.describe(snap.data),
      buttons: [b ? 'Speichern' : 'Speichern unter …', 'Verwerfen', 'Abbrechen'],
      cancelId: 2
    })
    if (choice !== 0 && choice !== 1) return false
    // auch hier: „Verwerfen“ darf nicht wegwerfen, was ein anderes Fenster inzwischen geöffnet hat
    if (await changedMeanwhile(snap)) return false
    if (choice === 0) return b ? doSave() : doSaveAs()
    return true
  }

  async function doOpen(path?: string): Promise<void> {
    // Strg+O aus einem gepufferten Feld: Entwurf erst übernehmen (zählt dann als ungespeichert),
    // sonst landete er nach dem Öffnen in der neuen Planung
    await commitPendingInput()
    if (!(await guardUnsaved())) return
    const snap = snapshot()
    const r = await api.projects.open(o.current.section, path)
    if (!r) return
    if (!r.ok) {
      await notify(PROBLEM_TEXT[r.reason], r.path)
      return
    }
    if (!r.section) {
      const choice = await api.choose({
        message: `„${r.name}“ enthält noch keine ${o.current.label}.`,
        detail: [
          r.sections.length ? `In der Datei: ${listSections(r.sections)}.` : '',
          `Aktuell im Werkzeug: ${o.current.describe(snap.data)}.`
        ]
          .filter(Boolean)
          .join('\n'),
        buttons: ['Aktuelle hinzufügen', 'Leere anlegen', 'Abbrechen'],
        cancelId: 2
      })
      if (choice !== 0 && choice !== 1) return
      if (await changedMeanwhile(snap)) return
      if (choice === 0) await writeTo(r.path, null, false, snap)
      // erst nach erfolgreichem Schreiben leeren – sonst hinge eine leere Planung an der alten Datei
      else await writeTo(r.path, null, false, snap, o.current.blank(), () => o.current.reset())
      return
    }
    if (r.section.version > o.current.version) {
      await notify(PROBLEM_TEXT.neuer, r.path)
      return
    }
    if (await changedMeanwhile(snap)) return
    if (!o.current.apply(r.section.data, r.section.version)) {
      await notify(
        `Die ${o.current.label} in der Datei lässt sich nicht übernehmen (beschädigt oder unmöglich groß).`,
        r.path
      )
      return
    }
    o.current.setBinding({
      path: r.path,
      name: r.name,
      baseSha: r.section.sha256,
      rev: r.section.rev,
      savedDigest: digest(o.current.data(o.current.store.getState()))
    })
  }

  async function doNew(): Promise<void> {
    await commitPendingInput()
    if (!(await guardUnsaved())) return
    o.current.reset()
    o.current.setBinding(null)
  }

  /** Eine Aktion zur Zeit (Doppelklick, Tastenkürzel während eines Dialogs). */
  async function exclusive<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    if (busyRef.current) return fallback
    busyRef.current = true
    setBusy(true)
    try {
      return await fn()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const controls: ProjectFileControls = {
    binding: state.b,
    dirty: state.dirty,
    busy,
    newFile: () => exclusive(doNew, undefined),
    open: (path) => exclusive(() => doOpen(path), undefined),
    save: () => exclusive(doSave, false),
    saveAs: () => exclusive(() => doSaveAs(), false)
  }

  // Strg+S, Strg+Umschalt+S, Strg+O (Cmd am Mac)
  const keys = useRef(controls)
  keys.current = controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        void (e.shiftKey ? keys.current.saveAs() : keys.current.save())
      } else if (k === 'o' && !e.shiftKey) {
        e.preventDefault()
        void keys.current.open()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return controls
}
