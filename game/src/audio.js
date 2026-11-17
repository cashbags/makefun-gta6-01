// audio.js — every sound in SOLMAR is synthesised with WebAudio: no audio
// files, no network, nothing to load. Engine hum follows the car's speed,
// the siren wails while the police are after the player, gunshots are
// filtered noise bursts, a low thud marks the city-limit fence, and a small
// sequenced bassline keeps the city humming. Audio starts on the first user
// gesture (the title screen click); every call is guarded so a headless run
// without audio never throws.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;
  const state = { started: false };

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      state.started = true;
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  // A lazy bassline: A minor, one note per eighth at 112 BPM, plus a hat
  // tick. Scheduled one bar ahead, forever, while the context lives.
  const BASS = [55, 0, 55, 65.41, 55, 0, 49, 55, 55, 0, 55, 65.41, 82.41, 0, 73.42, 65.41];
  function startMusic() {
    if (musicTimer) return;
    musicTimer = setInterval(() => {
      if (!ctx || muted) return;
      const stepDur = 60 / 112 / 2;
      const t0 = ctx.currentTime + 0.05;
      for (let i = 0; i < 8; i += 1) {
        const note = BASS[(musicStep + i) % BASS.length];
        const t = t0 + i * stepDur;
        if (note > 0) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = note;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.16, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.9);
          o.connect(g);
          g.connect(master);
          o.start(t);
          o.stop(t + stepDur);
        }
        if (i % 2 === 0) {
          const n = ctx.createBufferSource();
          const buf = ctx.createBuffer(1, 2205, 44100);
          const d = buf.getChannelData(0);
          for (let s = 0; s < d.length; s += 1) d[s] = (Math.random() * 2 - 1) * (1 - s / d.length);
          n.buffer = buf;
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 6000;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.05, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
          n.connect(hp);
          hp.connect(g);
          g.connect(master);
          n.start(t);
        }
      }
      musicStep = (musicStep + 8) % BASS.length;
    }, 8 * (60 / 112 / 2) * 1000);
  }

  function noiseBurst(dur, filterFreq, gainValue, type = 'lowpass') {
    if (!ctx || muted) return;
    try {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = filterFreq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gainValue, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
    } catch { /* audio is decoration, never a crash */ }
  }

  function blip(freq, dur, gainValue = 0.2, type = 'sine') {
    if (!ctx || muted) return;
    try {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gainValue, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur);
    } catch { /* see above */ }
  }

  return {
    get started() {
      return state.started;
    },
    start() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    get muted() {
      return muted;
    },
    shot() {
      noiseBurst(0.14, 1800, 0.5);
      blip(160, 0.08, 0.25, 'square');
    },
    copShot() {
      noiseBurst(0.12, 1400, 0.25);
    },
    crash() {
      noiseBurst(0.3, 300, 0.6);
    },
    // A fence thud: shorter and lower than a crash, for the city-limit
    // fence. Same filtered-noise burst, half the length and a lower
    // filter, so the player hears "edge of the map" instead of "wreck".
    thud() {
      noiseBurst(0.15, 180, 0.45);
    },
    pickup() {
      blip(660, 0.09, 0.2);
      setTimeout(() => blip(990, 0.12, 0.2), 90);
    },
    mission() {
      blip(523, 0.12, 0.22);
      setTimeout(() => blip(659, 0.12, 0.22), 120);
      setTimeout(() => blip(784, 0.2, 0.22), 240);
    },
    fail() {
      blip(220, 0.25, 0.2, 'sawtooth');
      setTimeout(() => blip(174, 0.35, 0.2, 'sawtooth'), 200);
    },
    busted() {
      blip(440, 0.15, 0.2, 'square');
      setTimeout(() => blip(349, 0.15, 0.2, 'square'), 150);
      setTimeout(() => blip(293, 0.3, 0.2, 'square'), 300);
    },
    // Called every frame: engine pitch follows speed, siren wails on a
    // two-tone cycle while wanted > 0 and police are near.
    update(speed, wanted, policeNear) {
      if (!ctx || muted) return;
      try {
        const t = ctx.currentTime;
        engineGain.gain.setTargetAtTime(Math.min(0.14, 0.02 + Math.abs(speed) * 0.0035), t, 0.1);
        engineOsc.frequency.setTargetAtTime(45 + Math.abs(speed) * 4.2, t, 0.1);
        if (wanted > 0 && policeNear) {
          sirenGain.gain.setTargetAtTime(0.045, t, 0.2);
          const phase = Math.floor(t * 1.6) % 2;
          sirenOsc.frequency.setTargetAtTime(phase === 0 ? 700 : 950, t, 0.05);
        } else {
          sirenGain.gain.setTargetAtTime(0, t, 0.2);
        }
      } catch { /* see above */ }
    },
  };
}
