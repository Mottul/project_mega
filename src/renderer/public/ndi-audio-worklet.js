// AudioWorklet des NDI-Audio-Taps: sammelt die 128-Frame-Quanten des
// WebAudio-Graphen zu ~33-ms-Blöcken (planare Float32-Kanäle) und schickt sie
// per MessagePort an den Renderer, der sie via IPC an den NDI-Sender im
// main-Prozess weiterreicht. Der Prozessor reicht das Signal unverändert an
// seinen Ausgang durch (der Graph endet in einem Gain(0) -> lokal stumm).
class NdiAudioTap extends AudioWorkletProcessor {
  constructor() {
    super()
    this.parts = null // Float32Array[][] je Kanal
    this.frames = 0
    this.TARGET = 1600 // ~33 ms bei 48 kHz -> ~30 IPC-Nachrichten/s
  }

  process(inputs, outputs) {
    const input = inputs[0]
    if (input && input.length > 0 && input[0].length > 0) {
      // durchreichen (Pass-Through), damit der Graph "gezogen" wird
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
