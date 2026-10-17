// Firmenprofil (App-Menü): Firmenname, Logo, Akzentfarbe, Kontakte, Fernwartung – für die
// Anleitungen des Mini-Manuals (später auch LED-Wall-Doku und Packliste). Logo und Kontakte
// liegen nur auf diesem Rechner (settings.json, Logo im Foto-Speicher), nie im Repo.
// Die Farbe ist nur Akzent (Trennlinien, Überschriften), nie das Papier (Festlegung 23).

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { fotoUrl } from '@shared/fotos'
import { DEFAULT_AKZENT, type FirmenKontakt, type FirmenProfil } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { updateSettings } from '@renderer/lib/settings'
import { toast } from '@renderer/lib/toast'

const HEX = /^#[0-9a-f]{6}$/i

function neuerKontakt(): FirmenKontakt {
  return {
    id: `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    funktion: '',
    mobil: '',
    buero: '',
    mail: '',
    erreichbarkeit: '',
    whatsapp: false
  }
}

export function FirmenprofilDialog({
  profil,
  onClose
}: {
  profil: FirmenProfil
  onClose: () => void
}): JSX.Element {
  const [d, setD] = useState<FirmenProfil>(() => structuredClone(profil))
  const set = (p: Partial<FirmenProfil>): void => setD((x) => ({ ...x, ...p }))
  const setK = (id: string, p: Partial<FirmenKontakt>): void =>
    setD((x) => ({ ...x, kontakte: x.kontakte.map((k) => (k.id === id ? { ...k, ...p } : k)) }))

  async function logoWaehlen(): Promise<void> {
    const res = await api.fotos.pick()
    const ok = res?.find((r) => r.ok)
    if (ok && ok.ok) set({ logo: ok.hash })
    else if (res?.length)
      toast.warning('Das Logo ließ sich nicht einlesen', 'Bitte PNG oder JPG verwenden.')
  }

  function speichern(): void {
    // nur geänderte Felder (Listen werden ersetzt) – nie den ganzen alten Stand zurückschreiben
    const patch: Partial<FirmenProfil> = {}
    if (d.name !== profil.name) patch.name = d.name.trim()
    if (d.logo !== profil.logo) patch.logo = d.logo
    if (d.akzent !== profil.akzent) patch.akzent = HEX.test(d.akzent) ? d.akzent : DEFAULT_AKZENT
    if (d.fernwartung !== profil.fernwartung) patch.fernwartung = d.fernwartung
    if (JSON.stringify(d.kontakte) !== JSON.stringify(profil.kontakte)) patch.kontakte = d.kontakte
    if (Object.keys(patch).length) updateSettings({ firmenprofil: patch })
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onClose}
    >
      <Card
        role="dialog"
        aria-label="Firmenprofil"
        className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-semibold">Firmenprofil</h2>
          <p className="text-xs text-muted-foreground">
            Steht in den Anleitungen (Kopf, Kontakt, Fernwartung). Bleibt auf diesem Rechner.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Firmenname">
            <Input value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field
            label="Akzentfarbe"
            hint="Für Trennlinien und Überschriften im PDF – nie als Papierfarbe."
          >
            <span className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Akzentfarbe wählen"
                value={HEX.test(d.akzent) ? d.akzent : DEFAULT_AKZENT}
                onChange={(e) => set({ akzent: e.target.value })}
                className="h-9 w-12 shrink-0 cursor-pointer rounded border border-border bg-transparent"
              />
              <Input
                value={d.akzent}
                aria-label="Akzentfarbe als Hex"
                onChange={(e) => set({ akzent: e.target.value.trim() })}
                className={HEX.test(d.akzent) ? '' : 'border-danger'}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Standardfarbe"
                title="Standard (Gelb)"
                onClick={() => set({ akzent: DEFAULT_AKZENT })}
              >
                <RotateCcw className="size-4" />
              </Button>
            </span>
          </Field>
        </div>
        <Field label="Logo" hint="PNG oder JPG, am besten mit transparentem Hintergrund.">
          <span className="flex items-center gap-3">
            {d.logo ? (
              <img
                src={fotoUrl(d.logo)}
                alt="Logo"
                className="h-12 max-w-[200px] rounded border border-border bg-white object-contain p-1"
              />
            ) : (
              <span className="text-sm text-muted-foreground">kein Logo</span>
            )}
            <Button size="sm" variant="outline" onClick={() => void logoWaehlen()}>
              <ImagePlus className="size-4" /> Logo wählen …
            </Button>
            {d.logo && (
              <Button size="sm" variant="ghost" onClick={() => set({ logo: null })}>
                Entfernen
              </Button>
            )}
          </span>
        </Field>
        <Field label="Fernwartung" hint="z. B. „AnyDesk ist installiert, ID steht auf dem Laptop“.">
          <textarea
            rows={2}
            value={d.fernwartung}
            onChange={(e) => set({ fernwartung: e.target.value })}
            className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm"
          />
        </Field>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Kontakte</h3>
          {d.kontakte.map((k) => (
            <div
              key={k.id}
              className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 md:grid-cols-3"
              data-testid="profil-kontakt"
            >
              <Input
                aria-label="Name"
                placeholder="Name"
                value={k.name}
                onChange={(e) => setK(k.id, { name: e.target.value })}
              />
              <Input
                aria-label="Funktion"
                placeholder="Funktion"
                value={k.funktion}
                onChange={(e) => setK(k.id, { funktion: e.target.value })}
              />
              <Input
                aria-label="Mobil"
                placeholder="Mobil"
                value={k.mobil}
                onChange={(e) => setK(k.id, { mobil: e.target.value })}
              />
              <Input
                aria-label="Büro"
                placeholder="Büro"
                value={k.buero}
                onChange={(e) => setK(k.id, { buero: e.target.value })}
              />
              <Input
                aria-label="Mail"
                placeholder="Mail"
                value={k.mail}
                onChange={(e) => setK(k.id, { mail: e.target.value })}
              />
              <Input
                aria-label="Erreichbarkeit"
                placeholder="Erreichbarkeit"
                value={k.erreichbarkeit}
                onChange={(e) => setK(k.id, { erreichbarkeit: e.target.value })}
              />
              <div className="flex items-center justify-between md:col-span-3">
                <Checkbox
                  checked={k.whatsapp}
                  onChange={(whatsapp) => setK(k.id, { whatsapp })}
                  label="auch per WhatsApp"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-danger"
                  onClick={() =>
                    setD((x) => ({ ...x, kontakte: x.kontakte.filter((y) => y.id !== k.id) }))
                  }
                >
                  <Trash2 className="size-4" /> Entfernen
                </Button>
              </div>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setD((x) => ({ ...x, kontakte: [...x.kontakte, neuerKontakt()] }))}
          >
            <Plus className="size-4" /> Kontakt
          </Button>
        </section>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={speichern}>Speichern</Button>
        </div>
      </Card>
    </div>,
    document.body
  )
}
