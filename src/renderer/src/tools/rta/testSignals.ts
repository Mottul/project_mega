// Testhilfen des RTA: Signale (Sinus, weißes und rosa Rauschen, reproduzierbar) und ein
// nachgebauter Web-Audio-Analysator (Blackman-Fenster, FFT, 1/N, dB) – so prüfen die Tests die
// Bänder mit genau den Zahlen, die getFloatFrequencyData im Browser liefert.

/** reproduzierbarer Zufall (LCG) */
export function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function sine(f: number, amp: number, fs: number, n: number, phase = 0): Float64Array {
  return Float64Array.from(
    { length: n },
    (_, i) => amp * Math.sin((2 * Math.PI * f * i) / fs + phase)
  )
}

/** weißes Rauschen, gleichverteilt mit Effektivwert `rms` */
export function white(rms: number, n: number, seed = 1): Float64Array {
  const rnd = seeded(seed)
  const a = rms * Math.sqrt(3)
  return Float64Array.from({ length: n }, () => a * (2 * rnd() - 1))
}

/** rosa Rauschen (−3 dB/Oktave, Filter nach Paul Kellet), auf Effektivwert `rms` normiert */
export function pink(rms: number, n: number, seed = 1): Float64Array {
  const w = white(1, n, seed)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const x = w[i]
    b0 = 0.99886 * b0 + x * 0.0555179
    b1 = 0.99332 * b1 + x * 0.0750759
    b2 = 0.969 * b2 + x * 0.153852
    b3 = 0.8665 * b3 + x * 0.3104856
    b4 = 0.55 * b4 + x * 0.5329522
    b5 = -0.7616 * b5 - x * 0.016898
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362
    b6 = x * 0.115926
  }
  let ms = 0
  for (let i = 0; i < n; i++) ms += out[i] * out[i]
  const g = rms / Math.sqrt(ms / n)
  for (let i = 0; i < n; i++) out[i] *= g
  return out
}

/** FFT (Radix 2, an Ort), re/im der Länge 2^k */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
}

/**
 * Wie AnalyserNode.getFloatFrequencyData (smoothingTimeConstant 0): die letzten `n` Samples,
 * Blackman-Fenster (a = 0,16), FFT, Betrag/N, 20·log10 – n/2 Werte.
 */
export function analyserDb(signal: Float64Array, n: number): Float32Array {
  const off = signal.length - n
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / n) + 0.08 * Math.cos((4 * Math.PI * i) / n)
    re[i] = signal[off + i] * w
  }
  fft(re, im)
  return Float32Array.from(
    { length: n / 2 },
    (_, k) => 20 * Math.log10(Math.hypot(re[k], im[k]) / n)
  )
}

/** Spektren aller Analysatoren für dasselbe Signal (je die letzten N Samples) */
export function analyserSpectra(signal: Float64Array, sizes: readonly number[]): Float32Array[] {
  return sizes.map((n) => analyserDb(signal, n))
}
