// Mini-Manual im Werkzeug-Muster (ToolShell, docs/PLAN-MINI-MANUAL.md, Skizze „Arbeitsplatz“):
//   Leiste „Anleitung“  Datei-Menü (Projektdatei, Abschnitt „anleitung“), Stufe der Ausgabe,
//                       Kurzkarte (A5, eine Seite) und Handbuch (A4) als PDF, Handy-Fassung
//                       (eine HTML-Datei, auch in die Online-Ablage)
//   Schublade           Projekt, Kapitel an/ab, Ausgabe, Prüfung vor dem Export
//   Arbeitsfläche       gewähltes Kapitel | Vorschau (dieselbe Seite wie im PDF)

import { useMemo, useState } from 'react'
import type { OnlinePublish, PdfExportResult } from '@shared/types'
import { ChevronLeft, ChevronRight, Library, Sparkles } from 'lucide-react'
import { PrintButton, PrintDialog, type DruckAuftrag } from '@renderer/components/PrintDialog'
import { ProjectFileMenu } from '@renderer/components/ProjectFileMenu'
import { BarDivider, ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Field } from '@renderer/components/ui/field'
import { Segmented } from '@renderer/components/ui/segmented'
import { Select } from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api'
import { useProjectFile } from '@renderer/lib/projectFile'
import { useSettings } from '@renderer/lib/settings'
import { toast } from '@renderer/lib/toast'
import { useElementWidth } from '@renderer/lib/useElementWidth'
import { flag, usePersistentState, type Codec } from '@renderer/lib/usePersistentState'
import { DEFAULT_FIRMENPROFIL } from '@shared/types'
import { MINI_MANUAL_FILE } from './fileSection'
import { handyHtml, ONLINE_STUFE } from './handy'
import { KAPITEL, kapitelDef, stufeLabel, type Stufe } from './model'
import { pruefung } from './pruefung'
import {
  fusszeile,
  handbuchHtml,
  kapitelNummern,
  kurzkarteHtml,
  vorschau,
  type SeitenKontext
} from './seiten'
import { useMiniManual } from './store'
import { istFrisch } from './einstieg'
import { BausteineDialog } from './ui/BausteineDialog'
import { Einstieg } from './ui/Einstieg'
import { HandyMenu } from './ui/HandyMenu'
import { KapitelEditor, type Auswahl } from './ui/KapitelEditor'
import { PasswortFeld } from './ui/PasswortFeld'
import { Schublade } from './ui/Schublade'
import { Seitenansicht } from './ui/Seitenansicht'
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
type DruckArt = 'handbuch' | 'kurzkarte'
const DRUCK_ARTEN: { value: DruckArt; label: string }[] = [
  { value: 'handbuch', label: 'Handbuch' },
  { value: 'kurzkarte', label: 'Kurzkarte (A5)' }
]
const druckArtCodec: Codec<DruckArt> = {
  parse: (raw) => (raw === 'handbuch' || raw === 'kurzkarte' ? raw : null),
  format: (v) => v
}
const KURZKARTE_ZU_LANG =
  'Sie passt auch verkleinert nicht auf eine Seite – kürze die Schritte im Kapitel „Ein- und Ausschalten“.'

const AUSWAHLEN: Auswahl[] = ['deckblatt', ...KAPITEL.map((k) => k.id)]
const auswahlCodec: Codec<Auswahl> = {
  parse: (raw) => (AUSWAHLEN.includes(raw as Auswahl) ? (raw as Auswahl) : null),
  format: (v) => v
}

const dateiname = (s: string): string => s.replace(/[^\wäöüÄÖÜß -]+/g, '').trim()

const ONLINE_GRUND: Record<Extract<OnlinePublish, { ok: false }>['reason'], string> = {
  'nicht-eingerichtet': 'Die Online-Ablage ist nicht eingerichtet (App-Menü → Online-Ablage).',
  'nicht-erreichbar':
    'Der Ordner der Online-Ablage ist nicht erreichbar – läuft pCloud Drive bzw. ist das Laufwerk verbunden?',
  adresse: 'Die Adresse der Online-Ablage ist ungültig (App-Menü → Online-Ablage, https://…).',
  'zu-gross': 'Die Anleitung ist mit ihren Fotos zu groß.',
  fehler: 'Die Datei ließ sich nicht schreiben.'
}

