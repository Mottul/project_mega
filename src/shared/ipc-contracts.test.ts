import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { handle } from '../main/ipc/kanal'
import type { broadcast } from '../main/services/broadcast'
import { Channels, type Kanal } from './ipc-contracts'

/** Alle Einträge der Tabelle mit ihrem Pfad wie in window.api */
function eintraege(teil: object, pfad: string[] = []): { pfad: string[]; k: Kanal }[] {
  return Object.entries(teil).flatMap(([name, wert]) =>
    'art' in wert ? [{ pfad: [...pfad, name], k: wert }] : eintraege(wert, [...pfad, name])
  )
}

function quelltext(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .map((e) => {
      const p = join(dir, e.name)
      if (e.isDirectory()) return quelltext(p)
      return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? readFileSync(p, 'utf8') : ''
    })
    .join('\n')
}

const alle = eintraege(Channels)

describe('IPC-Vertrag', () => {
  it('Kanalnamen sind eindeutig – sonst landen zwei Methoden beim selben Handler', () => {
    const namen = alle.map((e) => e.k.kanal)
    expect(namen.filter((n, i) => namen.indexOf(n) !== i)).toEqual([])
    for (const n of namen) expect(n).toMatch(/^[a-zA-Z]+:[a-zA-Z]+$/)
  })

  it('on… sind genau die Ereignisse', () => {
    for (const { pfad, k } of alle) {
      expect([pfad.join('.'), k.art === 'ereignis']).toEqual([
        pfad.join('.'),
        /^on[A-Z]/.test(pfad[pfad.length - 1])
      ])
    }
  })

  it('jeder Kanal hat im main eine Gegenstelle', () => {
    const main = quelltext('src/main')
    const offen = alle.filter(({ pfad }) => {
      const ganzerAbschnitt = pfad.length === 2 && main.includes(`channels: Channels.${pfad[0]},`)
      return (
        !main.includes(`Channels.${pfad.join('.')}`) &&
        // registerRemoteControl bekommt den Abschnitt als Ganzes
        !(ganzerAbschnitt && /^(remote(Status|Start|Stop)|onRemoteChanged)$/.test(pfad[1]))
      )
    })
    expect(offen.map((e) => e.pfad.join('.'))).toEqual([])
  })

  it('Handler und Ereignisse müssen zur Signatur passen (prüft typecheck:test)', () => {
    const geprueft = (h: typeof handle, b: typeof broadcast): void => {
      h(Channels.ffmpeg.probe, (_e, path) => ({ ok: path.length > 0 }) as never)
      // fremde Eingaben dürfen ungeprüft als unknown ankommen
      h(Channels.openPath, (_e, target: unknown) => void target)
      // @ts-expect-error falscher Parameter
      h(Channels.openPath, (_e, target: number) => void target)
      // @ts-expect-error falsches Ergebnis
      h(Channels.getLogPath, () => 42)
      // @ts-expect-error Ereignis ist keine Anfrage
      h(Channels.player.onState, () => undefined)
      // @ts-expect-error falsche Nutzlast
      b(Channels.patterns.onOutputChanged, 'offen')
      // @ts-expect-error Nutzlast fehlt
      b(Channels.patterns.onOutputChanged)
    }
    expect(geprueft).toBeTypeOf('function')
  })
})
