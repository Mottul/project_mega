// Querverweise in der Geräteliste: welche Wände ein Prozessor bespielt und – je Ausgang eines
// Zuspielers – über welchen Verteiler welcher Prozessor das Signal bekommt, bei einem Gesamtbild
// mit dem Ausschnitt je Wand. Eindeutige Fälle (eine Wand, ein Prozessor) brauchen keine Angabe.

import { Plus } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Select } from '@renderer/components/ui/select'
import { LiveInput } from '@renderer/components/ui/textarea'
import { entferne, ersetze } from '../aktionen'
import { leererAusgang, type Ausgang, type Ausschnitt, type Geraet } from '../model'
import { erreichteWaende } from '../signalwege'
import { useMiniManual } from '../store'
import { ZeilenKnoepfe } from './teile'

const PX_MAX = 100_000
const px = (v: string): number => {
  const n = parseInt(v.replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? Math.min(PX_MAX, n) : 0
}

function usePatch(g: Geraet): (fn: (x: Geraet) => Geraet) => void {
  const update = useMiniManual((s) => s.update)
  return (fn) => update((a) => ({ ...a, geraete: ersetze(a.geraete, g.id, fn) }))
}

/** Prozessor: bespielte Wände */
export function BespieltFeld({ g }: { g: Geraet }): JSX.Element {
  const waende = useMiniManual((s) => s.anleitung.ledWall?.waende ?? [])
  const patch = usePatch(g)
  if (!waende.length)
    return (
      <p className="text-xs text-muted-foreground">
        Welche Wand er bespielt, lässt sich wählen, sobald die LED-Wall-Planung übernommen ist
        (Kapitel LED-Wall).
      </p>
    )
  if (waende.length === 1)
    return (
      <p className="text-xs text-muted-foreground">
        Bespielt „{waende[0].name}“ (die einzige Wand).
      </p>
    )
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1" role="group" aria-label="Bespielt">
      <span className="text-xs font-medium text-muted-foreground">Bespielt:</span>
      {waende.map((w) => (
        <Checkbox
          key={w.id}
          label={w.name}
          checked={g.waende.includes(w.id)}
          onChange={(on) =>
            patch((x) => ({
              ...x,
              waende: on ? [...x.waende, w.id] : x.waende.filter((id) => id !== w.id)
            }))
          }
        />
      ))}
    </div>
  )
}

