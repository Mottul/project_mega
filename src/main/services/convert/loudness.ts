// Erster Durchgang der Lautheit (Video-Konverter und Player-Import): die Tonspur durch
// loudnorm messen. Schlägt die Messung fehl, wird einstufig angeglichen statt den Auftrag
// scheitern zu lassen – der eigentliche Lauf zeigt echte Probleme ohnehin.

import type { ConvertPlan } from '@shared/convertPlan'
import {
  loudnessOutcome,
  loudnessResultStep,
  parseLoudnormOutput,
  type LoudnessOutcome
} from '@shared/loudness'
import { logLine } from '../log'
import { buildLoudnessMeasureArgs } from './args'
import { FfmpegCanceledError, runFfmpeg } from './runFfmpeg'

/** Messen, falls der Plan angleichen will; null = keine Lautheit gewünscht. */
export async function measureLoudness(
  plan: ConvertPlan,
  input: string,
  opts: { signal?: AbortSignal; onProgress?: (p: number) => void } = {}
): Promise<LoudnessOutcome | null> {
  const target = plan.audio?.loudness
  const args = buildLoudnessMeasureArgs(plan, input)
  if (!target || !args) return null
  let tail = ''
  try {
    await runFfmpeg(args, {
      durationSec: plan.durationSec,
      signal: opts.signal,
      onProgress: opts.onProgress,
      onStderr: (t) => {
        tail = t
      }
    })
  } catch (err) {
    if (err instanceof FfmpegCanceledError) throw err
    logLine(
      '[lautheit] Messung fehlgeschlagen, gleiche einstufig an:',
      input,
      err instanceof Error ? err.message : String(err)
    )
    return { kind: 'unmeasured' }
  }
  const outcome = loudnessOutcome(target, parseLoudnormOutput(tail))
  logLine('[lautheit]', input, '->', loudnessResultStep(target, outcome))
  return outcome
}
