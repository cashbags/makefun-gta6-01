// main.js — SOLMAR's boot and one loop.
// The game lives in four screens (title, playing, paused,
// busted/wasted) and one fixed-step simulation: input is sampled
// every frame, the world advances in 1/60 s steps, and the renderer
// paints what is there. The simulation owns the player, the cars,
// the pedestrians, the police, the wanted level, the missions, the
// weather and the roadblocks; the HUD and the minimap read it every
// frame. The city ends at a visible fence (BOUNDS in config.js):
// hitting it thuds and toasts instead of letting the player drive
// onto bare ground. ?seed=N fixes the world. ?shot=start|drive|
// chase|mission|airport stages a scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { STEP, CITY, PLAYER, CAR, WANTED, COMBAT, MISSIONS, SAVE_KEY, ROADBLOCK, TAXI, PACKAGES, ECONOMY, PAINT } from './config.js';
import { createRandom } from './rng.js';
import { createCity, resolveCollisions } from './city.js';
import { createCar, createTraffic, stepTraffic, stepPlayerCar, placeCar, createRoadblock, clearRoadblock, chaseSpeed, isTaxiCar, resprayCar, paintHex } from './vehicles.js';
import { createPed, createCop, createAirportCrowd, placePerson, stepPeds, stepCops, nearestPed, tagPassenger, PED_COUNT } from './peds.js';
import { createMissions, currentObjective, currentStage, currentWaypoint, stepMissions, onMissionStart, storyArc, heatCommentary, cabWorkLine, packageLine } from './missions.js';
import { createWeather, stepWeather, applyWeather, createRainPoints, stepRain, weatherLabel } from './weather.js';
import { createTaxiPlane, stepTaxiPlane, AIRPORT } from './airport.js';
import { createTaxiJob, createTaxiMarkers, taxiHudLine, stopName } from './taxi.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : (Math.floor(Math.random() * 4294967296) >>> 0);
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const hud = createHud(document);

// --- World construction (seeded, deterministic) ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec3e8);
scene.fog = new THREE.Fog(0x9fc3d8, 140, 460);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x8a7a5a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
sun.position.set(120, 180, 80);
scene.add(sun);

const city = createCity(rng);
scene.add(city.group);

// The sky and the airport's moving parts are built from forks,
// after the city, so they cost the main stream nothing: the
// weather's rain schedule, the rain drops, the taxiing plane and
// the forecourt crowd all draw from their own streams. The crowd
// joins the same peds array as the street pedestrians, so
// gunshots, run-overs and the respawn loop treat them like anyone
// else.
const weather = createWeather(rng.fork());
const rainPoints = createRainPoints(scene);
const taxiPlane = createTaxiPlane(scene);

// Cab work: the taxi job and its two marker meshes (pickup yellow,
// destination green). The job draws from its own stream seeded
// from the game seed, so offering a fare costs the shared stream
// nothing and the world above builds exactly as it did before cab
// work existed. taxiPassenger is the waiting fare's ped, standing
// at the pickup kerb until they board — null when no fare is
// waiting.
const taxi = createTaxiJob(seed);
const taxiMarkers = createTaxiMarkers(scene);
let taxiPassenger = null;

const traffic = createTraffic(city, rng.fork(), 14, scene);
const parked = [];
for (const spot of city.parkedSpots) {
  const car = createCar(spot.kind, spot.x, spot.z, spot.angle);
  car.parked = true;
  car.mission = spot.mission ?? null;
  placeCar(car, scene);
  parked.push(car);
}
const peds = [];
// Shuffle a forked copy of the sidewalk list so no two pedestrians
// start on the same point: rng.pick could hand the same spot to two
// peds and stack them on one paving stone. The shuffle draws from
// the fork, never from the main stream, so the traffic and police
// sequences after this loop draw exactly as they did before it.
const pedSpots = rng.fork().shuffle(city.pedSpots);
for (let i = 0; i < PED_COUNT; i += 1) {
  const spot = pedSpots[i % pedSpots.length];
  const ped = createPed(rng.fork(), spot.x + rng.range(-2, 2), spot.z + rng.range(-2, 2));
  placePerson(ped, scene);
  peds.push(ped);
}
// The airport crowd walks the terminal forecourt, not the streets.
for (const ped of createAirportCrowd(city, rng.fork(), scene)) peds.push(ped);
const footCops = [];
const policeCars = [];

// Waypoint beacon: a glowing pillar the player can see across the
// city.
const beacon = new THREE.Group();
const beaconPole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.7, 0.7, 60, 10, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
);
beaconPole.position.y = 30;
beacon.add(beaconPole);
const beaconGem = new THREE.Mesh(
  new THREE.OctahedronGeometry(1.6),
  new THREE.MeshBasicMaterial({ color: 0xf2c94c }),
);
beaconGem.position.y = 12;
beacon.add(beaconGem);
beacon.visible = false;
scene.add(beacon);

// Pickups: health crosses at the hospital, ammo boxes by the garage.
const pickups = [];
function addPickup(kind, x, z) {
  const mat = new THREE.MeshLambertMaterial({ color: kind === 'health' ? 0x3fbf5a : 0xe0c04a });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat);
  mesh.position.set(x, 0.8, z);
  scene.add(mesh);
  pickups.push({ kind, x, z, mesh, taken: false, timer: 0 });
}
addPickup('health', city.markers.hospital.x, city.markers.hospital.z + 12);
addPickup('health', city.markers.safehouse.x + 8, city.markers.safehouse.z);
addPickup('ammo', city.markers.garage.x - 10, city.markers.garage.z + 10);
addPickup('ammo', city.markers.docks.x + 6, city.markers.docks.z - 8);

// Hidden packages: twelve gold cases at the fixed spots city.js
// computed from the markers (city.packageSpots). They spin and bob
// like the pickups, but they are one-shot — once found, a case is
// gone for the save, and the twelfth pays the completion bonus.
// The meshes are built here, from the spots, with no RNG: the hunt
// is the same hunt on every seed replay.
const packages = [];
for (const spot of city.packageSpots) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshLambertMaterial({ color: 0xf2c94c }),
  );
  mesh.position.set(spot.x, 0.8, spot.z);
  scene.add(mesh);
  packages.push({ x: spot.x, z: spot.z, key: spot.key, mesh, found: false });
}

const missions = createMissions(city.markers);

// --- Player state ---
const player = {
  x: -30, z: 14, y: 0, vy: 0, angle: Math.PI, heading: Math.PI,
  health: PLAYER.maxHealth, armor: 0,
  ammo: COMBAT.magSize, reserveAmmo: 48,
  reloadTimer: 0, fireTimer: 0,
  inCar: false, car: null, inMissionCar: false,
  speed: 0, grounded: true, walkPhase: 0,
  // Vega Customs: the index into PAINT.colors of the crew's
  // signature colour, or -1 when no respray has been bought yet.
  // -1 means "no signature": a stolen car keeps its own paint
  // until the player pays for a colour, and the save stores this
  // index, not a colour, so the palette can change without
  // invalidating a save.
  paintIndex: -1,
};