export function MiniManual(): JSX.Element {
  const file = useProjectFile(MINI_MANUAL_FILE)
  const a = useMiniManual((s) => s.anleitung)
  const firma = useSettings((s) => s.firmenprofil) ?? DEFAULT_FIRMENPROFIL
  const [wahl, setWahl] = usePersistentState<AusgabeWahl>('mini-manual:ausgabe', '2', ausgabeCodec)
  const [bausteine, setBausteine] = useState(false)
  const [drucken, setDrucken] = useState(false)
  const [druckArt, setDruckArt] = usePersistentState<DruckArt>(
    'mini-manual:druckart',
    'handbuch',
    druckArtCodec
  )
  // geführter Einstieg: angeboten, solange die Anleitung frisch ist; „Nicht jetzt“ gilt bis zum
  // nächsten Öffnen des Werkzeugs
  const [einstieg, setEinstieg] = useState(false)
  const [einstiegWeg, setEinstiegWeg] = useState(false)
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
  // Seitenansicht: das Handbuch wie im PDF (Druck-Modus, mit Fußzeile) – zeigt die Umbrüche
  const [seitenansicht, setSeitenansicht] = usePersistentState(
    'mini-manual:seitenansicht',
    false,
    flag
  )
  const druckCtx = useMemo<SeitenKontext>(() => ({ ...ctx, modus: 'druck' }), [ctx])
  const druck = useMemo(
    () =>
      seitenansicht
        ? { html: handbuchHtml(a, druckCtx), footer: fusszeile(a, druckCtx) }
        : { html: '', footer: '' },
    [seitenansicht, a, druckCtx]
  )
  const zielNr = auswahl === 'deckblatt' ? null : (kapitelNummern(a, druckCtx).get(auswahl) ?? null)
  const ernst = punkte.filter((p) => p.schwere !== 'info').length

  const index = AUSWAHLEN.indexOf(auswahl)
  const blaettern = (dir: -1 | 1): void => {
    const next = AUSWAHLEN[index + dir]
    if (next) setAuswahl(next)
  }

  /** Fehler der Prüfung vor einem Export: weiter nur auf ausdrückliche Bestätigung */
  async function freigabe(
    an: typeof a,
    k: SeitenKontext,
    label = 'Trotzdem exportieren'
  ): Promise<boolean> {
    const fehler = pruefung(an, k, { ledWallNeuer: q.neuer }).filter((p) => p.schwere === 'fehler')
    if (!fehler.length) return true
    return api.confirm({
      message: `Die Prüfung meldet ${fehler.length === 1 ? 'einen Fehler' : `${fehler.length} Fehler`}.`,
      detail: fehler.map((f) => `• ${f.text}`).join('\n'),
      confirmLabel: label
    })
  }

  /** Handy-Fassung als Datei – zum Verschicken (WhatsApp, Mail), wie das PDF mit allen Stufen */
  async function handyDatei(): Promise<void> {
    const an = useMiniManual.getState().anleitung
    const k: SeitenKontext = { ...ctx, modus: 'druck' }
    if (!(await freigabe(an, k))) return
    const name = dateiname(an.deckblatt.projekt) || 'Anleitung'
    const p = await api.util.exportHtml(
      handyHtml(an, k, { online: false }),
      `${name} - Handy ${lern ? 'Lernausgabe' : stufeLabel(stufe)}.html`
    )
    if (p) toast.success('Handy-Fassung gespeichert', p)
  }

  /**
   * In die Online-Ablage: gleicher Ordner wie beim letzten Mal (die Adresse auf der Kurzkarte
   * bleibt gültig) – `neu` legt einen neuen an. Ordner und Adresse merkt sich die Anleitung.
   */
  async function handyOnline(neu: boolean): Promise<void> {
    const an = useMiniManual.getState().anleitung
    const k: SeitenKontext = { ...ctx, modus: 'druck' }
    if (!(await freigabe(an, k, 'Trotzdem online stellen'))) return
    const r = await api.online.publish(
      handyHtml(an, k, { online: true }),
      neu ? null : (an.ausgabe.online?.ordner ?? null),
      an.deckblatt.projekt || an.titel
    )
    if (!r.ok) {
      toast.error('Online stellen ging nicht', ONLINE_GRUND[r.reason])
      return
    }
    // frisch lesen: Während des Schreibens kann sich die Anleitung geändert haben
    const alt = useMiniManual.getState().anleitung.ausgabe.online
    if (alt?.ordner !== r.ordner || alt.url !== r.url)
      useMiniManual.getState().update((x) => ({
        ...x,
        ausgabe: { ...x.ausgabe, online: { ordner: r.ordner, url: r.url } }
      }))
    const gekappt = lern || stufe > ONLINE_STUFE
    toast.success(
      'Online gestellt – der Dienst lädt die Datei hoch',
      `${r.url}${gekappt ? ` · als ${stufeLabel(ONLINE_STUFE)}` : ''} · ohne Zugangsdaten`
    )
  }

  // Kurzkarte ist die Karte fürs Rack: ohne Lernausgabe, höchstens die gewählte Stufe
  const druckKontext: SeitenKontext = {
    ...ctx,
    modus: 'druck',
    lern: druckArt === 'handbuch' && lern,
    stufe: druckArt === 'kurzkarte' && lern ? 1 : stufe
  }

  function druckAuftrag(): DruckAuftrag {
    const name = dateiname(a.deckblatt.projekt) || 'Anleitung'
    if (druckArt === 'kurzkarte')
      return {
        html: kurzkarteHtml(a, druckKontext),
        name: `${name} - Kurzkarte.pdf`,
        page: { pageSize: 'A5', onePage: true }
      }
    const stufeName = druckKontext.lern ? 'Lernausgabe' : stufeLabel(druckKontext.stufe)
    return {
      html: handbuchHtml(a, druckKontext),
      name: `${name} - Handbuch ${stufeName}.pdf`,
      page: { footer: fusszeile(a, druckKontext) }
    }
  }

  function gespeichert(res: PdfExportResult): void {
    if (druckArt === 'kurzkarte' && res.pages > 1) {
      toast.warning(`Die Kurzkarte hat ${res.pages} Seiten`, KURZKARTE_ZU_LANG)
      return
    }
    toast.success(
      druckArt === 'handbuch' ? 'Handbuch gespeichert' : 'Kurzkarte gespeichert',
      res.scale < 1
        ? `auf ${Math.round(res.scale * 100)} % verkleinert, damit sie auf eine Seite passt`
        : res.path
    )
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
          <PrintButton onClick={() => setDrucken(true)} />
          {drucken && (
            <PrintDialog
              titel={druckArt === 'handbuch' ? 'Handbuch drucken' : 'Kurzkarte drucken'}
              auftrag={druckAuftrag()}
              onClose={() => setDrucken(false)}
              vorAusgabe={() => freigabe(useMiniManual.getState().anleitung, druckKontext)}
              onGespeichert={gespeichert}
              seitenHinweis={(n) =>
                druckArt === 'kurzkarte' && n > 1
                  ? `Die Kurzkarte hat ${n} Seiten. ${KURZKARTE_ZU_LANG}`
                  : null
              }
              optionen={
                <>
                  <Field group label="Dokument">
                    <Segmented
                      label="Dokument"
                      value={druckArt}
                      options={DRUCK_ARTEN}
                      onChange={setDruckArt}
                    />
                  </Field>
                  <Field
                    label="Stufe"
                    hint="Dieselbe Wahl wie „Ausgabe für“ in der Leiste. Die Kurzkarte ist ohne Lernausgabe (dann Stufe Bedienung)."
                  >
                    <Select
                      aria-label="Stufe des Dokuments"
                      value={wahl}
                      onChange={(e) => setWahl(e.target.value as AusgabeWahl)}
                    >
                      {AUSGABEN.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <PasswortFeld />
                </>
              }
            />
          )}
          <HandyMenu onDatei={handyDatei} onOnline={handyOnline} />
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
          {istFrisch(a) && !einstiegWeg && (
            <div
              className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3"
              data-testid="einstieg-hinweis"
            >
              <Sparkles className="size-5 shrink-0 text-primary" />
              <p className="min-w-0 flex-1 text-sm">
                <b>Neue Anleitung?</b> In vier Schritten einrichten: Projekt, LED-Wall, Geräte,
                Kapitel.
              </p>
              <Button size="sm" onClick={() => setEinstieg(true)}>
                Einrichten
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEinstiegWeg(true)}>
                Nicht jetzt
              </Button>
            </div>
          )}
          {einstieg && (
            <Einstieg
              q={q}
              onClose={() => setEinstieg(false)}
              onFertig={(ziel) => {
                setEinstieg(false)
                setAuswahl(ziel)
              }}
            />
          )}
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
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Vorschau · {lern ? 'Lernausgabe' : `Stufe ${stufeLabel(stufe)}`}</span>
                <Segmented
                  label="Art der Vorschau"
                  value={seitenansicht ? 'seiten' : 'kapitel'}
                  options={[
                    { value: 'kapitel', label: 'Kapitel' },
                    { value: 'seiten', label: 'Seiten' }
                  ]}
                  onChange={(v) => setSeitenansicht(v === 'seiten')}
                />
              </div>
              {seitenansicht ? (
                <Seitenansicht
                  html={druck.html}
                  footer={druck.footer}
                  zielNr={zielNr}
                  zielTitel={auswahl === 'deckblatt' ? '' : kapitelDef(auswahl).titel}
                />
              ) : (
                <Vorschau css={seite.css} html={seite.html} />
              )}
            </div>
          </div>
        </div>
      }
    />
  )
}
