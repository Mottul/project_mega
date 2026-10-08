// Vorschaubilder für das Storyboard des Video-Generators: beliebige Quelldateien (auch außerhalb
// der Player-Bibliothek), klein gerechnet in userData/vgen-cache/thumbs und über
// media://vgen/<datei> ausgeliefert – kein file://, kein neues Schema (SICHERHEIT.md).
// Begrenzt parallel und je Datei/Zeitpunkt nur einmal, auch bei 100+ Fotos.

import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { MEDIA_PROTOCOL } from '@shared/ipc-contracts'
import { hash53 } from '@shared/videoGenPlan'
import { isSafeAbsolutePath } from '@shared/videoGenProject'
import { logLine } from '../log'
import { commit, ensureDirs, haveAll, removeQuietly, tempName, thumbsDir } from './videoGenCache'
import { runFfmpeg } from './runFfmpeg'

const MAX_PARALLEL = 3
let active = 0
const waiting: (() => void)[] = []
const pending = new Map<string, Promise<string | null>>()

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiting.shift()?.()
  }
}

/**
 * Vorschaubild (320 bzw. 960 px breit) einer Datei zum Zeitpunkt `timeSec` (Videos; Bilder: null).
 * Liefert die media://-Adresse oder null (Datei fehlt, nicht lesbar).
 */
export async function videoGenThumb(
  path: string,
  timeSec: number | null,
  width: 320 | 960 = 320
): Promise<string | null> {
  if (!isSafeAbsolutePath(path)) return null
  let st
  try {
    st = await stat(path)
  } catch {
    return null
  }
  if (!st.isFile()) return null
  const t =
    typeof timeSec === 'number' && Number.isFinite(timeSec) && timeSec > 0
      ? Math.min(timeSec, 24 * 3600)
      : 0
  const key = hash53(
    JSON.stringify([path.toLowerCase(), st.size, st.mtimeMs, Math.round(t * 1000), width])
  )
  const name = `${key}.jpg`
  const out = join(thumbsDir(), name)
  const url = `${MEDIA_PROTOCOL}://vgen/${name}`
  if (await haveAll([out])) return url
  const running = pending.get(key)
  if (running) return running
  const job = withSlot(async () => {
    await ensureDirs(thumbsDir())
    const tmp = tempName(out, key.slice(0, 6))
    try {
      await runFfmpeg([
        ...['-hide_banner', '-nostdin', '-v', 'error'],
        ...(t > 0 ? ['-ss', t.toFixed(3)] : []),
        ...['-i', path, '-frames:v', '1', '-vf', `scale=${width}:-2:flags=bicubic`, '-q:v', '4'],
        ...['-y', tmp]
      ])
      await commit(tmp, out)
      return url
    } catch (err) {
      await removeQuietly(tmp)
      logLine('[vgen] Vorschaubild fehlgeschlagen:', path, err instanceof Error ? err.message : err)
      return null
    }
  }).finally(() => pending.delete(key))
  pending.set(key, job)
  return job
}