function buildPlayerMesh() {
  const g = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e6f5e });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3550 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const legs = new THREE.Mesh(box, jeans);
  legs.scale.set(0.42, 0.75, 0.3);
  legs.position.y = 0.375;
  g.add(legs);
  const torso = new THREE.Mesh(box, jacket);
  torso.scale.set(0.54, 0.62, 0.34);
  torso.position.y = 1.06;
  g.add(torso);
  const head = new THREE.Mesh(box, skin);
  head.scale.set(0.34, 0.34, 0.32);
  head.position.y = 1.55;
  g.add(head);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(box, jacket);
    arm.scale.set(0.12, 0.55, 0.14);
    arm.position.set(sx * 0.34, 1.05, 0);
    arm.name = sx < 0 ? 'armL' : 'armR';
    g.add(arm);
  }
  return g;
}
const playerMesh = buildPlayerMesh();
scene.add(playerMesh);

// --- Game state ---
const game = {
  screen: 'title',
  cash: ECONOMY.startCash,
  wanted: 0,
  // Lifetime heat: every star ever earned, across the whole save,
  // never reset by a bust or a reload. The HUD shows it as the
  // player's record, and the save carries it alongside the current
  // stars.
  heatTotal: 0,
  lastCrime: -999,
  quietSince: 0,
  playSeconds: 0,
  time: 0,
  kills: 0,
  carsStolen: 0,
  missionStartApplied: -1,
  shake: 0,
  lastBoundaryToast: -99, // game.time of the last city-limit warning
  // Cab work, this save: fares completed and dollars earned. The
  // rating itself lives on the job (taxi.rating) and is saved with it.
  taxiFares: 0,
  taxiEarned: 0,
  // Hidden packages, this save: how many of the twelve are found.
  // The which is saved as indices (see saveGame), the count lives
  // here so the HUD never counts the array twice.
  packagesFound: 0,
  // The live roadblock, if the PD has one up, and when the last one
  // cleared (the cooldown lives here, not in the barrier builder).
  roadblock: null,
  lastRoadblockAt: -999,
  prevRain: 0, // rain level last step, so thunder fires on the rise
};
let saveData = null;
try {
  saveData = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? 'null');
} catch {
  saveData = null;
}

function announce(message) {
  status.textContent = message;
}

// The city-limit fence, hit on foot or by car: one toast and one
// low thud, then silence for four seconds so scraping along the
// fence does not spam the player. The fence is the end of Solmar —
// the hills and the water past it are scenery, not somewhere to
// drive.
function boundaryHit() {
  if (game.time - game.lastBoundaryToast < 4) return;
  game.lastBoundaryToast = game.time;
  hud.showToast('City limits — the fence is the end of Solmar.', 2.5);
  audio.thud();
}

function addWanted(stars, reason) {
  if (game.wanted < WANTED.maxStars) game.wanted = Math.min(WANTED.maxStars, game.wanted + stars);
  game.heatTotal += stars;
  game.lastCrime = game.time;
  game.quietSince = game.time;
  // The commentary travels with the stars: the toast says what the
  // PD is doing about the heat, not just how many stars it is.
  hud.showToast(`WANTED ${'★'.repeat(game.wanted)} — ${reason}. ${heatCommentary(game.wanted)}`, 3);
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.cash, mission: missions.index, stage: missions.stage,
      x: player.x, z: player.z, health: player.health, armor: player.armor,
      ammo: player.ammo, reserveAmmo: player.reserveAmmo, playSeconds: game.playSeconds,
      // Heat persistence: the wanted level and the lifetime heat
      // total survive a reload, so quitting mid-chase does not wash
      // the heat away. A bust or a waste still clears the stars
      // (the fine is the price); the total never resets.
      wanted: game.wanted, heatTotal: game.heatTotal,
      // Cab work persists with the save: the rating, the fares and
      // the earnings come back on load, so a driver's record
      // survives a reload. A live shift does not — the fare is gone
      // when the game closes, and the job restarts at 'off'.
      taxiRating: taxi.rating, taxiFares: game.taxiFares, taxiEarned: game.taxiEarned,
      // Hidden packages persist as the indices of the found cases,
      // so a reload hides exactly the cases already collected and
      // keeps the rest on the map — the hunt resumes where it
      // stopped.
      packagesFound: packages.map((p, i) => (p.found ? i : -1)).filter((i) => i >= 0),
      // The crew colour persists as its palette index, so a
      // respray bought yesterday still paints the next car stolen
      // today. -1 means no respray bought yet.
      paintIndex: player.paintIndex,
    }));
    hud.showToast('Game saved.', 2);
  } catch { /* storage can be off; the game still plays */ }
}

function loadSave(data) {
  game.cash = data.cash ?? ECONOMY.startCash;
  missions.index = Math.min(data.mission ?? 0, MISSIONS.length - 1);
  missions.stage = data.stage ?? 0;
  missions.done = false;
  missions.storyComplete = false;
  player.x = data.x ?? -30;
  player.z = data.z ?? 14;
  player.health = data.health ?? PLAYER.maxHealth;
  player.armor = data.armor ?? 0;
  player.ammo = data.ammo ?? COMBAT.magSize;
  player.reserveAmmo = data.reserveAmmo ?? 48;
  game.playSeconds = data.playSeconds ?? 0;
  // Restore the heat: the stars come back capped at five, the
  // lifetime total comes back as it was, and the player is told
  // the heat remembered them — because it did.
  game.wanted = Math.min(WANTED.maxStars, data.wanted ?? 0);
  game.heatTotal = data.heatTotal ?? 0;
  // Restore the cab-work record: the rating and the earnings come
  // back as they were, and the job itself starts at 'off' — a fare
  // waiting when the game closed is gone, the record is not.
  taxi.rating = Math.min(5, Math.max(1, data.taxiRating ?? TAXI.ratingStart));
  taxi.fares = data.taxiFares ?? 0;
  taxi.earned = data.taxiEarned ?? 0;
  game.taxiFares = taxi.fares;
  game.taxiEarned = taxi.earned;
  // Restore the hunt: the found cases stay found (meshes hidden),
  // the rest stay on the map. An index outside the table is
  // ignored, so an old save never breaks a new table.
  const foundIdx = Array.isArray(data.packagesFound) ? data.packagesFound : [];
  game.packagesFound = 0;
  for (const pk of packages) {
    pk.found = false;
    pk.mesh.visible = true;
  }
  for (const i of foundIdx) {
    if (packages[i]) {
      packages[i].found = true;
      packages[i].mesh.visible = false;
      game.packagesFound += 1;
    }
  }
  // Restore the crew colour: the palette index comes back as it
  // was, clamped into the palette, so an old save never points
  // outside a palette that grew since. The colour itself applies
  // when the player next takes a car — the save holds the taste,
  // not the car.
  const savedPaint = data.paintIndex ?? -1;
  player.paintIndex = savedPaint >= 0 && savedPaint < PAINT.colors.length ? savedPaint : -1;
  if (game.wanted > 0) {
    game.lastCrime = game.time;
    hud.showToast(`The heat remembers you — ${'★'.repeat(game.wanted)} still on you.`, 4);
  }
}

