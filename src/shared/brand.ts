// Zentrale Marken-Angaben. EIN Ort zum Umbenennen der App: Fenstertitel,
// Launcher-Kopfzeile, PDF-Fußzeilen und NDI-Quellnamen leiten sich hieraus ab.
// (package.json `productName`, electron-builder.yml und index.html sind statisch
// und müssen bei einer Umbenennung separat angepasst werden.)

export const APP_NAME = 'MegaToolBox'

export const APP_TAGLINE = 'Werkzeuge für den AV-Alltag – offline, an einem Ort.'

/** Fenstertitel-Baustein: „<Kontext> · <App>" bzw. nur „<App>". */
export function windowTitle(context?: string): string {
  return context ? `${context} · ${APP_NAME}` : APP_NAME
}
