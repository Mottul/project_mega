// Ton für den Stream (rein, getestet): Der Spiegel liefert planare Float32-Kanäle in der Zahl der
// Tonspur (Mono, Stereo, 5.1 …); ffmpeg bekommt immer Stereo, verschränkt als f32le.

/** −3 dB: Anteil von Mitte und Surround im Stereo-Abmisch (Web Audio, „5.1 → Stereo“) */
const M3DB = Math.SQRT1_2

/** Kanäle auf Stereo bringen: Mono doppelt, Quad und 5.1 nach den Regeln von Web Audio. */
export function zuStereo(channels: Float32Array[]): [Float32Array, Float32Array] {
  const n = channels[0]?.length ?? 0
  if (channels.length === 1) return [channels[0], channels[0]]
  if (channels.length === 4) {
    // L R SL SR
    const [l, r, sl, sr] = channels
    const outL = new Float32Array(n)
    const outR = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      outL[i] = 0.5 * (l[i] + sl[i])
      outR[i] = 0.5 * (r[i] + sr[i])
    }
    return [outL, outR]
  }
  if (channels.length === 6) {
    // L R C LFE SL SR – der Dialog liegt in der Mitte, LFE fällt weg
    const [l, r, c, , sl, sr] = channels
    const outL = new Float32Array(n)
    const outR = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      outL[i] = l[i] + M3DB * (c[i] + sl[i])
      outR[i] = r[i] + M3DB * (c[i] + sr[i])
    }
    return [outL, outR]
  }
  // Stereo – und alles Unbekannte: die ersten beiden Kanäle
  return [channels[0], channels[1] ?? channels[0]]
}

/** Stereo verschränkt als f32le (L R L R …) – so liest ffmpeg `-f f32le -ch_layout stereo`. */
export function verschraenkt(channels: Float32Array[], von = 0, anzahl?: number): Buffer {
  const [l, r] = zuStereo(channels)
  const n = Math.max(0, Math.min(anzahl ?? l.length - von, l.length - von))
  const out = Buffer.alloc(n * 8)
  for (let i = 0; i < n; i++) {
    out.writeFloatLE(l[von + i], i * 8)
    out.writeFloatLE(r[von + i], i * 8 + 4)
  }
  return out
}

/** Stille in Stereo-f32le */
export function stille(samples: number): Buffer {
  return Buffer.alloc(Math.max(0, samples) * 8)
}