// --- Input ---
const keys = new Set();
let mouseDown = false;
let lastMouse = { x: 0, y: 0 };
let mouseMoved = 0;
const view = { yaw: Math.PI, pitch: 0.32 };
const input = { forward: false, back: false, left: false, right: false };
// Scripted input for ?shot= staging: the autopilot in shots.js
// writes here, and readInput() merges it. Never set by the player.
const auto = { on: false, forward: false, back: false, left: false, right: false };

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p') togglePause();
  if (e.key.toLowerCase() === 'm') {
    audio.setMuted(!audio.muted);
    hud.showToast(audio.muted ? 'Sound off (M to turn on).' : 'Sound on.', 2);
  }
  if (e.key.toLowerCase() === 'e') tryEnterExitCar();
  // R does two jobs, split by where the player is: on foot it
  // reloads the pistol; in a car it asks Vega Customs for the next
  // colour. The split is why the reload never fires while driving
  // — a held R in a car used to start a reload the driver could
  // not see, and the ammo refilled mid-chase for free. e.repeat
  // guards the respray against the key's auto-repeat: one press,
  // one colour, one charge.
  if (e.key.toLowerCase() === 'r' && !e.repeat) {
    if (player.inCar) tryRespray();
    else startReload();
  }
  if (e.key === 'Enter' || e.key === ' ') confirmAction();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
canvas.addEventListener('pointerdown', (e) => {
  mouseDown = true;
  mouseMoved = 0;
  lastMouse = { x: e.clientX, y: e.clientY };
  audio.start();
});
window.addEventListener('pointermove', (e) => {
  if (!mouseDown) return;
  const dx = e.clientX - lastMouse.x;
  const dy = e.clientY - lastMouse.y;
  mouseMoved += Math.abs(dx) + Math.abs(dy);
  lastMouse = { x: e.clientX, y: e.clientY };
  view.yaw -= dx * 0.005;
  view.pitch = Math.max(-0.1, Math.min(0.9, view.pitch + dy * 0.004));
});
window.addEventListener('pointerup', (e) => {
  if (mouseDown && mouseMoved < 6 && game.screen === 'playing' && !player.inCar) shoot();
  mouseDown = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function readInput() {
  input.forward = keys.has('w') || keys.has('arrowup') || (auto.on && auto.forward);
  input.back = keys.has('s') || keys.has('arrowdown') || (auto.on && auto.back);
  input.left = keys.has('a') || (auto.on && auto.left);
  input.right = keys.has('d') || (auto.on && auto.right);
  if (keys.has('arrowleft')) view.yaw += 0.03;
  if (keys.has('arrowright')) view.yaw -= 0.03;
  if (player.inCar) input.forward = input.forward || keys.has('w');
}

// --- Combat ---
function rayBlocked(x0, z0, x1, z1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    for (const c of city.colliders) {
      if (Math.abs(x - c.x) < c.hx + 0.3 && Math.abs(z - c.z) < c.hz + 0.3) return true;
    }
  }
  return false;
}

function damagePlayer(amount) {
  const absorbed = Math.min(player.armor, amount * 0.6);
  player.armor -= absorbed;
  player.health -= (amount - absorbed);
  if (player.health <= 0) {
    player.health = 0;
    wasted();
  }
}

function shoot() {
  if (player.fireTimer > 0 || player.reloadTimer > 0 || player.ammo <= 0) {
    if (player.ammo <= 0) startReload();
    return;
  }
  player.ammo -= 1;
  player.fireTimer = COMBAT.fireSeconds;
  audio.shot();
  game.shake = 0.25;
  // Hitscan from the camera through the crosshair: the nearest
  // living person inside a narrow cone and inside range, with a
  // building check.
  const dirX = Math.sin(view.yaw);
  const dirZ = Math.cos(view.yaw);
  let best = null;
  let bestD = COMBAT.pistolRange;
  const targets = [];
  for (const p of peds) if (!p.dead) targets.push({ kind: 'ped', o: p });
  for (const c of footCops) if (!c.dead) targets.push({ kind: 'cop', o: c });
  for (const t of targets) {
    const dx = t.o.x - player.x;
    const dz = t.o.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 0.5) continue;
    const dot = (dx * dirX + dz * dirZ) / d;
    if (dot < 0.94) continue;
    if (rayBlocked(player.x, player.z, t.o.x, t.o.z)) continue;
    best = t;
    bestD = d;
  }
  if (best) {
    best.o.health -= COMBAT.pistolDamage;
    if (best.o.health <= 0 && !best.o.dead) {
      best.o.dead = true;
      best.o.mesh.rotation.x = -Math.PI / 2;
      best.o.mesh.position.y = 0.3;
      game.kills += 1;
      if (best.kind === 'cop') addWanted(2, 'Officer down — the whole city heard that');
      else addWanted(1, 'A bystander is down');
    }
    // A hit near anyone else still scares the street.
    for (const p of peds) {
      if (!p.dead && Math.hypot(p.x - best.o.x, p.z - best.o.z) < 14) p.flee = 3;
    }
  } else {
    // A miss still scares nearby pedestrians.
    for (const p of peds) {
      if (!p.dead && Math.hypot(p.x - player.x, p.z - player.z) < 12) p.flee = 2;
    }
  }
  if (player.ammo === 0) startReload();
}

function startReload() {
  if (player.reloadTimer > 0 || player.inCar || player.reserveAmmo <= 0 || player.ammo === COMBAT.magSize) return;
  player.reloadTimer = COMBAT.reloadSeconds;
}

