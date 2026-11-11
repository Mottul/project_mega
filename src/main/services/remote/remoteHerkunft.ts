// Woher kommt eine Anfrage an eine Fernsteuerung? – rein und getestet (remoteHerkunft.test.ts),
// angewendet für jeden Fernsteuer-Server an einer Stelle (remoteHttp.ts, createRemoteHost).
//
// Die Fernsteuerungen haben kein Passwort: Wer im selben Netz ist, darf steuern (bewusst, siehe
// docs/SICHERHEIT.md). Eine Website aus dem Internet ist nicht im selben Netz – der Browser, der
// sie zeigt, aber schon. Zwei Wege, auf denen sie so mitsteuern könnte:
// - Sie schickt blind einen Befehl (POST an http://<ip>:<port>/api/command). Der Browser nennt
//   dabei die Seite, von der die Anfrage stammt (`Origin`). Die eigenen Steuerseiten liefert der
//   Server selbst aus – bei ihnen sind `Origin` und angesprochene Adresse (`Host`) gleich.
// - Ihr Name zeigt nach dem Laden auf den Rechner (DNS-Rebinding). Für den Browser ist das
//   dieselbe Herkunft, die Seite könnte dann auch lesen. Im `Host` steht aber weiter ihr Name –
//   und unter dem ist der Rechner im eigenen Netz nicht erreichbar.
// Programme ohne Browser (Companion, curl, Skripte) schicken kein `Origin` und steuern wie bisher.

import { isIP } from 'node:net'

export type Herkunft = 'ok' | 'fremde-seite' | 'fremder-name'

/** `Host` bzw. `Origin` zerlegt: Name klein, ohne Port und IPv6-Klammern; null = unlesbar */
function adresse(wert: string, mitSchema: boolean): { name: string; host: string } | null {
  try {
    const u = new URL(mitSchema ? wert : `http://${wert}`)
    // nur die Adresse selbst: `Host: boese.example/@192.168.1.5` soll nicht als IP durchgehen
    if (u.username || u.password || u.pathname !== '/' || u.search || u.hash) return null
    const name = u.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
    return name ? { name, host: u.host } : null
  } catch {
    return null
  }
}

const ersterTeil = (name: string): string => name.split('.')[0]

/**
 * Ist das ein Name, unter dem dieser Rechner im eigenen Netz erreichbar ist? IP-Adressen (so
 * steht es im QR-Code), `localhost`, einfache Namen ohne Punkt und `.local` (Bonjour) löst nur
 * das eigene Netz auf; dazu der eigene Rechnername mit jeder Endung, die Router oder Firmennetz
 * anhängen (`regie-pc.fritz.box`, `regie-pc.firma.de`) – die Endungen kennt die App nicht.
 * Ein beliebiger Name aus dem Internet (`boese.example`) gehört nie dazu. Grenze: Wer den
 * Rechnernamen kennt, kann einen passenden Namen anlegen (`regie-pc.boese.example`). Das hält
 * Seiten auf, die blind suchen, keinen gezielten Angriff – dagegen hilft erst eine PIN.
 */
export function eigenerName(name: string, rechner: string): boolean {
  if (isIP(name) !== 0) return true
  if (name === 'localhost' || name.endsWith('.localhost')) return true
  if (!name.includes('.') || name.endsWith('.local')) return true
  const eigener = ersterTeil(rechner.trim().toLowerCase())
  return eigener !== '' && ersterTeil(name) === eigener
}

/**
 * Urteil über eine Anfrage aus ihren Kopfzeilen. `rechner` = Name dieses Rechners
 * (os.hostname()). Fehlt `Host` (HTTP/1.0), gibt es nichts zu prüfen – ein Browser schickt ihn
 * immer. Fehlt `Origin`, kam die Anfrage nicht von einer fremden Seite: Browser nennen ihn bei
 * jedem fremden POST, auch aus Formularen.
 */
export function pruefeHerkunft(
  kopf: { host?: string | undefined; origin?: string | undefined },
  rechner: string
): Herkunft {
  const host = kopf.host === undefined ? null : adresse(kopf.host, false)
  if (kopf.host !== undefined && (!host || !eigenerName(host.name, rechner))) return 'fremder-name'
  if (kopf.origin === undefined) return 'ok'
  // „null“ schickt der Browser aus abgeschotteten Rahmen und für Seiten ohne eigene Adresse
  const origin = kopf.origin === 'null' ? null : adresse(kopf.origin, true)
  return origin && host && origin.host === host.host ? 'ok' : 'fremde-seite'
}
