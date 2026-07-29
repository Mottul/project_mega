// Zentrale Marken-Angaben. EIN Ort zum Umbenennen der App: Fenstertitel,
// Launcher-Kopfzeile, PDF-Fußzeilen und NDI-Quellnamen leiten sich hieraus ab.
// (package.json `productName`, electron-builder.yml und index.html sind statisch
// und müssen bei einer Umbenennung separat angepasst werden.)

export const APP_NAME = 'Mottulbox'

/** Kleinschreib-Kennung ohne Leerzeichen (Datei-Marker, OSC-Adress-Präfix …). */
export const APP_SLUG = 'mottulbox'

/** Ordnernamen früherer App-Namen – für die einmalige userData-Migration, damit
 *  bestehende Einstellungen/Bibliotheken nach der Umbenennung erhalten bleiben. */
export const PREVIOUS_APP_NAMES = ['AV Toolbox', 'MegaToolBox']

/** Fenstertitel-Baustein: „<Kontext> · <App>" bzw. nur „<App>". */
export function windowTitle(context?: string): string {
  return context ? `${context} · ${APP_NAME}` : APP_NAME
}
