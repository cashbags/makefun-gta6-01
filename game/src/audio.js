// audio.js — every sound in SOLMAR is synthesised with WebAudio: no audio
// files, no network, nothing to load. Engine hum follows the car's speed,
// the siren wails while the police are after the player, gunshots are
// filtered noise bursts, a low thud marks the city-limit fence, and a small
// sequenced bassline keeps the city humming. Rain is a looping noise bed
// whose gain follows the weather, thunder cracks when a rain window opens,
// and a low jet rumble follows the player's distance to the airport
// terminal. Audio starts on the first user gesture (the title screen
// click); every call is guarded so a headless run without audio never
// throws.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let tensionOsc = null;
  let tensionGain = null;
  let rainGain = null;
  let jetOsc = null;
  let jetGain = null;
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
      // The tension drone: a low sawtooth a semitone above the bass
      // root (A 55 Hz against Bb 58.27 Hz), silent until the heat hits
      // three stars, then fading in under the siren. Dissonance is
      // the cheapest way to make three stars feel different from one:
      // the player hears the city turn on them before they see the
      // extra patrol cars.
      tensionOsc = ctx.createOscillator();
      tensionOsc.type = 'sawtooth';
      tensionOsc.frequency.value = 58.27;
      tensionGain = ctx.createGain();
      tensionGain.gain.value = 0;
      const tensionFilter = ctx.createBiquadFilter();
      tensionFilter.type = 'lowpass';
      tensionFilter.frequency.value = 220;
      tensionOsc.connect(tensionFilter);
      tensionFilter.connect(tensionGain);
      tensionGain.connect(master);
      tensionOsc.start();
      // The rain: a two-second loop of white noise through a lowpass,
      // silent until the weather says otherwise. It is built once
      // here and its gain follows weather.rain in update(), so rain
      // fades in over the same ten seconds the sky does. The noise
      // buffer is filled with Math.random, like every other noise
      // burst in this file — audio is decoration, and no simulation
      // state ever reads it.
      const rainBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const rainData = rainBuf.getChannelData(0);
      for (let i = 0; i < rainData.length; i += 1) rainData[i] = Math.random() * 2 - 1;
      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = rainBuf;
      rainSrc.loop = true;
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'lowpass';
      rainFilter.frequency.value = 1200;
      rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      rainSrc.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(master);
      rainSrc.start();
      // The airport: a low jet rumble, a sawtooth at 48 Hz through a
      // 160 Hz lowpass, whose gain follows the player's distance to
      // the terminal in update(). Near the forecourt it is a constant
      // presence under the music; in the city it is silent.
      jetOsc = ctx.createOscillator();
      jetOsc.type = 'sawtooth';
      jetOsc.frequency.value = 48;
      jetGain = ctx.createGain();
      jetGain.gain.value = 0;
      const jetFilter = ctx.createBiquadFilter();
      jetFilter.type = 'lowpass';
      jetFilter.frequency.value = 160;
      jetOsc.connect(jetFilter);
      jetFilter.connect(jetGain);
      jetGain.connect(master);
      jetOsc.start();
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
    // Thunder: a long low burst when a rain window opens, with a
    // delayed second rumble so the strike has a tail. Called once by
    // main.js when the rain ramps past half strength.
    thunder() {
      noiseBurst(1.2, 120, 0.5);
      setTimeout(() => noiseBurst(0.9, 90, 0.3), 350);
    },
    pickup() {
      blip(660, 0.09, 0.2);
      setTimeout(() => blip(990, 0.12, 0.2), 90);
    },
    // The taxi meter: a bright two-tone ding when a fare is offered
    // and again when one pays out, higher than the pickup blip so the
    // player hears "money" instead of "item". Same blip helper, same
    // guard — audio is decoration, never a crash.
    fare() {
      blip(880, 0.1, 0.22);
      setTimeout(() => blip(1318, 0.16, 0.22), 110);
    },
    // The hidden-package chime: a bright three-note arpeggio, higher
    // than the fare ding and longer than the pickup blip, so a case
    // sounds like a find and not like money or an item. Same blip
    // helper, same guard — audio is decoration, never a crash.
    chime() {
      blip(1046, 0.1, 0.2);
      setTimeout(() => blip(1318, 0.1, 0.2), 90);
      setTimeout(() => blip(1568, 0.16, 0.2), 180);
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
    // two-tone cycle while wanted > 0 and police are near, and the
    // tension drone fades in at three stars and out below it. The
    // fourth argument is the environment `{ rain, airportDist }`:
    // the rain loop follows the weather, and the jet rumble follows
    // the player's distance to the terminal (silent past 150 m).
    update(speed, wanted, policeNear, env) {
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
        tensionGain.gain.setTargetAtTime(wanted >= 3 ? 0.05 : 0, t, 0.5);
        if (rainGain) {
          const rain = env?.rain ?? 0;
          rainGain.gain.setTargetAtTime(rain * 0.12, t, 0.5);
        }
        if (jetGain) {
          const dist = env?.airportDist ?? Infinity;
          const jet = dist < 150 ? 0.06 * (1 - dist / 150) : 0;
          jetGain.gain.setTargetAtTime(jet, t, 0.5);
        }
      } catch { /* see above */ }
    },
  };
}