/** Zuspieler: Ausgänge mit Signalweg */
export function AusgaengeEditor({ g }: { g: Geraet }): JSX.Element {
  const a = useMiniManual((s) => s.anleitung)
  const patch = usePatch(g)
  const prozessoren = a.geraete.filter((x) => x.rolle === 'prozessor')
  const verteiler = a.geraete.filter((x) => x.rolle === 'verteiler')
  const patchO = (id: string, fn: (o: Ausgang) => Ausgang): void =>
    patch((x) => ({ ...x, ausgaenge: ersetze(x.ausgaenge, id, fn) }))
  const nameVon = (p: Geraet, i: number): string => p.name.trim() || `Prozessor ${i + 1}`

  return (
    <div className="space-y-2" role="group" aria-label="Ausgänge">
      {g.ausgaenge.map((o) => {
        const waende = erreichteWaende(o, a)
        const setAus = (wand: string, key: keyof Omit<Ausschnitt, 'wand'>, v: string): void =>
          patchO(o.id, (y) => {
            const alt = y.ausschnitte.find((s) => s.wand === wand) ?? {
              wand,
              x: 0,
              y: 0,
              b: 0,
              h: 0
            }
            const neu = { ...alt, [key]: px(v) }
            return {
              ...y,
              ausschnitte: [...y.ausschnitte.filter((s) => s.wand !== wand), neu]
            }
          })
        return (
          <div
            key={o.id}
            className="space-y-2 rounded-md border border-border/70 bg-card/40 p-2"
            data-testid="ausgang"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-32">
                <LiveInput
                  value={o.name}
                  aria-label="Ausgang"
                  placeholder="Ausgang, z. B. HDMI 1"
                  maxLength={60}
                  onCommit={(name) => patchO(o.id, (y) => ({ ...y, name }))}
                />
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <div className="w-20">
                  <LiveInput
                    value={o.breite ? String(o.breite) : ''}
                    aria-label="Bild Breite (px)"
                    placeholder="Breite"
                    onCommit={(v) => patchO(o.id, (y) => ({ ...y, breite: px(v) }))}
                  />
                </div>
                ×
                <div className="w-20">
                  <LiveInput
                    value={o.hoehe ? String(o.hoehe) : ''}
                    aria-label="Bild Höhe (px)"
                    placeholder="Höhe"
                    onCommit={(v) => patchO(o.id, (y) => ({ ...y, hoehe: px(v) }))}
                  />
                </div>
                px
              </div>
              {verteiler.length > 0 && (
                <Select
                  size="xs"
                  aria-label="Über Verteiler"
                  value={o.ueber ?? ''}
                  onChange={(e) => patchO(o.id, (y) => ({ ...y, ueber: e.target.value || null }))}
                >
                  <option value="">direkt</option>
                  {verteiler.map((v, i) => (
                    <option key={v.id} value={v.id}>
                      über {v.name.trim() || `Verteiler ${i + 1}`}
                    </option>
                  ))}
                </Select>
              )}
              <div className="ml-auto">
                <ZeilenKnoepfe
                  was="Ausgang"
                  onDelete={() => patch((x) => ({ ...x, ausgaenge: entferne(x.ausgaenge, o.id) }))}
                />
              </div>
            </div>
            {prozessoren.length > 1 ? (
              <div
                className="flex flex-wrap items-center gap-x-4 gap-y-1"
                role="group"
                aria-label="An Prozessor"
              >
                <span className="text-xs font-medium text-muted-foreground">an:</span>
                {prozessoren.map((p, i) => (
                  <Checkbox
                    key={p.id}
                    label={nameVon(p, i)}
                    checked={o.an.includes(p.id)}
                    onChange={(on) =>
                      patchO(o.id, (y) => ({
                        ...y,
                        an: on ? [...y.an, p.id] : y.an.filter((id) => id !== p.id)
                      }))
                    }
                  />
                ))}
              </div>
            ) : (
              prozessoren.length === 1 && (
                <p className="text-xs text-muted-foreground">
                  Geht an „{nameVon(prozessoren[0], 0)}“ (der einzige Prozessor).
                </p>
              )
            )}
            {waende.length > 1 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Ausschnitt je Wand, wenn der Ausgang ein Gesamtbild für mehrere Wände liefert
                  (leer = das ganze Bild, z. B. hinter einem Splitter):
                </p>
                {waende.map((w) => {
                  const s = o.ausschnitte.find((x) => x.wand === w.id)
                  // Lage auch als 0 zeigen, Größe 0 = nicht angegeben (leer)
                  const wert = (key: keyof Omit<Ausschnitt, 'wand'>): string =>
                    !s ? '' : key === 'x' || key === 'y' || s[key] ? String(s[key]) : ''
                  const feld = (
                    key: keyof Omit<Ausschnitt, 'wand'>,
                    label: string
                  ): JSX.Element => (
                    <div className="w-16">
                      <LiveInput
                        value={wert(key)}
                        aria-label={`Ausschnitt ${w.name} ${label}`}
                        placeholder={label}
                        onCommit={(v) => setAus(w.id, key, v)}
                      />
                    </div>
                  )
                  return (
                    <div key={w.id} className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="w-32 truncate font-medium">{w.name}</span>
                      ab {feld('x', 'x')} , {feld('y', 'y')} · {feld('b', 'Breite')} ×{' '}
                      {feld('h', 'Höhe')} px
                      <span className="text-muted-foreground">
                        (Wand {w.kennzahlen.aufloesungX} × {w.kennzahlen.aufloesungY})
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          patch((x) => ({
            ...x,
            ausgaenge: [...x.ausgaenge, leererAusgang(x.ausgaenge.length ? '' : 'HDMI 1')]
          }))
        }
      >
        <Plus className="size-4" /> Ausgang
      </Button>
    </div>
  )
}
