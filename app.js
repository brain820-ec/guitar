/* UI wiring for tabs, theme, tuner and metronome — sloth edition. */
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const SVG_NS = "http://www.w3.org/2000/svg";

  const store = {
    get(k, d) { try { const v = localStorage.getItem("fb." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fb." + k, JSON.stringify(v)); } catch {} },
  };

  /* ---------------- little SVG pieces ---------------- */
  const art = {
    hibiscus: () => `<svg viewBox="-20 -20 40 40" aria-hidden="true">
      ${[0, 72, 144, 216, 288].map((r) => `<ellipse class="hib-petal" cx="0" cy="-10" rx="8" ry="11" transform="rotate(${r})"/>`).join("")}
      <circle class="hib-center" r="4.5"/>
      <path class="hib-stamen" d="M0 0 L7 -9"/><circle class="hib-center" cx="8" cy="-10" r="2.2"/>
    </svg>`,
    leaf: () => `<svg viewBox="-20 -20 40 40" aria-hidden="true">
      <g transform="rotate(-35)">
        <path class="leaf-body" d="M0 -16 C 11 -9 11 9 0 16 C -11 9 -11 -9 0 -16 z"/>
        <path class="leaf-vein" d="M0 -12 L0 13 M0 -3 L5 -7 M0 4 L-5 0 M0 9 L4 6"/>
      </g>
    </svg>`,
    twig: () => `<svg viewBox="-20 -20 40 40" aria-hidden="true">
      <path class="twig-line" d="M-6 14 Q -2 0 4 -14 M-1 2 L 7 -2 M 1 -7 L -5 -11"/>
    </svg>`,
    claw: () => `<svg class="claw-tick" viewBox="0 0 24 24" aria-hidden="true">
      <circle class="pad" cx="12" cy="15" r="7"/>
      <path class="nail" d="M7 11 Q 4 6 6 2 M12 9 Q 11 4 13 1 M17 11 Q 19 6 18 2"/>
    </svg>`,
  };

  /* ---------------- theme ---------------- */
  const themeBtn = $("#themeToggle");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    themeMeta.content = t === "light" ? "#e9f0e7" : "#0e1913";
    themeBtn.setAttribute("aria-label", t === "light" ? "Sloth is awake — switch to dark theme" : "Sloth is asleep — switch to light theme");
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

  /* ---------------- sloth facts ---------------- */
  const FACTS = [
    "Sloths only climb down from their trees about once a week — to poop.",
    "Sloths are surprisingly strong swimmers and can hold their breath for up to 40 minutes.",
    "Algae grows in sloth fur, giving them a greenish tint that works as camouflage.",
    "A single sloth's fur can be home to moths, beetles, algae and fungi — a tiny ecosystem.",
    "Three-toed sloths can turn their heads about 270 degrees.",
    "It can take a sloth weeks to fully digest a single meal of leaves.",
    "All sloths have three toes on their back feet — “two-toed” and “three-toed” refer to their front claws.",
    "Three-toed sloths have extra neck vertebrae, which helps them look around without moving.",
    "Baby sloths cling to their mothers for months, riding around on their bellies.",
    "Ancient ground sloths were as big as elephants.",
    "A sloth's body temperature is low for a mammal and drifts with the weather.",
    "Two-toed sloths are mostly active at night.",
    "Moving slowly helps sloths avoid being spotted by eagles and other predators.",
    "Sloth claws can grow to around 10 cm long — perfect for hanging, not for walking.",
    "Female three-toed sloths make a high-pitched whistle to call for a mate.",
    "Sloths often travel less than 40 metres in a whole day.",
    "In captivity sloths can sleep 15+ hours a day; wild sloths nap closer to 10.",
  ];
  let factIdx = Math.floor(Math.random() * FACTS.length);
  const factText = $("#factText");
  factText.textContent = FACTS[factIdx];
  $("#fact").addEventListener("click", () => {
    factIdx = (factIdx + 1 + Math.floor(Math.random() * (FACTS.length - 1))) % FACTS.length;
    factText.textContent = FACTS[factIdx];
  });

  /* ---------------- tuner ---------------- */
  const { Tuner, TUNINGS, IN_TUNE_CENTS, CLOSE_CENTS, midiToFreq, noteName, octave, playTone } = window.TunerLib;

  // Scale under the hanging sloth: −50..+50 cents → −45°..+45° around the pivot (150, 22), radius 160.
  const PIVOT = { x: 150, y: 22 }, R = 160, MAX_DEG = 45;
  const ticks = $("#ticks");
  for (let c = -50; c <= 50; c += 5) {
    const phi = (c / 50) * MAX_DEG * (Math.PI / 180);
    const major = c % 25 === 0;
    const r1 = R + 6, r2 = major ? R - 10 : R - 4;
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", PIVOT.x + r1 * Math.sin(phi));
    l.setAttribute("y1", PIVOT.y + r1 * Math.cos(phi));
    l.setAttribute("x2", PIVOT.x + r2 * Math.sin(phi));
    l.setAttribute("y2", PIVOT.y + r2 * Math.cos(phi));
    l.setAttribute("class", major ? "tick major" : "tick");
    ticks.appendChild(l);
  }

  const card = $(".tuner-card");
  const gauge = $("#gauge");
  const slothNeedle = $("#slothNeedle");
  const noteEl = $("#note");
  const freqEl = $("#freq");
  const centsEl = $("#cents");
  const statusEl = $("#status");
  const loaderEl = $("#loader");
  const stringsEl = $("#strings");
  const tuningSelect = $("#tuningSelect");
  const a4El = $("#a4Value");

  let a4 = store.get("a4", 440);
  let tuningKey = store.get("tuning", "standard");
  if (!TUNINGS[tuningKey]) tuningKey = "standard";
  let swing = 0;
  const tunedStrings = new Set();
  let celebrated = false;

  for (const [key, t] of Object.entries(TUNINGS)) tuningSelect.add(new Option(t.name, key));
  tuningSelect.value = tuningKey;

  function resetTuned() {
    tunedStrings.clear();
    celebrated = false;
    stringsEl.querySelectorAll(".tuned").forEach((b) => b.classList.remove("tuned"));
  }

  function renderStrings() {
    stringsEl.innerHTML = "";
    tunedStrings.clear();
    celebrated = false;
    TUNINGS[tuningKey].notes.forEach((m, i) => {
      const b = document.createElement("button");
      b.className = "string-btn";
      b.dataset.midi = m;
      b.innerHTML = `${noteName(m)}<small>${6 - i} · ${octave(m)}</small>${art.claw()}`;
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

  // Flat → sloth swings left; sharp → swings right; in tune → hangs straight down.
  function setSwing(cents, snap) {
    const target = (Math.max(-50, Math.min(50, cents)) / 50) * MAX_DEG;
    swing = snap ? target : swing + (target - swing) * 0.3;
    slothNeedle.style.transform = `rotate(${-swing}deg)`;
  }

  function setMood(m) {
    gauge.classList.remove("mood-sleepy", "mood-close", "mood-off", "mood-happy");
    gauge.classList.add("mood-" + m);
  }

  // Sloth-voiced status lines.
  function slothSays(cents) {
    const abs = Math.abs(cents);
    if (abs <= IN_TUNE_CENTS) return "Purrfect. Er… slothfect ✓";
    if (cents < 0) return abs <= CLOSE_CENTS ? "Almost… tighten a smidge ↑" : "Hmm… a little loose. Tighten it, slowly… ↑";
    return abs <= CLOSE_CENTS ? "So close… ease off a smidge ↓" : "Whoa, too tight. Loosen it, slowly… ↓";
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
        setSwing(0);
        setMood("sleepy");
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
      setSwing(r.cents);
      statusEl.textContent = slothSays(r.cents);

      const abs = Math.abs(r.cents);
      if (abs <= IN_TUNE_CENTS) {
        card.classList.add("in-tune");
        setMood("happy");
        if (!inTuneSince) inTuneSince = performance.now();
        if (performance.now() - inTuneSince > 600 && nearest && +nearest.dataset.midi === r.midi) {
          nearest.classList.add("tuned");
          tunedStrings.add(nearest.dataset.midi);
          if (!chimed) {
            chimed = true;
            if (chimeToggle.checked) tuner.chime();
          }
          if (!celebrated && tunedStrings.size === btns.length) {
            celebrated = true;
            setTimeout(celebrate, 700);
          }
        }
      } else {
        inTuneSince = 0;
        // Re-arm only once clearly out of tune, so hovering at ±5¢ doesn't re-chime.
        if (abs > IN_TUNE_CENTS * 2) chimed = false;
        const close = abs <= CLOSE_CENTS;
        card.classList.add(close ? "close" : "off");
        setMood(close ? "close" : "off");
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
      resetTuned();
      setSwing(0, true);
      setMood("sleepy");
      return;
    }
    // Show the crawling sloth while the mic wakes up (kept on screen briefly so it's seen).
    const t0 = performance.now();
    loaderEl.hidden = false;
    statusEl.hidden = true;
    const hideLoader = () => { loaderEl.hidden = true; statusEl.hidden = false; };
    try {
      await tuner.start();
      tunerBtn.textContent = "Stop tuner";
      setTimeout(hideLoader, Math.max(0, 1600 - (performance.now() - t0)));
    } catch (err) {
      hideLoader();
      statusEl.textContent = err.name === "NotAllowedError"
        ? "The sloth can’t hear you — microphone permission denied"
        : err.message || "Could not access microphone";
    }
  });

  /* ---------------- celebration ---------------- */
  const celebrateEl = $("#celebrate");
  let celebrateTimer;
  function celebrate() {
    celebrateEl.querySelectorAll(".petal").forEach((p) => p.remove());
    for (let i = 0; i < 16; i++) {
      const p = document.createElement("div");
      p.className = "petal";
      p.innerHTML = i % 4 === 3 ? art.leaf() : art.hibiscus();
      p.style.left = `${Math.random() * 100}%`;
      p.style.animationDuration = `${5 + Math.random() * 4}s`; // slow motion
      p.style.animationDelay = `${Math.random() * 2.5}s`;
      p.style.setProperty("--spin", `${(Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 300)}deg`);
      const s = 0.7 + Math.random() * 0.8;
      p.style.width = p.style.height = `${34 * s}px`;
      celebrateEl.appendChild(p);
    }
    // restart the arm animation
    const arm = celebrateEl.querySelector(".rock-arm");
    arm.style.animation = "none"; void arm.getBoundingClientRect(); arm.style.animation = "";
    celebrateEl.hidden = false;
    clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(closeCelebrate, 9000);
  }
  function closeCelebrate() { celebrateEl.hidden = true; clearTimeout(celebrateTimer); }
  celebrateEl.addEventListener("click", closeCelebrate);

  /* ---------------- metronome ---------------- */
  const { Metronome, tempoName } = window.MetronomeLib;
  const beatsEl = $("#beats");
  const bpmEl = $("#bpmValue");
  const bpmSlider = $("#bpmSlider");
  const tempoNameEl = $("#tempoName");
  const beatsValEl = $("#beatsValue");
  const metroBtn = $("#metroToggle");
  const bobSloth = $("#tapSloth");
  const bobHead = $("#bobHead");
  const bubble = $("#bubble");

  function nod(accent) {
    const beatMs = 60000 / metro.bpm;
    const sleepy = metro.bpm < 80;
    const deg = (accent ? 16 : 10) * (sleepy ? 1.2 : 1);
    bobHead.animate(
      [{ transform: "rotate(0deg)" }, { transform: `rotate(${deg}deg)`, offset: sleepy ? 0.55 : 0.3 }, { transform: "rotate(0deg)" }],
      { duration: Math.min(beatMs * 0.85, sleepy ? 900 : 480), easing: sleepy ? "ease-in-out" : "ease-out" }
    );
  }

  const metro = new Metronome({
    onTick: (beat, sub) => {
      beatsEl.querySelectorAll(".beat").forEach((d, i) => d.classList.toggle("on", i === beat && sub === 0));
      if (sub === 0 && beat >= 0) {
        const dot = beatsEl.children[beat];
        setTimeout(() => dot && dot.classList.remove("on"), 120);
        if (metro.accents[beat] !== "mute") nod(metro.accents[beat] === "accent");
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
  if (!$("#soundSelect").value) { metro.sound = "click"; $("#soundSelect").value = "click"; }
  $("#volSlider").value = Math.round(metro.volume * 100);

  const BEAT_ART = { accent: art.hibiscus, normal: art.leaf, mute: art.twig };
  const BEAT_LABEL = { accent: "hibiscus (accent)", normal: "leaf (normal)", mute: "bare twig (muted)" };

  function renderBeats() {
    beatsEl.innerHTML = "";
    metro.accents.forEach((kind, i) => {
      const d = document.createElement("button");
      d.className = `beat ${kind}`;
      d.innerHTML = BEAT_ART[kind]();
      d.title = `Beat ${i + 1}: ${BEAT_LABEL[kind]} — tap to change`;
      d.setAttribute("aria-label", d.title);
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
    bobSloth.classList.remove("sleepy", "awake", "panic");
    bobSloth.classList.add(metro.bpm < 80 ? "sleepy" : metro.bpm > 200 ? "panic" : "awake");
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

  // Tap the sloth: average of the last few intervals, reset after 2s idle.
  let taps = [];
  let bubbleTimer;
  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 6) taps.shift();
    nod(false);
    if (taps.length >= 2) {
      const intervals = taps.slice(1).map((t, i) => t - taps[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = 60000 / avg;
      setBpm(bpm);
      if (bpm > 220) {
        bubble.hidden = false;
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => (bubble.hidden = true), 1600);
      }
    }
  }
  $("#tapBtn").addEventListener("click", tap);
  bobSloth.addEventListener("click", tap);

  document.addEventListener("keydown", (e) => {
    if ($("#metronome").hidden) return;
    if (e.target.matches("input, select")) return;
    const map = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -5, ArrowUp: 5 };
    if (e.code === "Space") { e.preventDefault(); toggleMetro(); }
    else if (e.key in map) { e.preventDefault(); setBpm(metro.bpm + map[e.key]); }
    else if (e.key.toLowerCase() === "t") tap();
  });

  // Dev/preview hook: ?celebrate shows the all-tuned celebration.
  if (new URLSearchParams(location.search).has("celebrate")) setTimeout(celebrate, 300);
})();
