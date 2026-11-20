/* Shared AudioContext + iOS Safari workarounds.
 *
 * iOS quirks handled here:
 *  - An AudioContext only starts if created/resumed inside a user gesture.
 *  - Web Audio is muted by the Ring/Silent switch unless the audio session is
 *    "playback" (Safari 17+: navigator.audioSession) or an <audio> element is
 *    playing (older iOS fallback).
 *  - The context can become "interrupted" after backgrounding or a call.
 *  - Multiple AudioContexts are flaky, so the whole app shares one.
 */
(function () {
  let ctx = null;
  let silentEl = null;

  function setSession(type) {
    try { if (navigator.audioSession) navigator.audioSession.type = type; } catch {}
  }

  // Tiny silent WAV, generated so no asset file is needed.
  function silentWavUrl() {
    const sr = 8000, n = 800; // 0.1s
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE");
    w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, "data"); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }

  function bypassSilentSwitch() {
    if (navigator.audioSession) {
      // Don't override the mic session while the tuner is listening.
      if (navigator.audioSession.type !== "play-and-record") setSession("playback");
      return;
    }
    // Older iOS: a playing <audio> element moves the page into the playback category.
    if (!silentEl) {
      silentEl = document.createElement("audio");
      silentEl.src = silentWavUrl();
      silentEl.loop = true;
      silentEl.setAttribute("playsinline", "");
      silentEl.setAttribute("x-webkit-airplay", "deny");
    }
    silentEl.play().catch(() => {});
  }

  /** Get the shared context, resuming it if needed. Call from a user gesture when possible. */
  function get() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    return ctx;
  }

  /** Must be called synchronously inside a tap/click handler. */
  function unlock() {
    bypassSilentSwitch();
    const c = get();
    // Playing a 1-sample buffer inside the gesture fully unlocks output on iOS.
    const b = c.createBuffer(1, 1, c.sampleRate);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
    return c;
  }

  // Unlock on the first interaction anywhere, and recover after interruptions.
  const first = () => { unlock(); };
  document.addEventListener("touchend", first, { once: true, passive: true });
  document.addEventListener("click", first, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  });

  window.AudioShared = { get, unlock, setSession };
})();
