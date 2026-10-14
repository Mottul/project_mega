// Wächter für ALLE Fenster – Haupt-, Werkzeug-, Ausgabe-, NDI- und PDF-Fenster, auch künftige:
// eingehängt über 'web-contents-created', also ohne dass ein Fenster daran denken muss.
// - keine neuen Fenster; http(s)-Links gehen an den Standardbrowser
// - keine Navigation weg von der App-Seite (ein Link oder ein Skript in einem Handbuch, einem
//   Export o. Ä. kann die App-API so nie einer fremden Seite geben)
// - keine Webviews
// - Browser-Berechtigungen nur nach Allowlist (windowPolicy.permissionAllowed); Mikrofon nur RTA
import { app, session, shell, type WebContents } from 'electron'
import { appPages } from './appWindows'
import { logLine } from '../log'
import { isAppPage, isWebUrl, permissionAllowed } from './windowPolicy'

function openInBrowser(url: string): void {
  if (isWebUrl(url)) void shell.openExternal(url)
}

function guard(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (e, url) => {
    // DevTools navigieren intern; die App selbst wechselt nur die Route im Hash
    if (url.startsWith('devtools:') || isAppPage(url, appPages)) return
    e.preventDefault()
    logLine('[wächter] Navigation verhindert:', url.slice(0, 200))
    openInBrowser(url)
  })
  contents.on('will-attach-webview', (e) => e.preventDefault())
}

/** Einmal beim Start, bevor das erste Fenster entsteht. */
export function installWindowGuards(): void {
  app.on('web-contents-created', (_e, contents) => guard(contents))

  const fromApp = (url: string | undefined, contents: WebContents | null): boolean =>
    isAppPage(url || contents?.getURL(), appPages)
  const denied = new Set<string>()
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const ok = permissionAllowed('request', permission, fromApp(details.requestingUrl, contents), {
      pageUrl: contents?.getURL(),
      mediaTypes: 'mediaTypes' in details ? details.mediaTypes : undefined
    })
    // je Berechtigung einmal ins Log – zeigt, falls eine Funktion doch eine braucht
    if (!ok && !denied.has(permission)) {
      denied.add(permission)
      logLine('[wächter] Berechtigung verweigert:', permission)
    }
    callback(ok)
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
    permissionAllowed('check', permission, fromApp(details.requestingUrl, contents), {
      pageUrl: contents?.getURL(),
      mediaType: details.mediaType
    })
  )
}
