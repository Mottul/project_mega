// Geräte, Zugangsdaten und Kontakte – Listen mit einer Zeile je Eintrag.
// Kontakte sind Kopien aus dem Firmenprofil (App-Menü): Die Datei bleibt beim Kollegen
// vollständig, und eine Kunden-Anleitung ändert sich nicht, wenn jemand das Profil bearbeitet.

import { Cpu, Eye, EyeOff, Plus, RefreshCw, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { LiveInput } from '@renderer/components/ui/textarea'
import { useSettings } from '@renderer/lib/settings'
import { entferne, ersetze, verschiebe } from '../aktionen'
import { leeresGeraet, ROLLEN, uid, type Geraet, type GeraetRolle, type Zugang } from '../model'
import { kurzname } from '../sanitize'
import { prozessorVorschlaege } from '../signalwege'
import { useMiniManual } from '../store'
import { AusgaengeEditor, BespieltFeld } from './SignalwegEditor'
import { FotoFeld, StufeSelect, ZeilenKnoepfe } from './teile'

export function GeraeteEditor(): JSX.Element {
  const geraete = useMiniManual((s) => s.anleitung.geraete)
  const anleitung = useMiniManual((s) => s.anleitung)
  const vorschlaege = useMemo(() => prozessorVorschlaege(anleitung), [anleitung])
  const update = useMiniManual((s) => s.update)
  const set = (fn: (g: Geraet[]) => Geraet[]): void =>
    update((a) => ({ ...a, geraete: fn(a.geraete) }))
  const feld = (g: Geraet, key: keyof Geraet, label: string, placeholder = ''): JSX.Element => (
    <LiveInput
      value={String(g[key] ?? '')}
      aria-label={label}
      placeholder={placeholder || label}
      onCommit={(v) =>
        set((l) => ersetze(l, g.id, (x) => ({ ...x, [key]: key === 'kurzname' ? kurzname(v) : v })))
      }
    />
  )
  return (
    <div className="space-y-2">
      {geraete.map((g, i) => (
        <div
          key={g.id}
          className="space-y-2 rounded-lg border border-border bg-background/40 p-3"
          data-testid="geraet"
        >
          <div className="flex items-center gap-2">
            <Select
              size="xs"
              aria-label="Rolle"
              value={g.rolle}
              onChange={(e) =>
                set((l) =>
                  ersetze(l, g.id, (x) => ({ ...x, rolle: e.target.value as GeraetRolle }))
                )
              }
            >
              {ROLLEN.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <div className="w-36 shrink-0">
              {feld(g, 'kurzname', 'Kurzname', 'Kurzname, z. B. pc')}
            </div>
            {feld(g, 'name', 'Name', 'Name, z. B. Laptop Bühne')}
            <FotoFeld
              klein
              hash={g.foto}
              onChange={(foto) => set((l) => ersetze(l, g.id, (x) => ({ ...x, foto })))}
            />
            <ZeilenKnoepfe
              was="Gerät"
              onUp={i > 0 ? () => set((l) => verschiebe(l, g.id, -1)) : undefined}
              onDown={i < geraete.length - 1 ? () => set((l) => verschiebe(l, g.id, 1)) : undefined}
              onDelete={() => set((l) => entferne(l, g.id))}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            {feld(g, 'modell', 'Modell')}
            {feld(g, 'standort', 'Standort', 'Standort, z. B. Rack links')}
            {feld(g, 'ip', 'IP', 'IP (nur Stufe Technik)')}
            {feld(g, 'notiz', 'Hinweis')}
          </div>
          {g.rolle === 'prozessor' && <BespieltFeld g={g} />}
          {g.rolle === 'zuspieler' && <AusgaengeEditor g={g} />}
          {g.kurzname && (
            <p className="text-xs text-muted-foreground">
              Platzhalter: {`{${g.kurzname}.name}`}, {`{${g.kurzname}.standort}`},{' '}
              {`{${g.kurzname}.ip}`}
            </p>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => set((l) => [...l, leeresGeraet()])}>
          <Plus className="size-4" /> Gerät
        </Button>
        {vorschlaege.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            title={vorschlaege.map((g) => g.name).join(', ')}
            onClick={() =>
              // frisch berechnet: zwischen Anzeige und Klick kann sich die Liste geändert haben
              update((a) => ({ ...a, geraete: [...a.geraete, ...prozessorVorschlaege(a)] }))
            }
          >
            <Cpu className="size-4" />
            {vorschlaege.length === 1
              ? 'Prozessor aus der LED-Wall-Planung übernehmen'
              : `${vorschlaege.length} Prozessoren aus der LED-Wall-Planung übernehmen`}
          </Button>
        )}
      </div>
    </div>
  )
}

export function ZugangEditor(): JSX.Element {
  const zugaenge = useMiniManual((s) => s.anleitung.zugaenge)
  const update = useMiniManual((s) => s.update)
  const [zeigen, setZeigen] = useState(false)
  const set = (fn: (z: Zugang[]) => Zugang[]): void =>
    update((a) => ({ ...a, zugaenge: fn(a.zugaenge) }))
  const patch = (z: Zugang, p: Partial<Zugang>): void =>
    set((l) => ersetze(l, z.id, (x) => ({ ...x, ...p })))
  return (
    <div className="space-y-2">
      <Alert tone="warning">
        Zugangsdaten stehen im Klartext in der Projektdatei. Wie sie ins PDF kommen, stellst du in
        der Schublade unter „Ausgabe“ ein (ab Werk: „wird separat übergeben“).
      </Alert>
      {zugaenge.map((z, i) => (
        <div
          key={z.id}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/40 p-2"
          data-testid="zugang"
        >
          <div className="w-40">
            <LiveInput
              value={z.wofuer}
              aria-label="Wofür"
              placeholder="Wofür (Laptop, WLAN …)"
              onCommit={(wofuer) => patch(z, { wofuer })}
            />
          </div>
          <div className="w-36">
            <LiveInput
              value={z.benutzer}
              aria-label="Benutzer"
              placeholder="Benutzer"
              onCommit={(benutzer) => patch(z, { benutzer })}
            />
          </div>
          <div className="w-36">
            {zeigen ? (
              <LiveInput
                value={z.passwort}
                aria-label="Passwort"
                placeholder="Passwort"
                onCommit={(passwort) => patch(z, { passwort })}
              />
            ) : (
              <span className="block truncate px-2 text-sm text-muted-foreground">
                {z.passwort ? '••••••••' : '(kein Passwort)'}
              </span>
            )}
          </div>
          <div className="min-w-[140px] flex-1">
            <LiveInput
              value={z.notiz}
              aria-label="Hinweis"
              placeholder="Hinweis"
              onCommit={(notiz) => patch(z, { notiz })}
            />
          </div>
          <StufeSelect value={z.stufe} onChange={(stufe) => patch(z, { stufe })} />
          <ZeilenKnoepfe
            was="Zugang"
            onUp={i > 0 ? () => set((l) => verschiebe(l, z.id, -1)) : undefined}
            onDown={i < zugaenge.length - 1 ? () => set((l) => verschiebe(l, z.id, 1)) : undefined}
            onDelete={() => set((l) => entferne(l, z.id))}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            set((l) => [
              ...l,
              { id: uid(), wofuer: '', benutzer: '', passwort: '', notiz: '', stufe: 2 }
            ])
          }
        >
          <Plus className="size-4" /> Zugang
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={zeigen}
          onClick={() => setZeigen((v) => !v)}
        >
          {zeigen ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {zeigen ? 'Passwörter verbergen' : 'Passwörter zeigen'}
        </Button>
      </div>
    </div>
  )
}

export function KontaktEditor(): JSX.Element {
  const kontakte = useMiniManual((s) => s.anleitung.kontakte)
  const update = useMiniManual((s) => s.update)
  const profil = useSettings((s) => s.firmenprofil)?.kontakte ?? []
  const frei = profil.filter((p) => !kontakte.some((k) => k.id === p.id))
  const [wahl, setWahl] = useState('')
  const veraltet = kontakte.filter((k) => {
    const p = profil.find((x) => x.id === k.id)
    return p && JSON.stringify(p) !== JSON.stringify(k)
  })

  return (
    <div className="space-y-3">
      {!profil.length && (
        <Alert tone="warning">
          Im Firmenprofil stehen noch keine Kontakte – anlegen im App-Menü (Mottulbox ▾ →
          Firmenprofil).
        </Alert>
      )}
      <ul className="space-y-1">
        {kontakte.map((k, i) => (
          <li
            key={k.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2"
            data-testid="kontakt"
          >
            <span className="min-w-0 flex-1 truncate text-sm">
              <b>{k.name || 'ohne Namen'}</b>
              {k.funktion && ` · ${k.funktion}`}
              {k.mobil && ` · ${k.mobil}`}
              {i === 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  · erster Kontakt (Kurzkarte, Platzhalter)
                </span>
              )}
            </span>
            <ZeilenKnoepfe
              was="Kontakt"
              onUp={
                i > 0
                  ? () => update((a) => ({ ...a, kontakte: verschiebe(a.kontakte, k.id, -1) }))
                  : undefined
              }
              onDown={
                i < kontakte.length - 1
                  ? () => update((a) => ({ ...a, kontakte: verschiebe(a.kontakte, k.id, 1) }))
                  : undefined
              }
              onDelete={() => update((a) => ({ ...a, kontakte: entferne(a.kontakte, k.id) }))}
            />
          </li>
        ))}
      </ul>
      {frei.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            size="sm"
            aria-label="Kontakt aus dem Firmenprofil"
            value={wahl}
            onChange={(e) => setWahl(e.target.value)}
          >
            <option value="">Kontakt aus dem Firmenprofil …</option>
            {frei.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.funktion ? ` (${p.funktion})` : ''}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={!wahl}
            onClick={() => {
              const p = profil.find((x) => x.id === wahl)
              if (p) update((a) => ({ ...a, kontakte: [...a.kontakte, structuredClone(p)] }))
              setWahl('')
            }}
          >
            <UserPlus className="size-4" /> Hinzufügen
          </Button>
        </div>
      )}
      {veraltet.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            update((a) => ({
              ...a,
              kontakte: a.kontakte.map((k) =>
                structuredClone(profil.find((p) => p.id === k.id) ?? k)
              )
            }))
          }
        >
          <RefreshCw className="size-4" /> {veraltet.length} Kontakt(e) aus dem Firmenprofil
          aktualisieren
        </Button>
      )}
    </div>
  )
}
