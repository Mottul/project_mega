import { describe, expect, it, vi } from 'vitest'
import { Channels } from '@shared/ipc-contracts'
import { baueApi, type IpcWeg } from './baueApi'

const weg = (): IpcWeg & { abmelden: () => void } => {
  const abmelden = vi.fn()
  return {
    abmelden,
    invoke: vi.fn(async () => 'antwort'),
    send: vi.fn(),
    subscribe: vi.fn(() => abmelden)
  }
}

describe('window.api aus der Kanal-Tabelle', () => {
  it('Anfrage: invoke mit allen Argumenten, Ergebnis kommt durch', async () => {
    const w = weg()
    const api = baueApi(Channels, w)
    await expect(api.manuals.searchInDoc(7, 'Fader')).resolves.toBe('antwort')
    expect(w.invoke).toHaveBeenCalledWith('manuals:searchInDoc', 7, 'Fader')
  })

  it('weggelassene optionale Argumente bleiben weg – die Vorgabe setzt main', () => {
    const w = weg()
    void baueApi(Channels, w).util.renderPdf('<p></p>')
    expect(w.invoke).toHaveBeenCalledWith('util:renderPdf', '<p></p>')
  })

  it('Einweg: send, ohne auf eine Antwort zu warten', () => {
    const w = weg()
    expect(baueApi(Channels, w).util.log('Zeile')).toBeUndefined()
    expect(w.send).toHaveBeenCalledWith('util:log', 'Zeile')
    expect(w.invoke).not.toHaveBeenCalled()
  })

  it('Ereignis: Abo mit Callback, liefert das Abmelden', () => {
    const w = weg()
    const cb = vi.fn()
    const ab = baueApi(Channels, w).player.onState(cb)
    expect(w.subscribe).toHaveBeenCalledWith('player:state', cb)
    ab()
    expect(w.abmelden).toHaveBeenCalledOnce()
  })

  it('Abschnitte bleiben Abschnitte, ohne Felder der Tabelle', () => {
    const api = baueApi(Channels, weg())
    expect(typeof api.converter.enqueue).toBe('function')
    expect(typeof api.selectPaths).toBe('function')
    expect(Object.keys(api)).not.toContain('art')
  })
})
