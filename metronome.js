/* Metronome using the Web Audio lookahead scheduler for sample-accurate timing. */
(function () {
  const LOOKAHEAD_MS = 25;        // how often the scheduler wakes
  const SCHEDULE_AHEAD_S = 0.12;  // how far ahead it schedules audio

  class Metronome {
    constructor({ onTick }) {
      this.onTick = onTick;         // (beatIndex, subIndex) — fired in sync with audio
      this.bpm = 120;
      this.beatsPerBar = 4;
      this.subdivision = 1;
      this.sound = "click";
      this.volume = 0.8;
      this.accents = ["accent", "normal", "normal", "normal"]; // accent | normal | mute
      this.running = false;
      this.queue = [];
    }

    setBeats(n) {
      this.beatsPerBar = n;
      const next = [];
      for (let i = 0; i < n; i++) next.push(this.accents[i] ?? (i === 0 ? "accent" : "normal"));
      this.accents = next;
    }

    start() {
      if (this.running) return;
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.running = true;
      this.beat = 0;
      this.sub = 0;
      this.nextTime = this.ctx.currentTime + 0.06;
      this.queue = [];
      this.timer = setInterval(() => this._schedule(), LOOKAHEAD_MS);
      this._schedule();
      this._draw();
    }

    stop() {
      this.running = false;
      clearInterval(this.timer);
      cancelAnimationFrame(this.raf);
      this.queue = [];
      this.onTick(-1, -1);
    }

    toggle() { this.running ? this.stop() : this.start(); return this.running; }

    _schedule() {
      while (this.nextTime < this.ctx.currentTime + SCHEDULE_AHEAD_S) {
        this._playAt(this.nextTime, this.beat, this.sub);
        this.queue.push({ time: this.nextTime, beat: this.beat, sub: this.sub });

        const step = 60 / this.bpm / this.subdivision;
        this.nextTime += step;
        this.sub++;
        if (this.sub >= this.subdivision) {
          this.sub = 0;
          this.beat = (this.beat + 1) % this.beatsPerBar;
        }
      }
    }

    _playAt(time, beat, sub) {
      const kind = sub === 0 ? this.accents[beat] || "normal" : "sub";
      if (kind === "mute") return;

      const ctx = this.ctx;
      const level = { accent: 1, normal: 0.7, sub: 0.35 }[kind] * this.volume;
      const pitch = { accent: 1.5, normal: 1, sub: 0.8 }[kind];

      const g = ctx.createGain();
      g.connect(ctx.destination);
      const o = ctx.createOscillator();

      if (this.sound === "bonk") {
        // coconut knock: two hollow tones with a quick downward pitch drop
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(430 * pitch, time);
        o.frequency.exponentialRampToValueAtTime(250 * pitch, time + 0.08);
        o2.type = "triangle";
        o2.frequency.setValueAtTime(690 * pitch, time);
        o2.frequency.exponentialRampToValueAtTime(400 * pitch, time + 0.06);
        g2.gain.value = 0.35;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(level * 1.3, time + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
        o.connect(g);
        o2.connect(g2).connect(g);
        o.start(time); o2.start(time);
        o.stop(time + 0.15); o2.stop(time + 0.15);
        return;
      }
      if (this.sound === "chirp") {
        // little sloth squeak: fast upward sweep with a flutter
        const p = { accent: 1.2, normal: 1, sub: 0.85 }[kind];
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 38;
        lfoGain.gain.value = 70 * p;
        lfo.connect(lfoGain).connect(o.frequency);
        o.type = "sine";
        o.frequency.setValueAtTime(1900 * p, time);
        o.frequency.exponentialRampToValueAtTime(3000 * p, time + 0.05);
        o.frequency.exponentialRampToValueAtTime(2500 * p, time + 0.1);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(level * 0.45, time + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);
        o.connect(g);
        o.start(time); lfo.start(time);
        o.stop(time + 0.12); lfo.stop(time + 0.12);
        return;
      }
      if (this.sound === "beep") {
        o.type = "sine";
        o.frequency.value = 880 * pitch;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(level, time + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
        o.connect(g);
        o.start(time);
        o.stop(time + 0.1);
      } else if (this.sound === "wood") {
        o.type = "sine";
        o.frequency.setValueAtTime(900 * pitch, time);
        o.frequency.exponentialRampToValueAtTime(500 * pitch, time + 0.04);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1000 * pitch;
        bp.Q.value = 3;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(level * 1.4, time + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
        o.connect(bp).connect(g);
        o.start(time);
        o.stop(time + 0.07);
      } else {
        // click: very short, bright square burst
        o.type = "square";
        o.frequency.value = 1600 * pitch;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(level * 0.6, time + 0.001);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
        o.connect(g);
        o.start(time);
        o.stop(time + 0.04);
      }
    }

    _draw() {
      if (!this.running) return;
      const now = this.ctx.currentTime;
      let last = null;
      while (this.queue.length && this.queue[0].time <= now) last = this.queue.shift();
      if (last) this.onTick(last.beat, last.sub);
      this.raf = requestAnimationFrame(() => this._draw());
    }
  }

  function tempoName(bpm) {
    if (bpm < 60) return "Snoozing";
    if (bpm < 80) return "Hanging Out";
    if (bpm < 110) return "Leisurely Climb";
    if (bpm < 150) return "Strolling";
    if (bpm <= 200) return "Surprisingly Brisk";
    return "Sloth Panic!";
  }

  window.MetronomeLib = { Metronome, tempoName };
})();
