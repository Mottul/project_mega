// Mini-Manual im Werkzeug-Muster (ToolShell, docs/PLAN-MINI-MANUAL.md, Skizze „Arbeitsplatz“):
//   Leiste „Anleitung“  Datei-Menü (Projektdatei, Abschnitt „anleitung“), Stufe der Ausgabe,
//                       Kurzkarte (A5, eine Seite) und Handbuch (A4) als PDF
//   Schublade           Projekt, Kapitel an/ab, Ausgabe, Prüfung vor dem Export
//   Arbeitsfläche       gewähltes Kapitel | Vorschau (dieselbe Seite wie im PDF)

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileDown, IdCard, Library } from 'lucide-react'
import { ProjectFileMenu } from '@renderer/components/ProjectFileMenu'
import { BarDivider, ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Segmented } from '@renderer/components/ui/segmented'
import { Select } from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api'
import { useProjectFile } from '@renderer/lib/projectFile'
import { useSettings } from '@renderer/lib/settings'
import { toast } from '@renderer/lib/toast'
import { useElementWidth } from '@renderer/lib/useElementWidth'
import { usePersistentState, type Codec } from '@renderer/lib/usePersistentState'
import { DEFAULT_FIRMENPROFIL } from '@shared/types'
import { MINI_MANUAL_FILE } from './fileSection'
import { KAPITEL, kapitelDef, stufeLabel, type Stufe } from './model'
import { pruefung } from './pruefung'
import { fusszeile, handbuchHtml, kurzkarteHtml, vorschau, type SeitenKontext } from './seiten'
import { useMiniManual } from './store'
import { BausteineDialog } from './ui/BausteineDialog'
import { KapitelEditor, type Auswahl } from './ui/KapitelEditor'
import { Schublade } from './ui/Schublade'
import { Vorschau } from './ui/Vorschau'
import { useLedWallQuelle } from './ui/useLedWallQuelle'

type AusgabeWahl = '1' | '2' | '3' | 'lern'

const AUSGABEN: { value: AusgabeWahl; label: string }[] = [
  { value: '1', label: 'Bedienung' },
  { value: '2', label: 'Betreuung' },
  { value: '3', label: 'Technik' },
  { value: 'lern', label: 'Lernausgabe' }
]

const ausgabeCodec: Codec<AusgabeWahl> = {
  parse: (raw) => (AUSGABEN.some((a) => a.value === raw) ? (raw as AusgabeWahl) : null),
  format: (v) => v
}
const AUSWAHLEN: Auswahl[] = ['deckblatt', ...KAPITEL.map((k) => k.id)]
const auswahlCodec: Codec<Auswahl> = {
  parse: (raw) => (AUSWAHLEN.includes(raw as Auswahl) ? (raw as Auswahl) : null),
  format: (v) => v
}

const dateiname = (s: string): string => s.replace(/[^\wäöüÄÖÜß -]+/g, '').trim()

