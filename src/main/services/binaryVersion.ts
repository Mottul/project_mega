// Version eines Hilfsprogramms (ffmpeg, yt-dlp) abfragen – IMMER asynchron. `--version` startet
// einen Prozess, und yt-dlp.exe (ein Python-Paket, das sich bei jedem Aufruf neu entpackt) braucht
// dafür unter Windows 1,5–2 s, eine frisch geladene Datei samt Virenscan mehr. Mit spawnSync stand
// in der Zeit der ganze main-Prozess: Kurz nach dem Start (yt-dlp-Prüfung) nahm die App so lange
// keine Klicks an, und jede Anfrage eines Fensters hing.
import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'

// Je Aufruf und Änderungszeit: Eine ersetzte Datei (Aktualisierung) wird neu gefragt. Gemerkt wird
// das Promise selbst, damit gleichzeitige Abfragen (Status beim Start und das geöffnete App-Menü)
// nur EINEN Prozess starten.
const cache = new Map<string, { stamp: number; version: Promise<string | null> }>()

/**
 * Erste Zeile der Ausgabe von `bin args` oder null (fehlt, nicht ausführbar, Fehlercode,
 * Zeitüberschreitung). `shell`: ein bloßer Name auf dem PATH (unter Windows nur über die Shell
 * auflösbar) – dann nur mit festen Namen und Argumenten aufrufen, sie werden nicht maskiert.
 */
export function binaryVersion(
  bin: string,
  args: string[],
  opts: { timeoutMs: number; shell?: boolean }
): Promise<string | null> {
  let stamp = 0
  try {
    stamp = statSync(bin).mtimeMs
  } catch {
    // Name auf dem PATH -> kein Zeitstempel, der Eintrag gilt über den Namen
  }
  const key = [bin, ...args].join('\0')
  const hit = cache.get(key)
  if (hit && hit.stamp === stamp) return hit.version
  const version = new Promise<string | null>((resolve) => {
    // mit Shell als eine Befehlszeile: Argumente neben shell:true meldet Node als veraltet
    const [file, list] = opts.shell ? [[bin, ...args].join(' '), []] : [bin, args]
    try {
      execFile(
        file,
        list,
        { windowsHide: true, timeout: opts.timeoutMs, shell: opts.shell ?? false },
        (err, stdout) => resolve(err ? null : String(stdout).split('\n')[0].trim() || null)
      )
    } catch {
      resolve(null) // ungültiger Aufruf wirft sofort statt über den Rückruf
    }
  })
  const eintrag = { stamp, version }
  cache.set(key, eintrag)
  // Ein Fehlschlag gilt nicht bis zum Neustart: Der erste Start einer frisch installierten Binary
  // dauert unter macOS (Prüfung, Rosetta) mitunter länger als das Zeitlimit – in der CI meldete
  // die gepackte App deshalb „kein ffmpeg“, obwohl es lief (22.10.2026). Die nächste Abfrage fragt neu.
  void version.then((v) => {
    if (v === null && cache.get(key) === eintrag) cache.delete(key)
  })
  return version
}
