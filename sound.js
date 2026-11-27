/* A short synthesized piano-like tone; no recording or downloaded audio required. */
(() => {
  const notes = [60, 62, 64, 67, 69, 72, 74, 76]; // C major pentatonic, C4–E5.
  let context, master, lastNote = -1, enabled = true;
  const voices = new Set();
  try { enabled = localStorage.getItem('plopdrobe-sound') !== 'off'; } catch {}
  const toggle = document.querySelector('#sound-toggle');
  function updateToggle() {
    toggle.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
    toggle.setAttribute('aria-pressed', String(enabled));
  }
  updateToggle();
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem('plopdrobe-sound', enabled ? 'on' : 'off'); } catch {}
    if (master && context) master.gain.setTargetAtTime(enabled ? .3 : 0, context.currentTime, .015);
    updateToggle();
  });
  window.playPlopTone = async () => {
    if (!enabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = .3;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.ratio.value = 8;
        master.connect(limiter).connect(context.destination);
      }
      if (context.state === 'suspended') await context.resume();
      if (!enabled || context.state !== 'running') return;
      // Bound overlap during rapid clicking.
      if (voices.size >= 6) voices.values().next().value.stop();
      const pool = notes.filter(note => note !== lastNote);
      lastNote = pool[Math.floor(Math.random() * pool.length)];
      const frequency = 440 * 2 ** ((lastNote - 69) / 12);
      const now = context.currentTime;
      const oscillators = [], gains = [];
      let stopped = false;
      const voice = { stop() {
        if (stopped) return;
        stopped = true;
        oscillators.forEach(oscillator => { try { oscillator.stop(); } catch {} oscillator.disconnect(); });
        gains.forEach(gain => gain.disconnect());
        voices.delete(voice);
      }};
      voices.add(voice);
      // Hammer-like fast attack, rapidly decaying overtones, short damped release.
      [1, 2.002, 3.008, 4.016, 5.03].forEach((ratio, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency * ratio;
        const amplitude = [.45, .2, .09, .035, .012][index] * (.88 + Math.random() * .12);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(amplitude, now + .004);
        gain.gain.exponentialRampToValueAtTime(Math.max(amplitude * .08, .0001), now + .10 + .07 / (index + 1));
        gain.gain.exponentialRampToValueAtTime(.0001, now + .29);
        gain.gain.linearRampToValueAtTime(0, now + .33);
        oscillator.connect(gain).connect(master);
        oscillators.push(oscillator); gains.push(gain);
        oscillator.start(now); oscillator.stop(now + .35);
      });
      oscillators[0].onended = () => voice.stop();
    } catch {
      // Audio restrictions must never interrupt the drawing.
    }
  };
})();
