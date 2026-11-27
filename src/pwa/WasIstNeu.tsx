// Version und „Was ist neu“ in der Rechner-PWA: ganz unten auf der Startseite eine kleine Zeile
// mit der laufenden Version – nach „Neu laden“ sieht man dort, dass die neue läuft –, ein Tipp
// darauf öffnet die Liste aus neuigkeiten.ts. Ein Punkt an „Was ist neu?“ zeigt, dass seit dem
// letzten Blick etwas dazugekommen ist.
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePersistentState } from '@renderer/lib/usePersistentState'
import { readVersion, VERSION_SHORT } from './build/version'
import {
  GESEHEN_KEY,
  gesehenCodec,
  hatNeues,
  NEUIGKEITEN,
  neuesterTag,
  tagKurz,
  tagLang
} from './neuigkeiten'

/** Laufende Version, gekürzt; im Dev-Server gibt es keine (sie entsteht erst beim Build) */
function versionText(): string {
  const v = readVersion(document)
  return v ? v.slice(0, VERSION_SHORT) : 'Entwicklung'
}

/** Zeile ganz unten auf der Startseite: Version und Stand, öffnet „Was ist neu“ */
export function VersionLine(): JSX.Element {
  const [gesehen, setGesehen] = usePersistentState(GESEHEN_KEY, '', gesehenCodec)
  // Beim allerersten Start ist alles neu – der Punkt kommt erst mit späteren Einträgen
  useEffect(() => {
    if (gesehen === '') setGesehen(neuesterTag())
  }, [gesehen, setGesehen])
  const neu = hatNeues(gesehen)
  return (
    <Link
      to="/neu"
      className="mx-auto flex w-fit flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-md px-3 py-3 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:bg-muted/40"
    >
      <span>
        Version {versionText()} · Stand {tagKurz(neuesterTag())}
      </span>
      <span className="flex items-center gap-1.5 font-medium text-primary">
        {neu && <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />}
        Was ist neu?
        {neu && <span className="sr-only">(Neues seit deinem letzten Blick)</span>}
      </span>
    </Link>
  )
}

/** Inhalt der Seite „Was ist neu“ – wer sie öffnet, hat alles gesehen */
export function WasIstNeu(): JSX.Element {
  const [, setGesehen] = usePersistentState(GESEHEN_KEY, '', gesehenCodec)
  useEffect(() => {
    setGesehen(neuesterTag())
  }, [setGesehen])
  return (
    <div className="pwa-safe-x mx-auto max-w-2xl space-y-5 py-4">
      <p className="text-sm text-muted-foreground">
        Du nutzt Version <span className="font-mono text-foreground">{versionText()}</span>. Neue
        Versionen holt die App von selbst: Steht oben „Neue Version bereit“, lädt „Neu laden“ sie
        sofort, sonst kommt sie beim nächsten Start.
      </p>
      {NEUIGKEITEN.map((n) => (
        <section key={n.datum} className="space-y-1.5">
          <h2 className="text-sm font-semibold">{tagLang(n.datum)}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-primary">
            {n.punkte.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
