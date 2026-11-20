/* Guitar tuner: microphone input → YIN pitch detection → note + cents. */
(function () {
  const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

  // Strings low → high, as MIDI note numbers.
  const TUNINGS = {
    standard: { name: "Standard (EADGBE)", notes: [40, 45, 50, 55, 59, 64] },
    halfDown: { name: "Half-step down (E♭)", notes: [39, 44, 49, 54, 58, 63] },
    dropD:    { name: "Drop D", notes: [38, 45, 50, 55, 59, 64] },
    dropC:    { name: "Drop C", notes: [36, 43, 48, 53, 57, 62] },
    dadgad:   { name: "DADGAD", notes: [38, 45, 50, 55, 57, 62] },
    openG:    { name: "Open G", notes: [38, 43, 50, 55, 59, 62] },
    openD:    { name: "Open D", notes: [38, 45, 50, 54, 57, 62] },
  };

  const IN_TUNE_CENTS = 5;
  const CLOSE_CENTS = 15;

  const midiToFreq = (m, a4) => a4 * Math.pow(2, (m - 69) / 12);
  const freqToMidi = (f, a4) => 69 + 12 * Math.log2(f / a4);
  const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12];
  const octave = (m) => Math.floor(m / 12) - 1;

  /**
   * YIN pitch detector. Returns frequency in Hz or -1.
   * Limited to tauMax for speed (minFreq bound).
   */
  function yin(buf, sampleRate, minFreq = 60, maxFreq = 1200, threshold = 0.12) {
    const tauMin = Math.floor(sampleRate / maxFreq);
    const tauMax = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
    const W = buf.length - tauMax;
    const d = new Float32Array(tauMax + 1);

    // Difference function
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let i = 0; i < W; i++) {
        const delta = buf[i] - buf[i + tau];
        sum += delta * delta;
      }
      d[tau] = sum;
    }

    // Cumulative mean normalized difference
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      d[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
    }

    // Absolute threshold: first dip below threshold, then walk to its local min
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < threshold) {
        while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) return -1;

    // Parabolic interpolation
    let better = tau;
    if (tau > 0 && tau < tauMax) {
      const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
      const denom = 2 * (2 * s1 - s2 - s0);
      if (denom !== 0) better = tau + (s2 - s0) / denom;
    }
    return sampleRate / better;
  }

  class Tuner {
    constructor(opts) {
      this.onUpdate = opts.onUpdate;   // ({freq, midi, cents} | null)
      this.onStatus = opts.onStatus;   // (string)
      this.a4 = 440;
      this.running = false;
      this.history = [];
      this.lastHeard = 0;
    }

    async start() {
      if (this.running) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone not supported (open via http://localhost or https).");
      }
      // iOS: the AudioContext must be created and resumed synchronously inside the
      // tap, before any await, or it stays suspended and the mic reads silence.
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.resume().catch(() => {});
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        this.ctx.close();
        this.ctx = null;
        throw err;
      }
      if (this.ctx.state !== "running") await this.ctx.resume().catch(() => {});
      const src = this.ctx.createMediaStreamSource(this.stream);

      // Gentle low-pass to tame upper harmonics that confuse detection.
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1500;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 4096;
      // Safari only processes nodes that reach the destination, so route through a muted gain.
      const sink = this.ctx.createGain();
      sink.gain.value = 0;
      src.connect(lp).connect(this.analyser).connect(sink).connect(this.ctx.destination);

      // If iOS still left the context suspended, resume on the next tap anywhere.
      this._resumeOnTap = () => this.ctx && this.ctx.resume().catch(() => {});
      document.addEventListener("touchend", this._resumeOnTap, { passive: true });
      document.addEventListener("click", this._resumeOnTap);

      this.buf = new Float32Array(this.analyser.fftSize);
      this.running = true;
      this.history = [];
      this.onStatus("Listening… play a string");
      this._loop();
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.stream?.getTracks().forEach((t) => t.stop());
      document.removeEventListener("touchend", this._resumeOnTap);
      document.removeEventListener("click", this._resumeOnTap);
      this.ctx?.close();
      this.ctx = null;
      this.onUpdate(null);
      this.onStatus("Tuner stopped");
    }

    _loop() {
      if (!this.running) return;
      this.raf = requestAnimationFrame(() => this._loop());

      // ~30 detections/sec is plenty and keeps CPU low.
      const now = performance.now();
      if (now - (this._last || 0) < 33) return;
      this._last = now;

      if (this.ctx.state !== "running") {
        this.onStatus("Audio paused by the browser — tap anywhere to resume");
        return;
      }

      this.analyser.getFloatTimeDomainData(this.buf);

      let rms = 0;
      for (let i = 0; i < this.buf.length; i++) rms += this.buf[i] * this.buf[i];
      rms = Math.sqrt(rms / this.buf.length);

      // iPhone mics with AGC off are quiet, so the noise gate is low.
      let freq = -1;
      if (rms > 0.003) freq = yin(this.buf, this.ctx.sampleRate);
      else if (now - this.lastHeard > 1200) {
        this.onStatus(rms > 0 ? "Listening… play a string" : "No mic signal — check Safari microphone permission");
      }

      if (freq > 0) {
        this.history.push(freq);
        if (this.history.length > 5) this.history.shift();
        const sorted = [...this.history].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const exact = freqToMidi(median, this.a4);
        const midi = Math.round(exact);
        const cents = (exact - midi) * 100;
        this.lastHeard = now;
        this.onUpdate({ freq: median, midi, cents, exact });
      } else if (now - this.lastHeard > 1200) {
        this.history = [];
        this.onUpdate(null);
      }
    }
  }

  /** Short plucked-ish reference tone. */
  let toneCtx;
  function playTone(freq, duration = 1.8) {
    toneCtx = toneCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = toneCtx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    out.connect(ctx.destination);

    // Fundamental + a couple of harmonics for a guitar-ish timbre.
    [[1, 1], [2, 0.4], [3, 0.2]].forEach(([mult, gain]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = freq * mult;
      g.gain.value = gain;
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + duration);
    });
  }

  window.TunerLib = { Tuner, TUNINGS, IN_TUNE_CENTS, CLOSE_CENTS, midiToFreq, noteName, octave, playTone };
})();
