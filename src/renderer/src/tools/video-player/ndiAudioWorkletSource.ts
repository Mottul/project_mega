// Quelltext des NDI-Audio-Tap-AudioWorklets als String: er wird zur Laufzeit
// als Blob-URL geladen (CSP: script-src/worker-src erlauben blob:). Bewusst
// KEINE separate .js-Datei: Assets aus public/ sind nicht importierbar, eine
// Datei-URL müsste dev/paketiert (asar!) unterschiedlich aufgelöst werden --
// der Blob-Weg funktioniert überall identisch.
//
// Der Prozessor sammelt die 128-Frame-Quanten zu ~33-ms-Blöcken (planare
// Float32-Kanäle) und schickt sie per MessagePort raus; das Signal wird
// unverändert durchgereicht (der Graph endet in Gain(0) -> lokal stumm).
export const NDI_AUDIO_WORKLET_SRC = `
class NdiAudioTap extends AudioWorkletProcessor {
  constructor() {
    super()
    this.parts = null
    this.frames = 0
    this.TARGET = 1600 // ~33 ms bei 48 kHz -> ~30 Nachrichten/s
  }

  process(inputs, outputs) {
    const input = inputs[0]
    if (input && input.length > 0 && input[0].length > 0) {
      const output = outputs[0]
      for (let c = 0; c < output.length; c++) {
        const src = input[c] ?? input[0]
        output[c].set(src)
      }
      if (!this.parts) this.parts = input.map(() => [])
      for (let c = 0; c < input.length && c < this.parts.length; c++) {
        this.parts[c].push(new Float32Array(input[c]))
      }
      this.frames += input[0].length
      if (this.frames >= this.TARGET) {
        const channels = this.parts.map((list) => {
          const out = new Float32Array(this.frames)
          let o = 0
          for (const p of list) {
            out.set(p, o)
            o += p.length
          }
          return out
        })
        this.port.postMessage(
          { frames: this.frames, channels },
          channels.map((c) => c.buffer)
        )
        this.parts = null
        this.frames = 0
      }
    }
    return true
  }
}

registerProcessor('ndi-audio-tap', NdiAudioTap)
`
