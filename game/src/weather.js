// weather.js — Solmar Bay's sky: a day/night cycle and seeded rain.
//
// The clock is simulation time, not wall time. One full day takes
// WEATHER.dayLengthSeconds of play (480 s: eight real minutes),
// starting at 10:00, so a normal session sees afternoon slide into
// dusk and night without the player waiting around for it. Rain
// comes in windows drawn from a forked stream at build time — the
// first window never opens before WEATHER.firstRainAfterSeconds
// (360 s), so the staged screenshots (all five seconds or shorter)
// always stay dry and deterministic, while a longer session will
// drive through weather.
//
// Everything here is a pure function of accumulated dt and the
// seed: stepWeather advances the clock and the rain ramps,
// applyWeather paints the lights and the fog, and the rain drops
// fall from w.time alone. No Date.now(), no Math.random() — run
// the same steps twice and the sky is identical, which is what
// the deterministic replay check needs. Wet roads are a handling
// fact, not just a look: grip falls from 1 to WEATHER.gripWet
// while it rains, and main.js passes that grip into
// stepPlayerCar, so a rainy chase really does slide wider than a
// dry one.
import * as THREE from 'three';
import { WEATHER, TAXI } from './config.js';

// Interpolate two hex colours by t in [0, 1]. Written out by hand
// instead of THREE.Color.lerp because the sky blends three stops
// (night, dusk, day) and the caller wants the stops named.
function mixHex(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// The sky as a stop table over daylight (0 night .. 1 noon): at
// full night the sky is the night stop, at 0.25 daylight it has
// reached dusk, at 0.55 it has reached day, and past that it stays
// day. Fog and background share the dusk stop so the horizon never
// disagrees with the sky above it, and the sun colour tracks the
// same blend. Blending between neighbouring stops keeps dusk a
// colour the sky passes through, not a jump between two palettes.
const SKY_STOPS = [
  { at: 0, bg: 0x0e1626, fog: 0x1a2436, sun: 0x8fa8d8 },
  { at: 0.25, bg: 0xc98a6a, fog: 0xb98a72, sun: 0xff9a5a },
  { at: 0.55, bg: 0x8ec3e8, fog: 0x9fc3d8, sun: 0xfff2d0 },
  { at: 1, bg: 0x8ec3e8, fog: 0x9fc3d8, sun: 0xfff2d0 },
];

function skyAt(daylight) {
  let lo = SKY_STOPS[0];
  let hi = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i += 1) {
    if (daylight >= SKY_STOPS[i].at && daylight <= SKY_STOPS[i + 1].at) {
      lo = SKY_STOPS[i];
      hi = SKY_STOPS[i + 1];
      break;
    }
  }
  const span = hi.at - lo.at;
  const t = span > 0 ? clamp01((daylight - lo.at) / span) : 1;
  return {
    bg: mixHex(lo.bg, hi.bg, t),
    fog: mixHex(lo.fog, hi.fog, t),
    sun: mixHex(lo.sun, hi.sun, t),
  };
}

// Rain windows, drawn once at build from the fork: the first opens
// no earlier than firstRainAfterSeconds, each lasts 45–90 s, and
// the gap after one is 7–13 minutes of play, so rain is an event
// the player notices and drives through, not the default weather.
// The schedule is fixed per seed — the same seed always rains at
// the same times — which keeps the staged shots dry and the replay
// reproducible.
export function createWeather(rng) {
  // One call on the fork, deterministic per seed: five windows, the
  // first no earlier than firstRainAfterSeconds, each 45–90 s long,
  // gaps of 7–13 minutes between them.
  const windows = rng.sampleSchedule(
    WEATHER.rainWindows,
    WEATHER.firstRainAfterSeconds,
    45, 90, 420, 780,
  );
  // The rain drops: 900 drops in a 60 m box, each with a fixed
  // offset and fall speed drawn from the fork. Their positions are
  // a function of w.time only (see stepRain), so the rain looks
  // the same on every replay of the same steps and costs the
  // seeded stream nothing after build time.
  const drops = [];
  for (let i = 0; i < 900; i += 1) {
    drops.push({
      dx: rng.range(-30, 30),
      dz: rng.range(-30, 30),
      y0: rng.range(0, 30),
      speed: rng.range(18, 26),
    });
  }
  return {
    time: 0, // seconds of play since the world was built
    clockMinutes: WEATHER.startClockMinutes, // 10:00 at build
    rain: 0, // 0 dry .. 1 full rain, ramped over 10 s either way
    raining: false, // true while inside a window (before the ramp)
    windows,
    drops,
    // Derived each step; main.js and the HUD read these, never the
    // raw clock, so the presentation stays in one place.
    daylight: 1, // 0 night .. 1 noon
    grip: 1, // 1 dry .. WEATHER.gripWet in full rain
    phase: 'Day', // Night | Dawn | Day | Dusk
    sunIntensity: 1.6,
    hemiIntensity: 0.9,
    sunColor: SKY_STOPS[2].sun,
    bgColor: SKY_STOPS[2].bg,
    fogColor: SKY_STOPS[2].fog,
  };
}