export function MiniManual(): JSX.Element {
  const file = useProjectFile(MINI_MANUAL_FILE)
  const a = useMiniManual((s) => s.anleitung)
  const firma = useSettings((s) => s.firmenprofil) ?? DEFAULT_FIRMENPROFIL
  const [wahl, setWahl] = usePersistentState<AusgabeWahl>('mini-manual:ausgabe', '2', ausgabeCodec)
  const [bausteine, setBausteine] = useState(false)
  const [auswahl, setAuswahl] = usePersistentState<Auswahl>(
    'mini-manual:kapitel',
    'einAus',
    auswahlCodec
  )
  const q = useLedWallQuelle()
  const [measure, width] = useElementWidth<HTMLDivElement>()
  const breit = width >= 1000

  const lern = wahl === 'lern'
  const stufe: Stufe = lern ? 3 : (Number(wahl) as Stufe)
  const datum = new Date().toLocaleDateString('de-AT')
  const ctx = useMemo<SeitenKontext>(
    () => ({ stufe, lern, firma, datum, modus: 'vorschau' }),
    [stufe, lern, firma, datum]
  )
  const punkte = useMemo(() => pruefung(a, ctx, { ledWallNeuer: q.neuer }), [a, ctx, q.neuer])
  const seite = useMemo(() => vorschau(a, ctx, auswahl), [a, ctx, auswahl])
  const ernst = punkte.filter((p) => p.schwere !== 'info').length

  const index = AUSWAHLEN.indexOf(auswahl)
  const blaettern = (dir: -1 | 1): void => {
    const next = AUSWAHLEN[index + dir]
    if (next) setAuswahl(next)
  }

  async function exportiere(art: 'handbuch' | 'kurzkarte'): Promise<void> {
    const an = useMiniManual.getState().anleitung
    // Kurzkarte ist die Karte fürs Rack: ohne Lernausgabe, höchstens die gewählte Stufe
    const druck: SeitenKontext = {
      ...ctx,
      modus: 'druck',
      lern: art === 'handbuch' && lern,
      stufe: art === 'kurzkarte' && lern ? 1 : stufe
    }
    const fehler = pruefung(an, druck, { ledWallNeuer: q.neuer }).filter(
      (p) => p.schwere === 'fehler'
    )
    if (fehler.length) {
      const ok = await api.confirm({
        message: `Die Prüfung meldet ${fehler.length === 1 ? 'einen Fehler' : `${fehler.length} Fehler`}.`,
        detail: fehler.map((f) => `• ${f.text}`).join('\n'),
        confirmLabel: 'Trotzdem exportieren'
      })
      if (!ok) return
    }
    const name = dateiname(an.deckblatt.projekt) || 'Anleitung'
    const res =
      art === 'handbuch'
        ? await api.util.exportPdf(
            handbuchHtml(an, druck),
            `${name} - Handbuch ${druck.lern ? 'Lernausgabe' : stufeLabel(druck.stufe)}.pdf`,
            { footer: fusszeile(an, druck) }
          )
        : await api.util.exportPdf(kurzkarteHtml(an, druck), `${name} - Kurzkarte.pdf`, {
            pageSize: 'A5',
            onePage: true
          })
    if (!res) return
    if (art === 'kurzkarte' && res.pages > 1) {
      toast.warning(
        `Die Kurzkarte hat ${res.pages} Seiten`,
        'Sie passt auch verkleinert nicht auf eine Seite – kürze die Schritte im Kapitel „Ein- und Ausschalten“.'
      )
    } else {
      toast.success(
        art === 'handbuch' ? 'Handbuch gespeichert' : 'Kurzkarte gespeichert',
        res.scale < 1
          ? `auf ${Math.round(res.scale * 100)} % verkleinert, damit sie auf eine Seite passt`
          : res.path
      )
    }
  }

  return (
    <ToolShell
      id="mini-manual"
      asideWidth={340}
      bar={
        <ToolBar
          label="Anleitung"
          kind="job"
          status={
            ernst > 0 ? (
              <Badge tone={punkte.some((p) => p.schwere === 'fehler') ? 'danger' : 'warning'}>
                Vor dem Export: {ernst}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">bereit zum Export</span>
            )
          }
        >
          <ProjectFileMenu file={file} />
          <BarDivider />
          <Segmented label="Ausgabe für" value={wahl} options={AUSGABEN} onChange={setWahl} />
          <BarDivider />
          <Button size="sm" variant="outline" onClick={() => void exportiere('kurzkarte')}>
            <IdCard className="size-4" /> Kurzkarte (A5)
          </Button>
          <Button size="sm" onClick={() => void exportiere('handbuch')}>
            <FileDown className="size-4" /> Handbuch (PDF)
          </Button>
          <BarDivider />
          <Button
            size="sm"
            variant="outline"
            title="Eigene Bausteine verwalten, exportieren und importieren"
            onClick={() => setBausteine(true)}
          >
            <Library className="size-4" /> Bausteine
          </Button>
          {bausteine && <BausteineDialog onClose={() => setBausteine(false)} />}
        </ToolBar>
      }
      aside={<Schublade auswahl={auswahl} waehle={setAuswahl} punkte={punkte} />}
      main={
        <div ref={measure} className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Voriges Kapitel"
              disabled={index <= 0}
              onClick={() => blaettern(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Select
              size="sm"
              aria-label="Kapitel"
              value={auswahl}
              onChange={(e) => setAuswahl(e.target.value as Auswahl)}
            >
              <option value="deckblatt">Deckblatt</option>
              {a.kapitel.map((k) => (
                <option key={k.id} value={k.id}>
                  {kapitelDef(k.id).titel}
                  {k.an ? '' : ' (abgewählt)'}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Nächstes Kapitel"
              disabled={index >= AUSWAHLEN.length - 1}
              onClick={() => blaettern(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div
            className={
              breit
                ? 'grid grid-cols-[minmax(0,1fr)_minmax(320px,38%)] items-start gap-5'
                : 'space-y-5'
            }
          >
            <div className="min-w-0">
              <KapitelEditor id={auswahl} q={q} />
            </div>
            <div className={breit ? 'sticky top-0 space-y-2' : 'space-y-2'}>
              <div className="text-xs text-muted-foreground">
                Vorschau · {lern ? 'Lernausgabe' : `Stufe ${stufeLabel(stufe)}`}
              </div>
              <Vorschau css={seite.css} html={seite.html} />
            </div>
          </div>
        </div>
      }
    />
  )
}
