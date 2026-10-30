// Drucken aus der Druckvorschau: Die Seiten des fertigen PDFs werden zu Bildern und gehen über
// window.print() an den Druckdialog des Systems. So kommt genau das aufs Papier, was die Vorschau
// zeigt – mit Fußzeile, Umbrüchen und Einpassen (Kurzkarte). Das HTML direkt zu drucken ergäbe etwas
// anderes: Fußzeile und Einpassen entstehen nur bei printToPDF im main. Der Dialog hängt am
// sichtbaren Fenster des Werkzeugs, nicht an einem versteckten.

import { pdfjs } from './pdfjs'

/** Auflösung der Seitenbilder: scharf auf dem Laserdrucker, gut 1 MB je Textseite */
const DRUCK_DPI = 300

/** Seitenmaß in ganzen mm: Chromium legt A4 mit 595,9 × 842,9 pt an, nicht genau 210 × 297 */
const mm = (pt: number): number => Math.round((pt * 25.4) / 72)

/**
 * Druckdialog für die Seiten des PDFs öffnen. Kommt zurück, wenn der Dialog zu ist – window.print()
 * hält dieses Fenster so lange an (Timer und Player ticken im main weiter).
 */
export async function druckeSeiten(
  bytes: Uint8Array,
  titel: string,
  onFortschritt?: (seite: number, von: number) => void
): Promise<void> {
  const lib = await pdfjs()
  // pdf.js übernimmt den Puffer – eine Kopie, damit die Vorschau ihren behält
  const doc = await lib.getDocument({ data: bytes.slice() }).promise
  const wurzel = document.createElement('div')
  wurzel.id = 'druck-seiten'
  const stil = document.createElement('style')
  const titelVorher = document.title
  try {
    let kurz = 210
    let lang = 297
    for (let i = 1; i <= doc.numPages; i++) {
      onFortschritt?.(i, doc.numPages)
      const page = await doc.getPage(i)
      const { width, height } = page.getViewport({ scale: 1 })
      kurz = mm(Math.min(width, height))
      lang = mm(Math.max(width, height))
      // Querformat gedreht auf den hochkant eingelegten Bogen: Im Systemdialog stünde sonst
      // Hochformat, und die Seite käme verkleinert aufs Blatt
      const drehung = (page.rotate + (width > height ? 90 : 0)) % 360
      const vp = page.getViewport({ scale: DRUCK_DPI / 72, rotation: drehung })
      const c = document.createElement('canvas')
      c.width = Math.floor(vp.width)
      c.height = Math.floor(vp.height)
      await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
      const bild = new Image()
      bild.src = c.toDataURL('image/png')
      c.width = 0 // Speicher sofort frei, nicht erst nach der letzten Seite
      await bild.decode()
      wurzel.append(bild)
    }
    // Nur beim Drucken sichtbar; die App füllt sonst genau das Fenster und schnitte alles ab
    stil.textContent = `
      #druck-seiten { display: none }
      @page { size: ${kurz}mm ${lang}mm; margin: 0 }
      @media print {
        html, body { height: auto !important; overflow: visible !important; background: #fff !important }
        body > :not(#druck-seiten) { display: none !important }
        #druck-seiten { display: block }
        #druck-seiten img { display: block; width: ${kurz}mm; height: ${lang}mm; break-after: page }
        #druck-seiten img:last-child { break-after: auto }
      }`
    document.head.append(stil)
    document.body.append(wurzel)
    document.title = titel // Name des Auftrags in der Druckerwarteschlange
    window.print()
  } finally {
    document.title = titelVorher
    wurzel.remove()
    stil.remove()
    void doc.loadingTask.destroy()
  }
}
