// Baut window.api aus der Kanal-Tabelle. Bewusst Methode für Methode statt eines allgemeinen
// „invoke(kanal)“: Die Seite erreicht nur, was im Vertrag steht.

import type { ApiAus, Kanal } from '@shared/ipc-contracts'

export interface IpcWeg {
  invoke(kanal: string, ...args: unknown[]): Promise<unknown>
  send(kanal: string, ...args: unknown[]): void
  /** Event-Abo, liefert das Abmelden */
  subscribe(kanal: string, cb: (...args: unknown[]) => void): () => void
}

function methode(k: Kanal, weg: IpcWeg): unknown {
  switch (k.art) {
    case 'anfrage':
      return (...args: unknown[]) => weg.invoke(k.kanal, ...args)
    case 'einweg':
      return (...args: unknown[]) => weg.send(k.kanal, ...args)
    case 'ereignis':
      return (cb: (...args: unknown[]) => void) => weg.subscribe(k.kanal, cb)
  }
}

export function baueApi<T extends object>(tabelle: T, weg: IpcWeg): ApiAus<T> {
  const eintraege = Object.entries(tabelle).map(([name, wert]) => [
    name,
    'art' in wert ? methode(wert, weg) : baueApi(wert, weg)
  ])
  return Object.fromEntries(eintraege)
}
