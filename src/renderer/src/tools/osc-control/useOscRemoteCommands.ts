// Befehle der Handy-Fernsteuerung auf die OSC-Fläche anwenden – wie eine lokale Bedienung.

import { useEffect } from 'react'
import type { OscMessage } from '@shared/types'
import { api } from '@renderer/lib/api'
import { fmsg, type Nova, type SendFn, type SendMany } from './oscShared'
import { useOscSurface } from './store'

export function useOscRemoteCommands(send: SendFn, sendMany: SendMany, runNova: Nova): void {
  // Steuerbefehle vom Handy/Tablet anwenden (Live-Wert aktualisieren UND OSC senden – wie eine
  // lokale Bedienung).
  useEffect(() => {
    const offCmd = api.osc.onRemoteCommand((cmd) => {
      const st = useOscSurface.getState()
      // Set-Wechsel vom Handy: kein Widget-Bezug -> vor der Widget-Suche behandeln.
      // Der Publish-Effekt schickt danach automatisch den neuen Schnappschuss.
      if (cmd.kind === 'selectSet') {
        if (st.currentProject().sets.some((s) => s.id === cmd.id)) st.selectSet(cmd.id)
        return
      }
      const w = st.currentSet().widgets.find((x) => x.id === cmd.id)
      if (!w) return
      // NovaStar-Widgets: gleiche Basis-Kommandos vom Handy, aber an den Prozessor.
      if (w.target === 'nova') {
        if (cmd.kind === 'fader') {
          st.updateWidget(w.id, { value: cmd.value })
          runNova(w, cmd.value)
        } else if (cmd.kind === 'toggle') {
          st.updateWidget(w.id, { value: cmd.on ? 1 : 0 })
          runNova(w, cmd.on ? 1 : 0)
        } else if (cmd.kind === 'button') {
          if (cmd.down) runNova(w, 1)
        } else if (cmd.kind === 'select') {
          const it = w.items[cmd.index]
          if (it) {
            st.updateWidget(w.id, { value: cmd.index })
            runNova(w, it.value)
          }
        }
        return
      }
      if (cmd.kind === 'fader') {
        st.updateWidget(w.id, { value: cmd.value })
        send(fmsg(w.address, cmd.value))
      } else if (cmd.kind === 'toggle') {
        st.updateWidget(w.id, { value: cmd.on ? 1 : 0 })
        send(fmsg(w.address, cmd.on ? w.onValue : w.offValue))
      } else if (cmd.kind === 'button') {
        send(fmsg(w.address, cmd.down ? w.onValue : w.offValue))
      } else if (cmd.kind === 'xy') {
        st.updateWidget(w.id, { x: cmd.x, y: cmd.y })
        const msgs: OscMessage[] = [fmsg(w.address, cmd.x)]
        if (w.addressY) msgs.push(fmsg(w.addressY, cmd.y))
        sendMany(msgs)
      } else if (cmd.kind === 'color') {
        st.updateWidget(w.id, { r: cmd.r, g: cmd.g, b: cmd.b, a: cmd.a })
        send({
          address: w.address,
          args: [
            { type: 'f', value: cmd.r },
            { type: 'f', value: cmd.g },
            { type: 'f', value: cmd.b },
            { type: 'f', value: cmd.a }
          ]
        })
      } else if (cmd.kind === 'select') {
        const it = w.items[cmd.index]
        if (it) {
          st.updateWidget(w.id, { value: cmd.index })
          send(fmsg(it.address || w.address, it.value))
        }
      } else if (cmd.kind === 'bank') {
        const it = w.items[cmd.index]
        if (!it) return
        const addr = it.address || w.address
        const setItem = (value: number): void =>
          st.updateWidget(w.id, {
            items: w.items.map((x, i) => (i === cmd.index ? { ...x, value } : x))
          })
        if (w.bankMode === 'knob') {
          setItem(cmd.value)
          send(fmsg(addr, cmd.value))
        } else if (w.bankMode === 'toggle') {
          const on = cmd.value >= 0.5
          setItem(on ? 1 : 0)
          send(fmsg(addr, on ? w.onValue : w.offValue))
        } else {
          send(fmsg(addr, cmd.value >= 0.5 ? w.onValue : w.offValue))
        }
      } else if (cmd.kind === 'knob') {
        st.updateWidget(w.id, { value: cmd.value })
        send(fmsg(w.address, cmd.value))
      } else if (cmd.kind === 'knobStep') {
        // Handy sendet nur die Richtung (±1 je Rastung); Schrittweite = onValue.
        send(fmsg(w.address, cmd.delta * (Math.abs(w.onValue) || 1)))
      }
    })
    return offCmd
  }, [send, sendMany, runNova])
}
