// HTML-Strings sicher bauen (Druck-Seiten, PDF, Vorschau): Text immer über esc(), Links nur über
// safeHref(). Eine Quelle für alle Seitenbauer – vorher hatten LED-Wall- und Packlisten-Druck je
// ein eigenes esc(), eines ließ Anführungszeichen stehen (in Attributen gefährlich).

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** Text für Inhalt UND Attribute (maskiert auch beide Anführungszeichen) */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c])
}

/** Nur https:, tel: und mailto: – alles andere (javascript:, file:, data: …) wird zu „#“ */
export function safeHref(url: string): string {
  const u = url.trim()
  return /^(https:\/\/|tel:|mailto:)/i.test(u) ? esc(u) : '#'
}
