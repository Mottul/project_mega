// Welcher Encoder für H.264, H.265 und ProRes? Rein und gemeinsam genutzt: der main-Prozess
// wählt damit je Auftrag, der Konverter zeigt damit vorab an, was „Automatisch“ hier nutzt.

import type { EncoderInfo } from './types'

export type EncoderFamily = 'h264' | 'hevc' | 'prores'

/** Klassische CPU-Encoder („Nur CPU“ bzw. ProRes „normgerecht“). */
export const CPU_ENCODERS: Record<EncoderFamily, EncoderInfo> = {
  h264: { id: 'libx264', label: 'libx264 (CPU)', hardware: false, compat: true },
  hevc: { id: 'libx265', label: 'libx265 (CPU)', hardware: false },
  prores: { id: 'prores_ks', label: 'prores_ks (CPU, normgerecht)', hardware: false }
}

/**
 * ProRes ohne GPU, rund 3× so schnell wie prores_ks und meist sogar genauer – hält aber die
 * ProRes-Datenrate nicht ein: körniges Material wird deutlich größer (gemessen bis 3×),
 * saubere Grafik eher kleiner. prores_ks trifft Apples Datenraten.
 */
export const PRORES_FAST: EncoderInfo = {
  id: 'prores_aw',
  label: 'prores_aw (CPU, schnell)',
  hardware: false
}

/**
 * Encoder für einen Auftrag aus der geprüften Liste (schnellster zuerst). 'auto' = schnellster
 * passender, 'cpu' = klassischer CPU-Encoder. ProRes mit Alpha nur über die CPU-Encoder (Alpha
 * über VideoToolbox ist nicht gesichert); H.264 für USB-/LED-Player nur über Encoder, deren
 * Probelauf mit Level und Bitraten-Deckel bestanden hat.
 */
export function pickEncoder(
  available: EncoderInfo[],
  family: EncoderFamily,
  mode: 'auto' | 'cpu',
  need: { alpha?: boolean; compat?: boolean } = {}
): EncoderInfo {
  if (mode === 'cpu') return CPU_ENCODERS[family]
  return (
    available.find(
      (e) =>
        !(family === 'prores' && need.alpha && e.hardware) &&
        !(family === 'h264' && need.compat && !e.compat)
    ) ?? CPU_ENCODERS[family]
  )
}
