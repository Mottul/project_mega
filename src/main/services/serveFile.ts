// Datei ausliefern, ganz oder als Bereich (`Range`) – eine Stelle für die Protokolle media:// und
// jingle:// (fileResponse, ipc/registry.ts) und für die Medien der Player-Fernsteuerung
// (sendFile, player/remoteServer.ts). Den Bereich liest shared/range.ts; vorher rechnete jede
// der drei Stellen ihn selbst.

import { createReadStream, statSync, type ReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { pipeline, Readable } from 'node:stream'
import { parseRange } from '@shared/range'
import { logLine } from './log'

/**
 * Antwort für ein eigenes Protokoll (protocol.handle). `cors`: Aus Sicht der Fenster (file://)
 * ist media:// eine fremde Herkunft – ohne die Freigabe liefert ein <video> in WebAudio (Ton
 * der NDI-Ausgabe) lautlos nur Stille.
 */
export async function fileResponse(
  request: Request,
  abs: string,
  contentType: string,
  cors = false
): Promise<Response> {
  const total = (await stat(abs)).size
  const range = parseRange(request.headers.get('Range'), total)
  if (range === 'unerfuellbar') {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${total}` }
    })
  }
  const stream = Readable.toWeb(
    range ? createReadStream(abs, range) : createReadStream(abs)
  ) as ReadableStream
  return new Response(stream, {
    status: range ? 206 : 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(range ? range.end - range.start + 1 : total),
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${total}` } : {}),
      'Accept-Ranges': 'bytes',
      ...(cors ? { 'Access-Control-Allow-Origin': '*' } : {})
    }
  })
}

/**
 * Antwort eines HTTP-Servers (Fernsteuerung). pipeline statt pipe: Bricht das Handy den Abruf ab
 * – beim Spulen im Video ständig –, endet pipe zwar, lässt den Lesestrom aber offen, und die
 * Datei blieb bis zum Beenden der App geöffnet (im Test nachgestellt). pipeline zerstört ihn.
 * Liefert den Lesestrom zurück (für Tests), null bei 416.
 */
export function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  abs: string,
  contentType: string
): ReadStream | null {
  const total = statSync(abs).size
  const range = parseRange(req.headers.range, total)
  if (range === 'unerfuellbar') {
    res.writeHead(416, { 'Content-Range': `bytes */${total}` })
    res.end()
    return null
  }
  const strom = range ? createReadStream(abs, range) : createReadStream(abs)
  res.writeHead(range ? 206 : 200, {
    'Content-Type': contentType,
    'Content-Length': range ? range.end - range.start + 1 : total,
    ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${total}` } : {}),
    'Accept-Ranges': 'bytes'
  })
  pipeline(strom, res, (err) => {
    // Ein Abbruch durch den Empfänger ist der Normalfall, kein Fehler fürs Protokoll
    if (err && (err as NodeJS.ErrnoException).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      logLine('[datei] Ausliefern abgebrochen:', abs, err.message)
    }
  })
  return strom
}
