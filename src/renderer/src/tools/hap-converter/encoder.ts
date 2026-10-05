// Encoder-Wahl im Konverter: Texte der Auswahl und die Anzeige, was „Automatisch“ auf
// DIESEM Rechner tatsächlich nutzt. Entschieden wird mit derselben Funktion wie im main
// (pickEncoder) – die Anzeige kann also nicht von der späteren Konvertierung abweichen.

import { CPU_ENCODERS, pickEncoder, type EncoderFamily } from '@shared/encoderChoice'
import type { ConverterEncoderStatus, ConverterSettings, EncoderInfo } from '@shared/types'

export type EncoderMode = ConverterSettings['encoder']

/** Bei ProRes geht es um Tempo gegen planbare Datenrate – Hardware gibt es nur auf dem Mac. */
export const ENCODER_MODE_LABELS: Record<EncoderFamily, Record<EncoderMode, string>> = {
  h264: { auto: 'Automatisch (GPU, falls vorhanden)', cpu: 'Nur CPU (libx264)' },
  hevc: { auto: 'Automatisch (GPU, falls vorhanden)', cpu: 'Nur CPU (libx265)' },
  prores: { auto: 'Schnell', cpu: 'Normgerecht (prores_ks)' }
}

export interface EncoderView {
  /** genutzter Encoder; null = Erkennung läuft noch */
  encoder: EncoderInfo | null
  hint: string
}

export function encoderView(
  status: ConverterEncoderStatus | null,
  family: EncoderFamily,
  mode: EncoderMode,
  opts: { compat: boolean; keepAlpha: boolean }
): EncoderView {
  if (mode === 'cpu') {
    const enc = CPU_ENCODERS[family]
    return {
      encoder: enc,
      hint:
        family === 'prores'
          ? 'prores_ks: hält Apples ProRes-Datenraten ein (planbare Dateigrößen), aber rund 3× langsamer als „Schnell“.'
          : `${enc.id}: deutlich langsamer als eine GPU, dafür die effizienteste Kompression.`
    }
  }
  if (!status) return { encoder: null, hint: 'Prüfe, welche Encoder hier laufen …' }
  const list = status[family]
  const compat = family === 'h264' && opts.compat
  const enc = pickEncoder(list, family, mode, { compat })
  if (family === 'prores') {
    if (!enc.hardware) {
      return {
        encoder: enc,
        hint: `Genutzt: ${enc.id} – rund 3× so schnell wie „Normgerecht“. Körniges Material liegt aber deutlich über der ProRes-Datenrate (größere Dateien).`
      }
    }
    // Alpha über VideoToolbox ist nicht gesichert -> 4444 mit Transparenz über die CPU
    const alpha = opts.keepAlpha ? ' Clips mit Transparenz laufen über prores_aw (CPU).' : ''
    return { encoder: enc, hint: `Genutzt: ${enc.label}.${alpha}` }
  }
  if (enc.hardware) {
    return {
      encoder: enc,
      hint: `Genutzt: ${enc.label} – um ein Vielfaches schneller als die CPU, Dateien etwas größer.`
    }
  }
  const gpu = list.find((e) => e.hardware)
  if (gpu && compat) {
    return {
      encoder: enc,
      hint: `Für Player-Boxen und TVs läuft H.264 auf der CPU: ${gpu.label} hält Level und Bitraten-Deckel hier nicht sicher ein.`
    }
  }
  return { encoder: enc, hint: `Keine nutzbare GPU gefunden – läuft auf der CPU (${enc.id}).` }
}
