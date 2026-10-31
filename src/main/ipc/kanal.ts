// Anmeldung der Kanäle im main: Die Signatur kommt aus dem Vertrag (Parameter, Ergebnis), ein
// Handler, der nicht dazu passt, baut nicht. Eingaben bleiben fremd: Wer feldweise prüft, nimmt die
// Parameter als `unknown` an – das passt zu jeder Signatur.

import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type { Anfrage, Einweg, KanalFn } from '@shared/ipc-contracts'

export function handle<F extends KanalFn>(
  k: Anfrage<F>,
  fn: (e: IpcMainInvokeEvent, ...args: Parameters<F>) => ReturnType<F> | Promise<ReturnType<F>>
): void {
  ipcMain.handle(k.kanal, (e, ...args) => fn(e, ...(args as Parameters<F>)))
}

export function on<F extends KanalFn>(
  k: Einweg<F>,
  fn: (e: IpcMainEvent, ...args: Parameters<F>) => void
): void {
  ipcMain.on(k.kanal, (e, ...args) => fn(e, ...(args as Parameters<F>)))
}
