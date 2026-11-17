// shots.js — the screenshot scenes behind ?shot=start|drive|chase|mission.
// Each one plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a small autopilot that holds the car to its
// road, so the frame is what a short game really looks like — and the same
// seed always gives the same frame. No scene reads the clock: the step
// count is fixed, so two captures of one shot are byte-identical renders
// apart from JPEG encoding.
import { STEP, CITY } from './config.js';

const SAMPLE = STEP;

// Steer the player's car toward a point 20 m ahead on the nearest road
// centre line. Returns nothing; it writes the autopilot input object.
function autopilot(ctx) {
  const car = ctx.player.car;
  if (!car) return;
  const auto = ctx.auto;
  let best = Infinity;
  let centre = 0;
  let vertical = true;
  for (const c of ctx.city.centres) {
    const dx = Math.abs(car.x - c);
    const dz = Math.abs(car.z - c);
    if (dx < best) {
      best = dx;
      centre = c;
      vertical = true;
    }
    if (dz < best) {
      best = dz;
      centre = c;
      vertical = false;
    }
  }
  // Keep going the way the car already points; the target is 20 m ahead
  // on the road the car is nearest to. Near the city edge the target flips
  // to 20 m the other way, so the car U-turns on its road instead of
  // driving out of town onto the bare ground beyond the grid.
  const ahead = car.speed >= 0 ? 20 : -20;
  const edge = CITY.half - 14;
  let tx;
  let tz;
  if (vertical) {
    tx = centre;
    tz = car.z + ahead * Math.sign(Math.cos(car.angle) || 1);
    if (Math.abs(tz) > edge) tz = car.z - ahead * Math.sign(Math.cos(car.angle) || 1);
  } else {
    tx = car.x + ahead * Math.sign(Math.sin(car.angle) || 1);
    tz = centre;
    if (Math.abs(tx) > edge) tx = car.x - ahead * Math.sign(Math.sin(car.angle) || 1);
  }
  const want = Math.atan2(tx - car.x, tz - car.z);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  auto.forward = car.speed < 12;
  auto.back = false;
  auto.left = diff > 0.06;
  auto.right = diff < -0.06;
}

function runSteps(ctx, seconds, drive) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    if (drive) autopilot(ctx);
    ctx.step(STEP);
  }
  ctx.auto.forward = false;
  ctx.auto.left = false;
  ctx.auto.right = false;
}

export function stageShot(name, ctx) {
  const { game, player, city, view } = ctx;
  game.screen = 'playing';
  ctx.auto.on = true;
  if (name === 'drive') {
    // Seat the player in a parked sedan near the centre and drive.
    const sedans = ctx.parked.filter((c) => c.kind === 'sedan');
    sedans.sort((a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z));
    const car = sedans[0] ?? ctx.parked[0];
    ctx.seatPlayerInCar(car, true);
    view.yaw = player.car.angle;
    view.pitch = 0.22;
    runSteps(ctx, 4, true);
  } else if (name === 'chase') {
    const sports = ctx.parked.filter((c) => c.kind === 'sport');
    sports.sort((a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z));
    const car = sports[0] ?? ctx.parked[0];
    ctx.seatPlayerInCar(car, true);
    game.wanted = 3;
    game.lastCrime = game.time;
    // One patrol car head-on, 30 m up the player's road, so the chase is
    // in the frame rather than somewhere behind the camera.
    const px = car.x + Math.sin(car.angle) * 30;
    const pz = car.z + Math.cos(car.angle) * 30;
    const pc = ctx.createCar('police', px, pz, car.angle + Math.PI);
    ctx.placeCar(pc, ctx.scene);
    ctx.policeCars.push(pc);
    view.yaw = player.car.angle;
    view.pitch = 0.26;
    runSteps(ctx, 4.5, true);
  } else if (name === 'mission') {
    // On foot at the docks, first mission live, beacon up.
    player.x = city.markers.docks.x + 8;
    player.z = city.markers.docks.z + 4;
    player.heading = Math.atan2(city.markers.docks.x - player.x, city.markers.docks.z - player.z);
    view.yaw = player.heading;
    view.pitch = 0.3;
    ctx.hud.showToast('Mission 1 — The Fixer: Meet Marisol at the docks', 30);
    runSteps(ctx, 3, false);
  } else {
    // start: on foot on a street corner, city alive around the player.
    player.x = -30;
    player.z = -90;
    player.heading = 0;
    view.yaw = player.heading;
    view.pitch = 0.28;
    ctx.hud.showToast('SOLMAR — press Enter to start', 30);
    runSteps(ctx, 5, false);
  }
  ctx.auto.on = false;
  return { staged: name };
}