// Advance the sky by dt seconds of play. The clock runs 3
// game-minutes per real second (a 480 s day), the rain ramps in
// and out over 10 s at the edges of each window, and the light is
// derived from the sun's elevation: sunrise 06:00, noon 12:00,
// sunset 18:00, with a dusk band either side of the horizon where
// the sun goes orange.
export function stepWeather(w, dt) {
  w.time += dt;
  w.clockMinutes = (WEATHER.startClockMinutes + (w.time * 1440) / WEATHER.dayLengthSeconds) % 1440;
  // Rain: inside a window the target is 1, outside it is 0; the
  // ramp moves toward the target at 0.1 per second, so a window
  // opens and closes over ten seconds instead of snapping.
  let inWindow = false;
  for (const win of w.windows) {
    if (w.time >= win.start && w.time < win.start + win.dur) {
      inWindow = true;
      break;
    }
  }
  w.raining = inWindow;
  const target = inWindow ? 1 : 0;
  w.rain += Math.max(-dt * 0.1, Math.min(dt * 0.1, target - w.rain));
  w.grip = 1 - (1 - WEATHER.gripWet) * w.rain;
  // Sun elevation: 06:00 is the horizon (angle 0), 12:00 is
  // overhead, 18:00 is the horizon again, midnight is straight
  // down. Daylight is the elevation clamped to [0, 1] and eased,
  // so noon is full light and the hour around sunset is a long
  // orange slide, not a switch.
  const angle = ((w.clockMinutes - 360) / 1440) * Math.PI * 2;
  const elevation = Math.sin(angle);
  w.daylight = clamp01(elevation * 1.6 + 0.15);
  const m = w.clockMinutes;
  if (m >= 330 && m < 420) w.phase = 'Dawn';
  else if (m >= 1020 && m < 1110) w.phase = 'Dusk';
  else if (m >= 420 && m < 1020) w.phase = 'Day';
  else w.phase = 'Night';
  // Light levels follow daylight; night never goes fully black
  // (the moon is a dim blue sun) so the player can still drive
  // at 02:00.
  w.sunIntensity = 0.18 + 1.42 * w.daylight;
  w.hemiIntensity = 0.22 + 0.68 * w.daylight;
  // Colour comes from the stop table: night blue up to 0.25
  // daylight, then dusk orange through 0.55, then noon
  // white-gold above it.
  const sky = skyAt(w.daylight);
  w.sunColor = sky.sun;
  w.bgColor = sky.bg;
  w.fogColor = sky.fog;
}

// Paint the derived light onto the scene: the sun and hemisphere
// intensities and colours, the background, and the fog. Called
// every step from main.js, after stepWeather, so the frame always
// matches the clock. The sun's position never moves — only its
// colour and strength do — so shadows (such as they are, with
// Lambert materials) stay stable while the light changes.
export function applyWeather(scene, sun, hemi, w) {
  sun.intensity = w.sunIntensity;
  sun.color.setHex(w.sunColor);
  hemi.intensity = w.hemiIntensity;
  scene.background.setHex(w.bgColor);
  scene.fog.color.setHex(w.fogColor);
  // Rain darkens the fog a little further: a wet night feels
  // closer than a dry one, and the shorter view distance sells
  // the weather.
  if (w.rain > 0) {
    scene.fog.near = 140 - 60 * w.rain;
    scene.fog.far = 460 - 180 * w.rain;
  } else {
    scene.fog.near = 140;
    scene.fog.far = 460;
  }
}

// The rain itself: one THREE.Points cloud of 900 drops in a box
// that follows the player, so rain is always visible around the
// camera and never needs a city-sized particle system. Positions
// are a pure function of w.time and the seeded drop offsets, so
// the rain is deterministic per step count.
export function createRainPoints(scene) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(900 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xaac4d8,
    size: 0.22,
    transparent: true,
    opacity: 0,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.visible = false;
  points.frustumCulled = false;
  scene.add(points);
  return points;
}

export function stepRain(points, w, playerX, playerZ) {
  const attr = points.geometry.getAttribute('position');
  const arr = attr.array;
  for (let i = 0; i < w.drops.length; i += 1) {
    const d = w.drops[i];
    // Fall: y0 drops at `speed` m/s from 30 m up, wrapping to the
    // top when it hits the ground, so the fall is a loop of w.time.
    const fallen = (d.y0 - w.time * d.speed) % 30;
    const y = fallen < 0 ? fallen + 30 : fallen;
    arr[i * 3] = playerX + d.dx;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = playerZ + d.dz;
  }
  attr.needsUpdate = true;
  points.visible = w.rain > 0.02;
  points.material.opacity = 0.55 * w.rain;
}

// The in-world clock as the HUD shows it: "10:00", "23:47",
// always two digits, always the simulation clock, never the wall
// clock.
export function clockString(w) {
  const h = Math.floor(w.clockMinutes / 60);
  const m = Math.floor(w.clockMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// One-line weather summary for the HUD chip: "14:32 · Day", or
// "19:05 · Dusk · Rain" while a window is open.
export function weatherLabel(w) {
  return `${clockString(w)} · ${w.phase}${w.rain > 0.15 ? ' · Rain' : ''}`;
}

// The cab-work rain surge: a fare quoted while the rain is
// properly falling (past half strength, not a drizzle at the edge
// of a window) pays TAXI.rainSurge — 1.25× — because wet nights
// put fewer cabs on the road. The threshold is the same 0.5 the
// thunder uses, so the surge and the thunder always agree about
// when it is really raining. Pure: the same rain level always
// gives the same multiplier.
export function rainFareMultiplier(rain) {
  return rain > 0.5 ? TAXI.rainSurge : 1;
}