// --- Cars: enter / exit / steal ---
function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of [...parked, ...traffic]) {
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function seatPlayerInCar(car, silent) {
  player.inCar = true;
  player.car = car;
  // Any mission-flagged car counts for a steal stage: the red
  // sports car for Hot Wheels, the airport shuttle for the Runway
  // Job. Only those two cars carry a mission flag, so no ordinary
  // steal can complete a mission by accident.
  player.inMissionCar = car.mission != null;
  if (car.parked) {
    const i = parked.indexOf(car);
    if (i >= 0) parked.splice(i, 1);
    car.parked = false;
  } else {
    const i = traffic.indexOf(car);
    if (i >= 0) traffic.splice(i, 1);
  }
  // The crew colour: once Rook has paid for a respray, every car
  // he takes gets painted in it — the signature travels with the
  // driver, not the car. A car with no signature keeps its own
  // paint, which is why the paint only applies when the index is
  // set: the red sports car stays red until the player chooses a
  // colour for it.
  if (player.paintIndex >= 0) resprayCar(car, PAINT.colors[player.paintIndex].hex);
  if (!silent) {
    addWanted(1, 'Car stolen — someone called it in');
    game.carsStolen += 1;
    audio.pickup();
    hud.showToast(car.kind === 'police' ? 'You stole a police car. Bold.' : `In the ${car.kind}. Drive.`, 2);
    // A taxi is a job, not just a car: entering one offers a fare.
    // The steal still costs its star — the fare does not know the
    // cab is stolen, and the PD does not care that you are working.
    if (isTaxiCar(car)) startTaxiShift();
  }
}

function tryEnterExitCar() {
  if (game.screen !== 'playing') return;
  if (player.inCar) {
    const car = player.car;
    player.inCar = false;
    player.car = null;
    player.inMissionCar = false;
    player.x = car.x + Math.cos(car.angle) * 2.4;
    player.z = car.z - Math.sin(car.angle) * 2.4;
    player.angle = car.angle;
    car.speed = 0;
    car.parked = true;
    if (!parked.includes(car)) parked.push(car);
    // Leaving the cab abandons the fare: the passenger walks away
    // and the rating pays for it, whether they were still waiting
    // at the kerb or already riding.
    if (isTaxiCar(car) && taxi.status !== 'off') cancelTaxiShift('You left the cab — the fare walked away.');
    hud.showToast('Out of the car.', 1.5);
    return;
  }
  const car = nearestCar(3.4);
  if (!car) return;
  seatPlayerInCar(car, false);
}

// --- Vega Customs: respray at Vega Motors ---
// The shop is a bay, not a menu: drive the car into the garage
// marker at Vega Motors and press R. The colour cycles through
// PAINT.colors in order from whatever the car is wearing now, so
// the first respray of a blue sedan is Sunset Red, the next is
// Taxi Gold, and the sixth wraps back to Solmar Blue. The charge
// is taken before the paint changes, and the save is written at
// once, so a respray survives a reload — the signature is bought,
// not rented. Three ways it says no, each with its own reason:
// not in a car, not at the shop, or short of the $100.
function tryRespray() {
  if (!player.inCar || !player.car || game.screen !== 'playing') return;
  const g = city.markers.garage;
  if (Math.hypot(player.car.x - g.x, player.car.z - g.z) > PAINT.radius) {
    hud.showToast('Vega Customs is at Vega Motors — drive into the garage bay to respray.', 3);
    return;
  }
  if (game.cash < PAINT.cost) {
    hud.showToast(`A respray is $${PAINT.cost} — you're $${PAINT.cost - game.cash} short.`, 3);
    return;
  }
  const current = paintHex(player.car);
  const at = PAINT.colors.findIndex((c) => c.hex === current);
  const next = PAINT.colors[(at + 1) % PAINT.colors.length];
  game.cash -= PAINT.cost;
  player.paintIndex = PAINT.colors.indexOf(next);
  resprayCar(player.car, next.hex);
  audio.pickup();
  // Save before the toast: saveGame shows its own "Game saved."
  // line, and the respray line is the one the player should read.
  saveGame();
  hud.showToast(`Vega Customs: ${next.name} — $${PAINT.cost}. The crew colour now.`, 3);
}

// --- Taxi side-job ---
// The waiting fare's ped leaves the street when they board, when
// the fare is cancelled, or when the driver is busted or wasted:
// the ped array is the street, and a passenger who is gone is gone.
function removeTaxiPassenger() {
  if (!taxiPassenger) return;
  scene.remove(taxiPassenger.mesh);
  const i = peds.indexOf(taxiPassenger);
  if (i >= 0) peds.splice(i, 1);
  taxiPassenger = null;
}

// Offer a fare when the player enters a taxi: pick two stops, put
// a passenger on the kerb at the pickup, and mark it with the
// yellow beacon. The quoted fare uses the rain at the offer, so the
// surge is fixed when the passenger is quoted, not when they get out.
function startTaxiShift() {
  const fare = taxi.offerFare(city.markers, weather.rain);
  if (!fare) return;
  taxiMarkers.showPickup(fare.pickup.x, fare.pickup.z);
  taxiPassenger = tagPassenger(createPed(rng.fork(), fare.pickup.x + 2, fare.pickup.z + 2));
  placePerson(taxiPassenger, scene);
  peds.push(taxiPassenger);
  audio.fare();
  hud.showToast(`Cab work: pick up the fare at ${fare.pickupName} — $${fare.fare} to ${fare.destName} (${fare.dist} m).`, 5);
}

// Abandon a live fare: the rating pays, the markers go dark, the
// passenger leaves the street. Called when the driver exits the
// cab, gets busted, or gets wasted mid-fare.
function cancelTaxiShift(reason) {
  taxi.fail();
  taxiMarkers.hideAll();
  removeTaxiPassenger();
  audio.fail();
  hud.showToast(`${reason} Rating ${taxi.rating.toFixed(1)}★.`, 4);
}

// One step of the fare: boarding when the taxi reaches the pickup,
// payout on arrival at the destination, failure when the timer runs
// out. The timer counts down on step dt, so a paused game never
// loses a fare to the wall clock.
function stepTaxi(dt) {
  taxiMarkers.step(game.time, dt);
  if (taxi.status === 'waiting') {
    if (player.inCar && player.car && isTaxiCar(player.car)
      && Math.hypot(player.x - taxi.pickup.x, player.z - taxi.pickup.z) < TAXI.pickupRadius) {
      taxi.board();
      removeTaxiPassenger();
      taxiMarkers.showDest(taxi.dest.x, taxi.dest.z);
      audio.fare();
      hud.showToast(`Fare aboard — to ${stopName(taxi.destKey)} in ${Math.ceil(taxi.timer)}s. Drive smooth.`, 4);
    }
  } else if (taxi.status === 'riding') {
    taxi.timer -= dt;
    if (Math.hypot(player.x - taxi.dest.x, player.z - taxi.dest.z) < TAXI.dropRadius) {
      const result = taxi.complete();
      game.cash += result.payout;
      game.taxiFares = taxi.fares;
      game.taxiEarned = taxi.earned;
      taxiMarkers.hideAll();
      audio.fare();
      hud.showToast(`Fare paid: $${result.payout} ($${result.fare} + $${result.tip} tip) — rating ${result.rating.toFixed(1)}★.`, 4);
      saveGame();
    } else if (taxi.timer <= 0) {
      taxi.fail();
      taxiMarkers.hideAll();
      audio.fail();
      hud.showToast(`Too slow — the fare got out at the lights. Rating ${taxi.rating.toFixed(1)}★.`, 4);
    }
  }
}

// --- Police ---
function desiredPolice() {
  return { foot: [0, 1, 2, 2, 3, 3][game.wanted], cars: [0, 0, 1, 2, 3, 4][game.wanted] };
}

function spawnPolice() {
  const want = desiredPolice();
  while (footCops.filter((c) => !c.dead).length < want.foot) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(32, 48);
    const cop = createCop(player.x + Math.sin(a) * d, player.z + Math.cos(a) * d);
    const fixed = resolveCollisions(city, cop.x, cop.z, 0.5);
    cop.x = fixed.x;
    cop.z = fixed.z;
    placePerson(cop, scene);
    footCops.push(cop);
  }
  while (policeCars.length < want.cars) {
    const road = rng.pick(city.centres);
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const along = rng.range(-CITY.half + 10, CITY.half - 10);
    const x = axis === 'x' ? along : road + 3.2;
    const z = axis === 'x' ? road + 3.2 : along;
    // At four stars and up the PD sends interceptors, not patrol
    // cars, for the extra units: black, faster (chase speed 22
    // against the patrol car's 19), and the reason a four-star
    // chase is won by turning, not by outrunning them. The first
    // two units stay patrol cars, so the player always knows which
    // kind is which.
    const kind = game.wanted >= 4 && policeCars.length >= 2 ? 'interceptor' : 'police';
    const car = createCar(kind, x, z, axis === 'x' ? Math.PI / 2 : 0);
    car.road = axis;
    car.dir = 1;
    car.lane = 3.2;
    car.target = axis === 'x' ? CITY.half : CITY.half;
    placeCar(car, scene);
    policeCars.push(car);
  }
}

