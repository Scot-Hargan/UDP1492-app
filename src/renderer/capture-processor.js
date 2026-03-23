class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.frameSamples = Math.max(1, opts.frameSamples || 960);
    this.gain = Math.max(0.01, Math.min(4.0, opts.gain || 1.0));
    this.buf = new Float32Array(this.frameSamples);
    this.idx = 0;
    this.port.onmessage = (ev) => {
      const d = ev.data || {};
      if (d.type === 'config') {
        if (typeof d.gain === 'number') {
          this.gain = Math.max(0.01, Math.min(4.0, d.gain));
        }
        if (typeof d.frameSamples === 'number' && d.frameSamples > 0) {
          this.frameSamples = d.frameSamples|0;
          this.buf = new Float32Array(this.frameSamples);
          this.idx = 0;
        }
      }
    };
  }
  static get parameterDescriptors() { return []; }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch0 = input[0];
    for (let i = 0; i < ch0.length; i++) {
      let s = ch0[i] * this.gain;
      if (s > 1.0) s = 1.0; else if (s < -1.0) s = -1.0;
      this.buf[this.idx++] = s;
      if (this.idx >= this.frameSamples) {
        let peak = 0;
        const out = new Int16Array(this.frameSamples);
        for (let j = 0; j < this.frameSamples; j++) {
          const v = this.buf[j];
          if (Math.abs(v) > peak) peak = Math.abs(v);
          out[j] = v < 0 ? (v * 0x8000) : (v * 0x7FFF);
        }
        this.port.postMessage({ type: 'frame', buf: out.buffer, peak }, [out.buffer]);
        this.idx = 0;
      }
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
