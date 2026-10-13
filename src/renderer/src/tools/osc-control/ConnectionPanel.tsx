// Inspector der OSC-Steuerung: Ziel (Host, Port) und Empfang (Feedback-Port).

import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import type { OscSettings, OscStatus } from '@shared/types'
import { APP_SLUG } from '@shared/brand'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { Alert } from '@renderer/components/ui/alert'
import { api } from '@renderer/lib/api'
import type { SendFn } from './oscShared'
import { Field } from './WidgetEditor'

/* ------------------------- Inspector: Verbindung ------------------------ */

export function ConnectionPanel({
  config,
  status,
  onApplied,
  onSend
}: {
  config: OscSettings | null
  status: OscStatus | null
  onApplied: (st: OscStatus) => void
  onSend: SendFn
}): JSX.Element {
  const [host, setHost] = useState('')
  const [outPort, setOutPort] = useState(8000)
  const [inPort, setInPort] = useState(9000)
  const [feedback, setFeedback] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!config) return
    setHost(config.host)
    setOutPort(config.outPort)
    setInPort(config.inPort)
    setFeedback(config.feedbackEnabled)
  }, [config])

  const dirty =
    config != null &&
    (host !== config.host ||
      outPort !== config.outPort ||
      inPort !== config.inPort ||
      feedback !== config.feedbackEnabled)

  async function apply(): Promise<void> {
    setBusy(true)
    try {
      const st = await api.osc.setConfig({
        host: host.trim() || '127.0.0.1',
        outPort,
        inPort,
        feedbackEnabled: feedback
      })
      onApplied(st)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Host (MadMapper)">
        <Input
          value={host}
          spellCheck={false}
          placeholder="127.0.0.1"
          onChange={(e) => setHost(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Port aus (OSC out)">
          <NumberField value={outPort} min={1} max={65535} onCommit={setOutPort} />
        </Field>
        <Field label="Port ein (Feedback)">
          <NumberField value={inPort} min={1} max={65535} onCommit={setInPort} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={feedback}
          onChange={(e) => setFeedback(e.target.checked)}
          className="size-4 accent-primary"
        />
        Feedback empfangen (auf Port {inPort} lauschen)
      </label>

      {status?.lastError && <Alert tone="danger">{status.lastError}</Alert>}

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || busy} onClick={() => void apply()}>
          Übernehmen
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSend({ address: `/${APP_SLUG}/test`, args: [{ type: 'f', value: 1 }] })}
        >
          <Send className="size-3.5" /> Test
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Gesendet: <span className="tabular-nums text-foreground">{status?.sentCount ?? 0}</span>
        {status?.listening && (
          <>
            {' · '}Empfangen:{' '}
            <span className="tabular-nums text-foreground">{status?.recvCount ?? 0}</span>
          </>
        )}
      </p>
    </div>
  )
}