function stepPoliceCars(dt) {
  for (let i = policeCars.length - 1; i >= 0; i -= 1) {
    const car = policeCars[i];
    if (game.wanted === 0) {
      scene.remove(car.mesh);
      policeCars.splice(i, 1);
      continue;
    }
    // Chase: steer toward the player, faster than traffic, ramming
    // the player's car on contact.
    const dx = player.x - car.x;
    const dz = player.z - car.z;
    const dist = Math.hypot(dx, dz) || 0.01;
    const wantAngle = Math.atan2(dx, dz);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    // Chase speed by kind: interceptors top out at 22, patrol cars
    // at 19 (chaseSpeed in vehicles.js). The car accelerates toward
    // its cap, so an interceptor closes the gap faster than a patrol
    // car.
    car.speed = Math.min(chaseSpeed(car.kind), car.speed + 10 * dt);
    const nx = car.x + Math.sin(car.angle) * car.speed * dt;
    const nz = car.z + Math.cos(car.angle) * car.speed * dt;
    const fixed = resolveCollisions(city, nx, nz, 1.6);
    if (fixed.hit) car.speed *= 0.5;
    car.x = fixed.x;
    car.z = fixed.z;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.angle;
    if (dist < 3.2) {
      if (player.inCar && player.car) {
        player.car.speed *= 0.92;
        if (Math.abs(player.car.speed) > 6) {
          damagePlayer(4);
          audio.crash();
          game.shake = 0.4;
        }
      } else if (dist < 2.6) {
        // A patrol car that catches the player on foot ends the chase.
        busted();
        return;
      }
    }
  }
}

// --- Busted / wasted ---
// A bust or a waste clears the roadblock with the rest of the heat:
// the player wakes up at the hospital, the barriers are gone, and
// the next chase starts clean. The colliders go with the meshes, so
// nothing invisible is left standing on the road.
function clearRoadblockNow() {
  if (game.roadblock) {
    clearRoadblock(scene, city, game.roadblock);
    game.roadblock = null;
    game.lastRoadblockAt = game.time;
  }
}

// What a bust and a waste share: the fine, the heat clearing, the
// roadblock coming down, the shift ending, the police leaving, the
// car left where it stands, and the wake-up at St. Anselm with full
// health. The two differ only in the screen, the sound, the fine's
// wording, and whether the armour survives — a bust keeps the vest,
// a waste does not.
function resetAfterCaught(clearArmor) {
  const fine = Math.min(game.cash, ECONOMY.bustFine);
  game.cash -= fine;
  game.wanted = 0;
  clearRoadblockNow();
  // A bust or a waste ends the shift too: the fare is gone, the cab
  // is wherever the PD left it, and the rating pays for the
  // abandoned ride.
  if (taxi.status !== 'off') cancelTaxiShift(clearArmor ? 'Wasted mid-fare — the passenger walked away.' : 'Busted mid-fare — the passenger walked away.');
  for (const cop of footCops) scene.remove(cop.mesh);
  footCops.length = 0;
  for (const car of policeCars) scene.remove(car.mesh);
  policeCars.length = 0;
  if (player.inCar && player.car) {
    player.car.speed = 0;
    player.inCar = false;
    player.car = null;
    player.inMissionCar = false;
  }
  player.x = city.markers.hospital.x;
  player.z = city.markers.hospital.z + 12;
  player.health = PLAYER.maxHealth;
  if (clearArmor) player.armor = 0;
  playerMesh.position.set(player.x, 0, player.z);
  return fine;
}

function busted() {
  if (game.screen !== 'playing') return;
  game.screen = 'busted';
  audio.busted();
  const fine = resetAfterCaught(false);
  document.getElementById('end-text-busted').textContent = `The Solmar PD took $${fine} and dropped you at St. Anselm.`;
  showOverlay('busted');
  announce('Busted. Press Enter to keep playing.');
}

function wasted() {
  if (game.screen !== 'playing') return;
  game.screen = 'wasted';
  audio.fail();
  const lost = resetAfterCaught(true);
  document.getElementById('end-text-wasted').textContent = `You woke up at St. Anselm, $${lost} lighter.`;
  showOverlay('wasted');
  announce('Wasted. Press Enter to keep playing.');
}

// --- Overlays ---
const overlays = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  busted: document.getElementById('screen-busted'),
  wasted: document.getElementById('screen-wasted'),
  story: document.getElementById('screen-story'),
};
function showOverlay(name, text) {
  for (const [key, el] of Object.entries(overlays)) el.classList.toggle('hidden', key !== name);
  if (name === 'story') {
    document.getElementById('story-stats').textContent =
      `Cash $${game.cash.toLocaleString('en-US')} · ${game.kills} takedowns · ${game.carsStolen} cars stolen · ${formatTime(game.playSeconds)} in Solmar Bay. ${cabWorkLine(taxi.fares, taxi.earned, taxi.rating)} ${packageLine(game.packagesFound, PACKAGES.count)}`;
  }
  if (name === 'title') {
    document.getElementById('continue-btn').classList.toggle('hidden', !saveData);
  }
  document.getElementById('hud').classList.toggle('hidden', name === 'title');
}

function confirmAction() {
  if (game.screen === 'title') startGame(false);
  else if (game.screen === 'busted' || game.screen === 'wasted') {
    showOverlay(null);
    game.screen = 'playing';
    announce('Back on the streets.');
  } else if (game.screen === 'story') {
    showOverlay(null);
    game.screen = 'playing';
  } else if (game.screen === 'paused') togglePause();
}

function togglePause() {
  if (game.screen === 'playing') {
    game.screen = 'paused';
    showOverlay('pause');
    announce('Paused.');
  } else if (game.screen === 'paused') {
    game.screen = 'playing';
    showOverlay(null);
    announce('Playing.');
  }
}

