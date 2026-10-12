// NovaStar-Prozessor-Steuerung (NovaPro UHD Jr & Co.) über TCP 5200, im Werkzeug-Muster:
//   Leiste „Prozessor“   Verbinden/Trennen, Blackout, Einfrieren, Fade to Black – rot, solange
//                        verbunden: Dann wirkt jeder Klick sofort auf der Wand.
//   Schublade            Verbindung (IP, Port), Ausblenden (Dauer, Ziel)
//   Arbeitsfläche        Helligkeit, Presets, Roh-Befehl
// Paket-Bytes abgeglichen mit dem Bitfocus-Companion-Modul (siehe novastarCodec).

import { useEffect, useRef, useState } from 'react'
import { Link2, Moon, Radio, Send, Sun } from 'lucide-react'
import type { NovastarStatus } from '@shared/types'
import {
  BarDivider,
  BarToggle,
  PanelSection,
  ToolBar,
  ToolShell
} from '@renderer/components/ToolShell'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field } from '@renderer/components/ui/field'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { useHandoff } from '@renderer/lib/handoff'
import { toolPageClass } from '@renderer/lib/toolPage'

/** Überschrift einer Karte der Arbeitsfläche (wie in den übrigen Werkzeugen) */
function CardTitle({ children, hint }: { children: string; hint?: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{children}</h2>
      {hint && <InfoTip text={hint} label={`Erklärung zu „${children}“`} />}
    </div>
  )
}

