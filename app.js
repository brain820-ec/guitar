/* UI wiring for tabs, tuner and metronome. */
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const store = {
    get(k, d) { try { const v = localStorage.getItem("fb." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fb." + k, JSON.stringify(v)); } catch {} },
  };

  /* ---------------- theme ---------------- */
  const themeBtn = $("#themeToggle");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    themeMeta.content = t === "light" ? "#f3f1ec" : "#14161a";
    themeBtn.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme");
  }
  applyTheme(document.documentElement.dataset.theme || "dark");
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next);
    store.set("theme", next);
  });

  /* ---------------- tabs ---------------- */
  function showPanel(id) {
    $$(".tab").forEach((t) => {
      const on = t.dataset.panel === id;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    $$(".panel").forEach((p) => (p.hidden = p.id !== id));
    store.set("tab", id);
  }
  $$(".tab").forEach((t) => t.addEventListener("click", () => showPanel(t.dataset.panel)));
  showPanel(store.get("tab", "tuner"));

  /* ---------------- tuner ---------------- */
  const { Tuner, TUNINGS, IN_TUNE_CENTS, CLOSE_CENTS, midiToFreq, noteName, octave, playTone } = window.TunerLib;

  // Gauge ticks: −50..+50 cents mapped to −60°..+60°
  const ticks = $("#ticks");
  for (let c = -50; c <= 50; c += 5) {
    const a = ((c / 50) * 60 - 90) * (Math.PI / 180);
    const major = c % 25 === 0;
    const r1 = 130, r2 = major ? 112 : 120;
    const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
    l.setAttribute("x1", 150 + r1 * Math.cos(a));
    l.setAttribute("y1", 150 + r1 * Math.sin(a));
    l.setAttribute("x2", 150 + r2 * Math.cos(a));
    l.setAttribute("y2", 150 + r2 * Math.sin(a));
    l.setAttribute("class", major ? "tick major" : "tick");
    ticks.appendChild(l);
  }

  const card = $(".tuner-card");
  const needle = $("#needle");
  const noteEl = $("#note");
  const freqEl = $("#freq");
  const centsEl = $("#cents");
  const statusEl = $("#status");
  const stringsEl = $("#strings");
  const tuningSelect = $("#tuningSelect");
  const a4El = $("#a4Value");

  let a4 = store.get("a4", 440);
  let tuningKey = store.get("tuning", "standard");
  if (!TUNINGS[tuningKey]) tuningKey = "standard";
  let needleAngle = 0;

  for (const [key, t] of Object.entries(TUNINGS)) {
    const opt = new Option(t.name, key);
    tuningSelect.add(opt);
  }
  tuningSelect.value = tuningKey;

  function renderStrings() {
    stringsEl.innerHTML = "";
    TUNINGS[tuningKey].notes.forEach((m, i) => {
      const b = document.createElement("button");
      b.className = "string-btn";
      b.dataset.midi = m;
      b.innerHTML = `${noteName(m)}<small>${6 - i} · ${octave(m)}</small>`;
      b.title = `${midiToFreq(m, a4).toFixed(2)} Hz`;
      b.addEventListener("click", () => {
        playTone(midiToFreq(m, a4));
        b.classList.add("playing");
        setTimeout(() => b.classList.remove("playing"), 600);
      });
      stringsEl.appendChild(b);
    });
  }
  renderStrings();

  tuningSelect.addEventListener("change", () => {
    tuningKey = tuningSelect.value;
    store.set("tuning", tuningKey);
    renderStrings();
  });

  function setA4(v) {
    a4 = Math.max(415, Math.min(466, v));
    a4El.textContent = a4;
    tuner.a4 = a4;
    store.set("a4", a4);
    renderStrings();
  }
  $$("[data-a4]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); setA4(a4 + +b.dataset.a4); }));

  function setNeedle(cents) {
    const target = Math.max(-50, Math.min(50, cents)) / 50 * 60;
    needleAngle += (target - needleAngle) * 0.35; // smoothing
    needle.style.transform = `rotate(${needleAngle}deg)`;
  }

  // Track how long the note has been in tune so string chips light up only when stable.
  let inTuneSince = 0;
  let chimed = false; // one chime per in-tune episode

  const chimeToggle = $("#chimeToggle");
  chimeToggle.checked = store.get("chime", true);
  chimeToggle.addEventListener("change", () => store.set("chime", chimeToggle.checked));

  const tuner = new Tuner({
    onStatus: (s) => (statusEl.textContent = s),
    onUpdate: (r) => {
      card.classList.remove("in-tune", "close", "off");
      const btns = stringsEl.querySelectorAll(".string-btn");
      btns.forEach((b) => b.classList.remove("target"));

      if (!r) {
        noteEl.textContent = "—";
        freqEl.textContent = "0.0 Hz";
        centsEl.textContent = "±0¢";
        setNeedle(0);
        inTuneSince = 0;
        chimed = false;
        return;
      }

      // Find nearest string in current tuning (in semitones, using exact pitch).
      let nearest = null, best = Infinity;
      btns.forEach((b) => {
        const d = Math.abs(r.exact - +b.dataset.midi);
        if (d < best) { best = d; nearest = b; }
      });
      if (nearest && best < 1.5) nearest.classList.add("target");

      noteEl.innerHTML = `${noteName(r.midi)}<sub>${octave(r.midi)}</sub>`;
      freqEl.textContent = `${r.freq.toFixed(1)} Hz`;
      const c = Math.round(r.cents);
      centsEl.textContent = `${c > 0 ? "+" : c < 0 ? "−" : "±"}${Math.abs(c)}¢`;
      setNeedle(r.cents);

      const abs = Math.abs(r.cents);
      if (abs <= IN_TUNE_CENTS) {
        card.classList.add("in-tune");
        if (!inTuneSince) inTuneSince = performance.now();
        if (performance.now() - inTuneSince > 600 && nearest && +nearest.dataset.midi === r.midi) {
          nearest.classList.add("tuned");
          if (!chimed) {
            chimed = true;
            if (chimeToggle.checked) tuner.chime();
          }
        }
        statusEl.textContent = "In tune ✓";
      } else {
        inTuneSince = 0;
        // Re-arm only once clearly out of tune, so hovering at ±5¢ doesn't re-chime.
        if (abs > IN_TUNE_CENTS * 2) chimed = false;
        card.classList.add(abs <= CLOSE_CENTS ? "close" : "off");
        statusEl.textContent = r.cents < 0 ? "Too flat — tighten ↑" : "Too sharp — loosen ↓";
      }
    },
  });
  tuner.a4 = a4;
  a4El.textContent = a4;

  const tunerBtn = $("#tunerToggle");
  tunerBtn.addEventListener("click", async () => {
    if (tuner.running) {
      tuner.stop();
      tunerBtn.textContent = "Start tuner";
      stringsEl.querySelectorAll(".tuned").forEach((b) => b.classList.remove("tuned"));
      return;
    }
    try {
      await tuner.start();
      tunerBtn.textContent = "Stop tuner";
    } catch (err) {
      statusEl.textContent = err.name === "NotAllowedError"
        ? "Microphone permission denied"
        : err.message || "Could not access microphone";
    }
  });

  /* ---------------- metronome ---------------- */
  const { Metronome, tempoName } = window.MetronomeLib;
  const beatsEl = $("#beats");
  const bpmEl = $("#bpmValue");
  const bpmSlider = $("#bpmSlider");
  const tempoNameEl = $("#tempoName");
  const beatsValEl = $("#beatsValue");
  const metroBtn = $("#metroToggle");

  const metro = new Metronome({
    onTick: (beat, sub) => {
      beatsEl.querySelectorAll(".beat").forEach((d, i) => d.classList.toggle("on", i === beat && sub === 0));
      if (sub === 0 && beat >= 0) {
        // brief flash: remove "on" shortly after
        const dot = beatsEl.children[beat];
        setTimeout(() => dot && dot.classList.remove("on"), 100);
      }
    },
  });

  metro.bpm = store.get("bpm", 120);
  metro.setBeats(store.get("beats", 4));
  metro.accents = store.get("accents", metro.accents).slice(0, metro.beatsPerBar);
  metro.setBeats(metro.beatsPerBar);
  metro.subdivision = store.get("subdiv", 1);
  metro.sound = store.get("sound", "click");
  metro.volume = store.get("vol", 80) / 100;

  $("#subdivSelect").value = metro.subdivision;
  $("#soundSelect").value = metro.sound;
  $("#volSlider").value = Math.round(metro.volume * 100);

  function renderBeats() {
    beatsEl.innerHTML = "";
    metro.accents.forEach((kind, i) => {
      const d = document.createElement("button");
      d.className = `beat ${kind}`;
      d.title = `Beat ${i + 1}: ${kind} (tap to change)`;
      d.addEventListener("click", () => {
        const order = ["accent", "normal", "mute"];
        metro.accents[i] = order[(order.indexOf(metro.accents[i]) + 1) % order.length];
        store.set("accents", metro.accents);
        renderBeats();
      });
      beatsEl.appendChild(d);
    });
    beatsValEl.textContent = metro.beatsPerBar;
  }
  renderBeats();

  function setBpm(v) {
    metro.bpm = Math.max(30, Math.min(300, Math.round(v)));
    bpmEl.textContent = metro.bpm;
    bpmSlider.value = metro.bpm;
    tempoNameEl.textContent = tempoName(metro.bpm);
    store.set("bpm", metro.bpm);
  }
  setBpm(metro.bpm);

  bpmSlider.addEventListener("input", () => setBpm(+bpmSlider.value));

  // +/- buttons with press-and-hold repeat
  $$("[data-bpm]").forEach((b) => {
    let t, iv;
    const step = () => setBpm(metro.bpm + +b.dataset.bpm);
    const stopHold = () => { clearTimeout(t); clearInterval(iv); };
    b.addEventListener("pointerdown", () => {
      step();
      t = setTimeout(() => (iv = setInterval(step, 60)), 400);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, stopHold));
  });

  $$("[data-beats]").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    const n = Math.max(1, Math.min(12, metro.beatsPerBar + +b.dataset.beats));
    metro.setBeats(n);
    store.set("beats", n);
    store.set("accents", metro.accents);
    renderBeats();
  }));

  $("#subdivSelect").addEventListener("change", (e) => { metro.subdivision = +e.target.value; store.set("subdiv", metro.subdivision); });
  $("#soundSelect").addEventListener("change", (e) => { metro.sound = e.target.value; store.set("sound", metro.sound); });
  $("#volSlider").addEventListener("input", (e) => { metro.volume = e.target.value / 100; store.set("vol", +e.target.value); });

  function toggleMetro() {
    const on = metro.toggle();
    metroBtn.textContent = on ? "Stop" : "Start";
  }
  metroBtn.addEventListener("click", toggleMetro);

  // Tap tempo: average of the last few intervals, reset after 2s idle.
  let taps = [];
  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 2) {
      const intervals = taps.slice(1).map((t, i) => t - taps[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(60000 / avg);
    }
  }
  $("#tapBtn").addEventListener("click", tap);

  document.addEventListener("keydown", (e) => {
    if ($("#metronome").hidden) return;
    if (e.target.matches("input, select")) return;
    const map = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -5, ArrowUp: 5 };
    if (e.code === "Space") { e.preventDefault(); toggleMetro(); }
    else if (e.key in map) { e.preventDefault(); setBpm(metro.bpm + map[e.key]); }
    else if (e.key.toLowerCase() === "t") tap();
  });
})();