document.getElementById('start-btn').addEventListener('click', () => { audio.start(); startGame(false); });
document.getElementById('continue-btn').addEventListener('click', () => { audio.start(); startGame(true); });
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('save-btn').addEventListener('click', saveGame);
document.getElementById('restart-btn').addEventListener('click', () => {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  saveData = null;
  location.search = '';
  location.reload();
});
document.getElementById('end-btn').addEventListener('click', confirmAction);
document.getElementById('story-btn').addEventListener('click', confirmAction);

function startGame(useSave) {
  if (useSave && saveData) loadSave(saveData);
  else {
    player.x = -30;
    player.z = 14;
    player.angle = Math.PI;
  }
  showOverlay(null);
  game.screen = 'playing';
  view.yaw = player.angle;
  hud.showToast(missions.storyComplete ? 'Free roam — Solmar is yours.' : currentObjective(missions), 5);
  announce('Playing. Follow the amber waypoint.');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// --- Simulation step: what one 1/60 s tick does, in order ---
// The step is deliberately boring and sequential, because every
// system reads the results of the ones before it and the order is
// the design:
//   1. Clock, weather and input. game.time advances; the sky
//      advances with it (stepWeather, then the lights, the rain and
//      the taxiing plane); readInput() merges the keyboard and the
//      ?shot= autopilot into one input object, so the staged scenes
//      drive the same code the player drives.
//   2. Mission start effects, once per mission. The Heat job sets
//      three stars here, so the player is hot before they move.
//   3. The player. In a car, stepPlayerCar moves the car and the
//      player follows it; on foot, WASD moves relative to the camera
//      and the walk cycle swings the arms. Both paths end in
//      resolveCollisions, which is also where the fence reports
//      `bounded` and the toast fires. Running over a pedestrian and
//      bumping traffic are checked here, while the memory of the
//      impact is still fresh.
//   4. Timers: fire and reload. The reload completes here, moving
//      rounds from reserve into the magazine, so the HUD never shows
//      a half-reloaded state.
//   5. Traffic, pedestrians, and the dead-pedestrian respawn. The
//      dead come back after 20 s, from a sidewalk at least 40 m from
//      the player, so the street never empties and never respawns
//      someone in the player's face.
//   6. Pickups: spin, bob, and hand out health or ammo on touch,
//      then hide for 30 s.
//   7. Wanted: police spawn to match the stars, stars decay after
//      25 quiet seconds, foot cops chase/shoot/bust, patrol cars
//      chase and ram, interceptors join at four stars, and a
//      roadblock goes up ahead of the player at three stars while
//      driving. A bust or a waste exits the step early through
//      busted()/wasted(), which reset the player at the hospital and
//      clear the roadblock.
//   8. Missions: stepMissions reads the player and returns events;
//      the step turns events into cash, toasts, sounds and saves.
//   9. Beacon, player mesh, camera, audio, HUD. The camera chases
//      from behind the player's heading (further and higher in a
//      car), shake decays here, and the HUD reads the finished state
//      — including the weather chip, the lifetime heat and the story
//      arc.
// Nothing in this list allocates per frame except the small arrays
// the police and traffic checks build; the render loop runs the
// step in a fixed-step accumulator so a slow frame advances the
// world in whole 1/60 s ticks instead of one long jump.
function step(dt) {
  game.time += dt;
  if (game.screen === 'playing') game.playSeconds += dt;
  readInput();

  // The sky: the clock, the rain and the light advance with the
  // same dt as everything else, so the weather is a function of
  // the step count and the seed, never of the wall clock. Thunder
  // fires once, when the rain ramps past half strength; the
  // taxiing plane moves on the same clock. Rain past the first
  // window is impossible in a staged shot (the first window opens
  // at 360 s of play), so the screenshots stay dry and
  // deterministic.
  stepWeather(weather, dt);
  applyWeather(scene, sun, hemi, weather);
  stepRain(rainPoints, weather, player.x, player.z);
  stepTaxiPlane(taxiPlane, weather.time);
  if (weather.rain > 0.5 && game.prevRain <= 0.5) audio.thunder();
  game.prevRain = weather.rain;

  // Mission stage effects that must apply once when a mission activates.
  if (game.screen === 'playing' && game.missionStartApplied !== missions.index && !missions.storyComplete) {
    game.missionStartApplied = missions.index;
    const effect = onMissionStart(missions);
    if (effect.wanted > 0) {
      game.wanted = effect.wanted;
      game.lastCrime = game.time;
      hud.showToast(`WANTED ${'★'.repeat(game.wanted)} — the drop went loud`, 4);
    }
  }

  // Player.
  if (player.inCar && player.car) {
    // Wet roads cut the grip: stepPlayerCar takes weather.grip, so
    // a rainy chase accelerates slower, brakes longer and steers less.
    stepPlayerCar(player.car, input, dt, city, weather.grip);
    if (player.car.bounded) boundaryHit();
    player.x = player.car.x;
    player.z = player.car.z;
    player.angle = player.car.angle;
    player.heading = player.car.angle;
    // Running over pedestrians is a crime, and it slows the car.
    for (const p of peds) {
      if (p.dead) continue;
      if (Math.hypot(p.x - player.x, p.z - player.z) < 2.1) {
        p.dead = true;
        p.mesh.rotation.x = -Math.PI / 2;
        p.mesh.position.y = 0.3;
        player.car.speed *= 0.7;
        addWanted(1, 'A pedestrian is down');
        // A fare in the back sees that: every run-over while riding
        // is a crash against the tip and the rating.
        if (taxi.status === 'riding') taxi.crashes += 1;
        audio.crash();
        for (const q of peds) if (!q.dead && Math.hypot(q.x - p.x, q.z - p.z) < 14) q.flee = 3;
      }
    }
    // Bumping traffic at speed is a crash, not a crime.
    for (const car of traffic) {
      if (Math.hypot(car.x - player.x, car.z - player.z) < 3.4) {
        if (Math.abs(player.car.speed) > 8) {
          audio.crash();
          game.shake = 0.3;
          player.car.speed *= 0.6;
          car.speed = 0;
          // A bump at speed is a crash for the fare too.
          if (taxi.status === 'riding') taxi.crashes += 1;
        }
      }
    }
  } else {
    const running = keys.has('shift');
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += Math.sin(view.yaw); mz += Math.cos(view.yaw); }
    if (input.back) { mx -= Math.sin(view.yaw); mz -= Math.cos(view.yaw); }
    if (input.left) { mx += Math.cos(view.yaw); mz -= Math.sin(view.yaw); }
    if (input.right) { mx -= Math.cos(view.yaw); mz += Math.sin(view.yaw); }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      player.heading = Math.atan2(mx, mz);
      const nx = player.x + mx * speed * dt;
      const nz = player.z + mz * speed * dt;
      const fixed = resolveCollisions(city, nx, nz, PLAYER.radius);
      if (fixed.bounded) boundaryHit();
      player.x = fixed.x;
      player.z = fixed.z;
      player.speed = speed;
      // Walk cycle on the arms.
      player.walkPhase += dt * (running ? 11 : 7);
      const swing = Math.sin(player.walkPhase) * 0.5;
      playerMesh.getObjectByName('armL').rotation.x = swing;
      playerMesh.getObjectByName('armR').rotation.x = -swing;
    } else {
      player.speed = 0;
    }
    if (keys.has(' ') && player.grounded) {
      player.vy = PLAYER.jumpSpeed;
      player.grounded = false;
    }
    if (!player.grounded) {
      player.vy -= 22 * dt;
      player.y += player.vy * dt;
      if (player.y <= 0) {
        player.y = 0;
        player.vy = 0;
        player.grounded = true;
      }
    }
    // Traffic can hit the player on foot.
    for (const car of [...traffic, ...policeCars]) {
      if (Math.hypot(car.x - player.x, car.z - player.z) < 2.0 && Math.abs(car.speed) > 3) {
        damagePlayer(12);
        player.x += Math.sin(car.angle) * 2;
        player.z += Math.cos(car.angle) * 2;
        audio.crash();
        game.shake = 0.4;
        car.speed *= 0.5;
      }
    }
  }

  // Timers.
  if (player.fireTimer > 0) player.fireTimer -= dt;
  if (player.reloadTimer > 0) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) {
      const need = COMBAT.magSize - player.ammo;
      const take = Math.min(need, player.reserveAmmo);
      player.ammo += take;
      player.reserveAmmo -= take;
    }
  }

  // Traffic and pedestrians.
  stepTraffic(traffic, city, rng, dt, [...traffic, ...policeCars, ...(player.car ? [player.car] : [])]);
  stepPeds(peds, city, rng, dt, null);
  // Dead pedestrians are replaced after a while, from a far sidewalk.
  for (const p of peds) {
    if (!p.dead) continue;
    p.respawn = (p.respawn ?? 0) + dt;
    if (p.respawn > 20) {
      const spot = rng.pick(city.pedSpots);
      const d = Math.hypot(spot.x - player.x, spot.z - player.z);
      if (d > 40) {
        p.dead = false;
        p.health = COMBAT.pedHealth;
        p.mesh.rotation.x = 0;
        p.mesh.position.y = 0;
        p.x = spot.x;
        p.z = spot.z;
        p.respawn = 0;
      }
    }
  }

  // Pickups.
  for (const pk of pickups) {
    if (pk.taken) {
      pk.timer -= dt;
      if (pk.timer <= 0) {
        pk.taken = false;
        pk.mesh.visible = true;
      }
      continue;
    }
    pk.mesh.rotation.y += dt;
    pk.mesh.position.y = 0.8 + Math.sin(game.time * 2 + pk.x) * 0.15;
    if (!player.inCar && Math.hypot(pk.x - player.x, pk.z - player.z) < 2) {
      pk.taken = true;
      pk.timer = 30;
      pk.mesh.visible = false;
      if (pk.kind === 'health') {
        player.health = Math.min(PLAYER.maxHealth, player.health + ECONOMY.healthPickup);
        hud.showToast(`Health +${ECONOMY.healthPickup}.`, 2);
      } else {
        player.reserveAmmo += ECONOMY.ammoPickup;
        hud.showToast(`Ammo +${ECONOMY.ammoPickup}.`, 2);
      }
      audio.pickup();
    }
  }

  // Hidden packages: spin, bob, and pay on foot. Only the player on
  // foot can collect one — driving over a case does not count, so
  // the hunt is a walk, not a drive-by. Each case pays
  // PACKAGES.value; the twelfth pays the completion bonus on top,
  // and the save is written at once, so a collected case stays
  // collected.
  for (const pk of packages) {
    if (pk.found) continue;
    pk.mesh.rotation.y += dt;
    pk.mesh.position.y = 0.8 + Math.sin(game.time * 2 + pk.x) * 0.15;
    if (!player.inCar && Math.hypot(pk.x - player.x, pk.z - player.z) < PACKAGES.pickupRadius) {
      pk.found = true;
      pk.mesh.visible = false;
      game.packagesFound += 1;
      game.cash += PACKAGES.value;
      audio.chime();
      if (game.packagesFound >= PACKAGES.count) {
        game.cash += PACKAGES.bonus;
        hud.showToast(`Hidden package ${game.packagesFound}/${PACKAGES.count} — $${PACKAGES.value}, and the full set pays $${PACKAGES.bonus}. Every case in Solmar Bay, found.`, 5);
        audio.mission();
      } else {
        hud.showToast(`Hidden package ${game.packagesFound}/${PACKAGES.count} — $${PACKAGES.value}.`, 3);
      }
      saveGame();
    }
  }

  // Wanted: spawn police to match the stars, decay when quiet.
  if (game.screen === 'playing') {
    spawnPolice();
    const nearestCop = Math.min(
      ...footCops.filter((c) => !c.dead).map((c) => Math.hypot(c.x - player.x, c.z - player.z)),
      ...policeCars.map((c) => Math.hypot(c.x - player.x, c.z - player.z)),
      Infinity,
    );
    const seen = nearestCop < WANTED.sightRange;
    if (game.wanted > 0 && !seen && game.time - game.lastCrime > WANTED.decaySeconds) {
      game.wanted -= 1;
      game.lastCrime = game.time;
      if (game.wanted === 0) {
        hud.showToast('You lost them. The heat is off — for now.', 3);
        for (const cop of footCops) scene.remove(cop.mesh);
        footCops.length = 0;
      }
    }
    const copEvents = [];
    const bustedNow = stepCops(footCops, player, city, dt, copEvents);
    for (const e of copEvents) {
      if (e.type === 'copShot') {
        audio.copShot();
        if (e.hit) {
          damagePlayer(e.damage);
          game.shake = 0.25;
        }
      }
    }
    if (bustedNow) busted();
    stepPoliceCars(dt);
    // Roadblocks: at three stars or more, while the player is
    // driving, the PD throws one across the road ahead — 42 m up,
    // no sooner than 20 s after the last one cleared. It stands
    // until the heat is off or the player gets 130 m away, and it
    // is real colliders, so the way through is around the kerb gap,
    // not through the boards.
    if (game.roadblock) {
      const d = Math.hypot(game.roadblock.x - player.x, game.roadblock.z - player.z);
      if (game.wanted === 0 || d > ROADBLOCK.clearDistance) clearRoadblockNow();
    } else if (game.wanted >= ROADBLOCK.minStars && player.inCar
      && game.time - game.lastRoadblockAt > ROADBLOCK.cooldownSeconds) {
      const a = player.car ? player.car.angle : player.heading;
      const bx = player.x + Math.sin(a) * ROADBLOCK.aheadMetres;
      const bz = player.z + Math.cos(a) * ROADBLOCK.aheadMetres;
      const fixed = resolveCollisions(city, bx, bz, 1);
      game.roadblock = {
        ...createRoadblock(scene, city, fixed.x, fixed.z, a),
        x: fixed.x, z: fixed.z,
      };
      hud.showToast('Roadblock ahead — the PD is closing the road.', 3);
      audio.thud();
    }
  }

  // Missions.
  if (game.screen === 'playing' && !missions.storyComplete) {
    const events = stepMissions(missions, {
      x: player.x, z: player.z, inCar: player.inCar,
      inMissionCar: player.inMissionCar, wanted: game.wanted, dt,
    });
    for (const e of events) {
      if (e.type === 'mission') {
        game.cash += e.reward;
        audio.mission();
        hud.showToast(`Mission complete: ${e.name} — $${e.reward.toLocaleString('en-US')}`, 4);
        saveGame();
      } else if (e.type === 'stage') {
        hud.showToast(e.text, 5);
      } else if (e.type === 'grabbed') {
        // The alarm text travels with the event: the bank alarm for
        // the Big Score, the buyers calling it in for the Arms Deal.
        addWanted(3, e.alarm ?? 'The bank alarm is screaming');
        hud.showToast(e.text, 4);
        audio.mission();
      } else if (e.type === 'failed') {
        audio.fail();
        hud.showToast(e.reason, 4);
      } else if (e.type === 'story') {
        audio.mission();
        game.screen = 'story';
        showOverlay('story');
        saveGame();
      }
    }
  }

  // Taxi side-job: pick up, drive, get paid. It runs after the
  // missions so a fare never steals the mission's events, and it
  // only advances while playing — a paused game never loses a fare.
  if (game.screen === 'playing') stepTaxi(dt);

  // Beacon + HUD.
  const wp = currentWaypoint(missions);
  if (wp && game.screen === 'playing') {
    beacon.visible = true;
    beacon.position.set(wp.x, 0, wp.z);
    beaconGem.position.y = 12 + Math.sin(game.time * 2.5) * 1.2;
    beaconGem.rotation.y += dt * 2;
  } else {
    beacon.visible = false;
  }

  // Player mesh.
  playerMesh.position.set(player.x, player.y, player.z);
  playerMesh.rotation.y = player.heading;
  playerMesh.visible = !player.inCar;

  // Camera: chase the player, orbit with the mouse, look slightly ahead.
  const camDist = player.inCar ? 13 : 9;
  const camHeight = player.inCar ? 5.2 : 4.2;
  const tx = player.x;
  const tz = player.z;
  const cx = player.x - Math.sin(view.yaw) * camDist * Math.cos(view.pitch);
  const cz = player.z - Math.cos(view.yaw) * camDist * Math.cos(view.pitch);
  const cy = camHeight + Math.sin(view.pitch) * camDist;
  camera.position.set(cx, cy, cz);
  camera.lookAt(tx, 1.6, tz);
  if (game.shake > 0) {
    game.shake -= dt;
    camera.position.x += (rng.next() - 0.5) * game.shake;
    camera.position.y += (rng.next() - 0.5) * game.shake;
  }

  // Audio follows the drive — and the weather, and the airport: the
  // rain loop follows weather.rain, and the jet rumble follows the
  // player's distance to the terminal.
  audio.update(player.inCar && player.car ? player.car.speed : player.speed, game.wanted,
    footCops.some((c) => !c.dead && Math.hypot(c.x - player.x, c.z - player.z) < 40) || policeCars.length > 0,
    { rain: weather.rain, airportDist: Math.hypot(player.x - AIRPORT.terminal.x, player.z - AIRPORT.terminal.z) });

  // HUD.
  hud.update({
    cash: game.cash, wanted: game.wanted, health: player.health, armor: player.armor,
    ammo: player.ammo, reserveAmmo: player.reserveAmmo, inCar: player.inCar,
    carSpeed: player.car ? player.car.speed : 0,
    objective: currentObjective(missions), playSeconds: game.playSeconds,
    // The countdown element reads these two: `timed` says a timed
    // stage is live, `timer` says how many seconds it has left.
    timer: missions.timer, timed: currentStage(missions)?.kind === 'timed',
    // The weather chip (in-world clock, phase, rain), the lifetime
    // heat total, and the story arc the HUD shows under the objective.
    weather: weatherLabel(weather),
    heat: game.heatTotal,
    arc: storyArc(missions).text,
    // The cab-work line: rating and earnings when off, pickup and
    // fare while waiting, destination and time left while riding.
    taxi: taxiHudLine(taxi),
    // The hunt line: found of twelve, always shown — a zero is a
    // hunt not started, not a missing feature.
    packages: `PACKAGES ${game.packagesFound}/${PACKAGES.count}`,
  }, dt);
  hud.drawMinimap({
    city, traffic, policeCars, footCops,
    player: { x: player.x, z: player.z, heading: player.heading },
    waypoint: wp, time: game.time,
    // The fare on the minimap: the pickup while waiting (boarding),
    // the destination while riding. Null when no shift is live.
    taxiDest: taxi.status === 'waiting' ? { ...taxi.pickup, boarding: true }
      : taxi.status === 'riding' ? { ...taxi.dest, boarding: false } : null,
    // The uncollected packages, as gold dots: the hunt is visible
    // on the map, so a player can plan the walk instead of
    // wandering. Found cases leave the map with the mesh.
    packages: packages.filter((p) => !p.found),
  });
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Frame loop ---
let last = performance.now();
let accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, 0.25);
  last = now;
  if (game.screen === 'title') {
    // Slow orbit over the city behind the title screen.
    game.time += 1 / 60;
    const a = game.time * 0.05;
    camera.position.set(Math.sin(a) * 150, 70, Math.cos(a) * 150);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    return;
  }
  if (game.screen !== 'playing') {
    renderer.render(scene, camera);
    return;
  }
  while (accumulator >= STEP) {
    step(STEP);
    accumulator -= STEP;
  }
  renderer.render(scene, camera);
}

// Debug handle for play-testing (read-only state for the test harness).
window.__solmar = {
  game, player, missions, city, parked, traffic, peds, footCops, policeCars,
  weather, taxiPlane, airport: AIRPORT, taxi, packages,
  // The live roadblock, if one is up: the play-test reads its
  // position and colliders to prove it stands and clears.
  get roadblock() { return game.roadblock; },
};

// --- Shot mode: stage a deterministic scene, paint it, signal readiness ---
if (shot) {
  const scene2 = stageShot(shot, { step, game, player, city, missions, traffic, peds, parked, policeCars, camera, renderer, scene, hud, view, auto, seatPlayerInCar, createCar, placeCar, startTaxiShift });
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  showOverlay(null);
  requestAnimationFrame(paint);
} else {
  showOverlay('title');
  announce('SOLMAR. Press Enter or click Start.');
  requestAnimationFrame(frame);
}