export function Novastar(): JSX.Element {
  const [host, setHost] = useState('')
  const [port, setPort] = useState(5200)
  const [status, setStatus] = useState<NovastarStatus | null>(null)
  const [bright, setBright] = useState(100)
  const [ftbSec, setFtbSec] = useState(2)
  const [faded, setFaded] = useState(false)
  const [fadeUpTarget, setFadeUpTarget] = useState('') // leer = letzter Wert vor dem Ausblenden
  const [black, setBlack] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [preset, setPreset] = useState(1)
  const [rawHex, setRawHex] = useState('')
  const [rawChecksum, setRawChecksum] = useState(true)

  const rampRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevBright = useRef(100)

  useEffect(() => {
    void api.novastar.status().then(setStatus)
    const off = api.novastar.onStatus(setStatus)
    // IP-Übergabe aus dem Netzwerk-Scanner übernehmen (einmalig).
    const ip = useHandoff.getState().takeNovastarHost()
    if (ip) setHost(ip)
    return () => {
      off()
      if (rampRef.current) clearInterval(rampRef.current)
    }
  }, [])

  const connected = status?.connected ?? false

  function applyBright(pct: number): void {
    const v = Math.max(0, Math.min(100, pct))
    setBright(v)
    void api.novastar.brightness(v)
  }
  function stopRamp(): void {
    if (rampRef.current) {
      clearInterval(rampRef.current)
      rampRef.current = null
    }
  }
  function ramp(to: number): void {
    stopRamp()
    const from = bright
    const steps = Math.max(1, Math.round((Math.max(0.1, ftbSec) * 1000) / 50))
    let i = 0
    rampRef.current = setInterval(() => {
      i++
      applyBright(from + (to - from) * (i / steps))
      if (i >= steps) stopRamp()
    }, 50)
  }
  // Toggle: ausblenden -> Schwarz; erneut -> wieder aufblenden auf den Zielwert
  // (eingestellt, sonst der letzte Wert vor dem Ausblenden).
  function toggleFade(): void {
    if (faded) {
      const t = fadeUpTarget.trim()
      const target =
        t === '' ? prevBright.current || 100 : Math.max(0, Math.min(100, Number(t) || 0))
      ramp(target)
      setFaded(false)
    } else {
      if (bright > 0) prevBright.current = bright
      ramp(0)
      setFaded(true)
    }
  }
  // Blackout und Freeze sind am Gerät EIN Anzeigemodus (Normal/Freeze/Black) --
  // sie schließen sich gegenseitig aus. Das eine einzuschalten hebt das andere
  // sichtbar auf; das aktive ausschalten schaltet auf Normal zurück.
  function toggleBlackout(): void {
    const next = !black
    setBlack(next)
    if (next) setFrozen(false)
    void api.novastar.blackout(next)
  }
  function toggleFreeze(): void {
    const next = !frozen
    setFrozen(next)
    if (next) setBlack(false)
    void api.novastar.freeze(next)
  }
  async function connect(): Promise<void> {
    if (connected) setStatus(await api.novastar.disconnect())
    else if (host.trim()) setStatus(await api.novastar.connect(host, port))
  }

  const target =
    fadeUpTarget.trim() === '' ? 'zurück auf den letzten Wert' : `auf ${fadeUpTarget} %`

  return (
    <ToolShell
      id="novastar"
      bar={
        <ToolBar
          label="Prozessor"
          active={connected}
          status={
            connected ? (
              <span className="truncate">
                verbunden <span className="font-mono">{`${status?.host}:${status?.port}`}</span> ·{' '}
                {Math.round(bright)} %
              </span>
            ) : (
              <span className="text-muted-foreground">getrennt</span>
            )
          }
        >
          <Button
            size="sm"
            variant={connected ? 'outline' : 'default'}
            disabled={!connected && !host.trim()}
            title={!connected && !host.trim() ? 'Zuerst die Prozessor-IP eintragen' : undefined}
            onClick={() => void connect()}
          >
            <Link2 className="size-4" /> {connected ? 'Trennen' : 'Verbinden'}
          </Button>
          <BarDivider />
          <BarToggle
            on={black}
            disabled={!connected}
            title="Anzeigemodus sofort hart auf Schwarz (ausschalten: zurück auf Normal)"
            onClick={toggleBlackout}
          >
            Blackout
          </BarToggle>
          <BarToggle
            on={frozen}
            disabled={!connected}
            title="Bild einfrieren (ausschalten: zurück auf Normal)"
            onClick={toggleFreeze}
          >
            Einfrieren
          </BarToggle>
          <BarToggle
            on={faded}
            disabled={!connected}
            title={
              faded
                ? `Wieder aufblenden (${target})`
                : `Helligkeit in ${ftbSec} s weich auf 0 % (erneut: wieder aufblenden)`
            }
            onClick={toggleFade}
          >
            Fade to Black
          </BarToggle>
        </ToolBar>
      }
      aside={
        <>
          <PanelSection
            id="connection"
            title="Verbindung"
            icon={Link2}
            summary={host.trim() ? `${host.trim()}:${port}` : 'keine IP'}
          >
            <Field
              label="Prozessor-IP"
              hint="Die IP lässt sich auch im Netzwerk-Scanner übernehmen (Gerät mit LED-Prozessor-Symbol)."
            >
              <Input
                value={host}
                placeholder="z. B. 192.168.0.10"
                onChange={(e) => setHost(e.target.value)}
                disabled={connected}
              />
            </Field>
            <Field label="Port" hint="Steuer-Port der NovaStar-Prozessoren: 5200.">
              <Input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value) || 5200)}
                disabled={connected}
                className="tabular-nums"
              />
            </Field>
          </PanelSection>
          <PanelSection
            id="fade"
            title="Ausblenden"
            icon={Moon}
            summary={`${ftbSec} s · ${target}`}
          >
            <Field label="Dauer" aside="Sekunden">
              <Input
                type="number"
                step="0.5"
                min={0.1}
                value={ftbSec}
                onChange={(e) => setFtbSec(Number(e.target.value) || 2)}
                className="tabular-nums"
              />
            </Field>
            <Field
              label="Aufblenden auf"
              aside="%"
              hint="Leer: zurück auf den Wert vor dem Ausblenden."
            >
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="letzter Wert"
                value={fadeUpTarget}
                onChange={(e) => setFadeUpTarget(e.target.value)}
                className="tabular-nums"
              />
            </Field>
          </PanelSection>
        </>
      }
      main={
        <div className={toolPageClass('3xl')}>
          {!connected &&
            (status?.lastError ? (
              <Alert tone="danger">Verbindung fehlgeschlagen: {status.lastError}</Alert>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nicht verbunden – Prozessor-IP in den Einstellungen eintragen und oben „Verbinden“
                wählen.
              </p>
            ))}

          <Card className="space-y-3 p-5">
            <CardTitle hint="„Fade to Black“ (oben) blendet die Helligkeit weich aus und beim erneuten Klick wieder auf. „Blackout“ schaltet den Anzeigemodus sofort hart auf Schwarz; Blackout und Einfrieren teilen sich diesen Modus – nur eines gleichzeitig.">
              Helligkeit
            </CardTitle>
            <div className="flex items-center gap-4">
              <Sun className="size-5 shrink-0 text-muted-foreground" />
              <input
                type="range"
                min={0}
                max={100}
                value={bright}
                aria-label="Helligkeit"
                onChange={(e) => {
                  applyBright(Number(e.target.value))
                  setFaded(false)
                }}
                className="w-full accent-primary"
                disabled={!connected}
              />
              <span className="w-24 shrink-0 whitespace-nowrap text-right text-2xl font-bold tabular-nums">
                {Math.round(bright)} %
              </span>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <CardTitle>Presets / Szenen</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <Button
                  key={n}
                  variant="outline"
                  size="sm"
                  disabled={!connected}
                  onClick={() => void api.novastar.preset(n)}
                  className="w-10 tabular-nums"
                >
                  {n}
                </Button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Field label="Preset-Nr. (1–26)" className="w-36">
                <Input
                  type="number"
                  min={1}
                  max={26}
                  value={preset}
                  onChange={(e) => setPreset(Number(e.target.value) || 1)}
                  className="tabular-nums"
                />
              </Field>
              <Button
                variant="outline"
                disabled={!connected}
                onClick={() => void api.novastar.preset(preset)}
              >
                Abrufen
              </Button>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <CardTitle hint="Befehls-Bytes für NovaPro UHD Jr & Co. (TCP 5200), abgeglichen mit dem Bitfocus-Companion-Modul. Bei anderen Modellen den Befehl hier selbst senden.">
              Roh-Befehl (erweitert)
            </CardTitle>
            <Input
              value={rawHex}
              spellCheck={false}
              aria-label="Roh-Befehl in Hex"
              placeholder="Hex, z. B. 55 AA 00 ..."
              onChange={(e) => setRawHex(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex items-center justify-between gap-2">
              <Checkbox
                checked={rawChecksum}
                onChange={setRawChecksum}
                label="Prüfsumme automatisch anhängen"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!connected || !rawHex.trim()}
                onClick={() => void api.novastar.raw(rawHex, rawChecksum)}
              >
                <Send className="size-4" /> Senden
              </Button>
            </div>
          </Card>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className="size-3.5" /> Befehle gehen per TCP direkt an den Prozessor; die
            Anzeige zeigt den zuletzt gesendeten Stand, nicht den des Geräts.
          </p>
        </div>
      }
    />
  )
}
