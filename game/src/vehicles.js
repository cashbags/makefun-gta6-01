// vehicles.js — cars: how they look, how traffic drives them, how the
// player drives one. Every car is boxes: a body, a cabin, four wheels and
// headlights, in a per-kind colour. Traffic follows the road graph: each car
// owns a road and a direction, drives to the next intersection, then either
// keeps going or turns onto the crossing street. The player's car uses a
// simple arcade model (accelerate, brake/reverse, steering that bites more
// at low speed) and stops dead against buildings, which the collision pass
// in city.js enforces. Eleven kinds now: the original seven plus a bus,
// an airport shuttle, a police interceptor and a limo (see KINDS), and
// the rain grip from weather.js scales the player's model. This module
// also builds police roadblocks: striped barriers that are real
// colliders while they stand and leave nothing behind when cleared.
import * as THREE from 'three';
import { CITY, CAR } from './config.js';
import { resolveCollisions } from './city.js';

const KINDS = {
  sedan: { color: 0x4a6fa5, w: 2.0, l: 4.4, h: 0.75, cabin: 0.62, speed: 11 },
  taxi: { color: 0xf2c94c, w: 2.0, l: 4.4, h: 0.75, cabin: 0.62, speed: 12 },
  van: { color: 0x8a8f96, w: 2.2, l: 5.2, h: 1.5, cabin: 0.9, speed: 9 },
  sport: { color: 0xc23b2e, w: 2.0, l: 4.2, h: 0.6, cabin: 0.5, speed: 15 },
  police: { color: 0x1f2a44, w: 2.0, l: 4.5, h: 0.78, cabin: 0.62, speed: 16 },
  // The two heavy kinds. A truck is the slowest thing on the road and
  // the longest: it blocks a lane like a moving wall, so traffic
  // behind it queues. A muscle car is the fastest civilian car short
  // of the police interceptor, and the only one that can outrun a
  // patrol car on a straight road. Both use the same box builder as
  // every other kind; only their proportions and extras differ.
  truck: { color: 0x5a7a4a, w: 2.3, l: 6.0, h: 1.6, cabin: 0.9, speed: 8 },
  muscle: { color: 0x7a2e8a, w: 2.0, l: 4.5, h: 0.7, cabin: 0.55, speed: 14 },
  // The Airport Arc kinds. A bus is the longest vehicle in the game —
  // nine metres of moving wall, slower than a truck, and the reason
  // the north streets feel busy at rush hour. A shuttle is the
  // airport's own bus: white with a blue stripe and a roof sign, the
  // mission car for the Runway Job. An interceptor is the PD's fast
  // answer at four stars and up: black, faster than a patrol car
  // (speed 18 against the patrol car's 16), with a red-and-blue bar
  // and a spoiler. A limo is a stretched sedan for the airport
  // forecourt and the plaza: long, slow to turn, and the second-
  // slowest thing a player can steal after a truck.
  bus: { color: 0x3a7a5a, w: 2.4, l: 9.0, h: 2.2, cabin: 1.0, speed: 8 },
  shuttle: { color: 0xe8e8e8, w: 2.3, l: 6.5, h: 2.0, cabin: 1.0, speed: 10 },
  interceptor: { color: 0x14161a, w: 2.0, l: 4.6, h: 0.72, cabin: 0.55, speed: 18 },
  limo: { color: 0x1a1a1a, w: 2.0, l: 6.4, h: 0.8, cabin: 0.6, speed: 12 },
};

export function buildCarMesh(kind) {
  const spec = KINDS[kind] ?? KINDS.sedan;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: spec.color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2530 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const body = new THREE.Mesh(box, bodyMat);
  body.scale.set(spec.w, spec.h, spec.l);
  body.position.y = 0.55 + spec.h / 2;
  group.add(body);
  const cabin = new THREE.Mesh(box, glassMat);
  cabin.scale.set(spec.w * 0.86, spec.cabin, spec.l * 0.45);
  cabin.position.set(0, 0.55 + spec.h + spec.cabin / 2, -spec.l * 0.06);
  group.add(cabin);
  if (kind === 'police') {
    const bar = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.scale.set(spec.w * 0.5, 0.22, 0.5);
    bar.position.set(0, 0.55 + spec.h + spec.cabin + 0.12, 0);
    bar.name = 'lightbar';
    group.add(bar);
    const stripe = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.scale.set(spec.w + 0.02, 0.3, spec.l * 0.5);
    stripe.position.set(0, 0.55 + spec.h * 0.5, 0);
    group.add(stripe);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xf2c94c }));
    sign.scale.set(0.7, 0.25, 0.4);
    sign.position.set(0, 0.55 + spec.h + spec.cabin + 0.1, 0);
    group.add(sign);
  }
  if (kind === 'truck') {
    // An open flatbed with one strapped crate: the truck reads as a
    // working vehicle from any angle, and the crate is the only cargo
    // in the game.
    const bed = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0x3a3f45 }));
    bed.scale.set(spec.w * 0.9, 0.25, spec.l * 0.42);
    bed.position.set(0, 0.55 + spec.h + 0.12, -spec.l * 0.22);
    group.add(bed);
    const crate = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0xc9a24a }));
    crate.scale.set(1.4, 1.1, 1.4);
    crate.position.set(0, 0.55 + spec.h + 0.8, -spec.l * 0.22);
    group.add(crate);
  }
  if (kind === 'muscle') {
    // A hood scoop and a rear spoiler: the two boxes that make a
    // muscle car read as one at street distance.
    const scoop = new THREE.Mesh(box, bodyMat);
    scoop.scale.set(0.7, 0.22, 1.0);
    scoop.position.set(0, 0.55 + spec.h + 0.11, spec.l * 0.22);
    group.add(scoop);
    const spoiler = new THREE.Mesh(box, bodyMat);
    spoiler.scale.set(spec.w * 0.9, 0.12, 0.3);
    spoiler.position.set(0, 0.55 + spec.h + 0.3, -spec.l * 0.48);
    group.add(spoiler);
  }
  if (kind === 'bus' || kind === 'shuttle') {
    // A long window band down the side and a roof sign: the two
    // details that separate a bus from a tall van at street distance.
    // The shuttle's sign says AIRPORT by colour (blue on white) rather
    // than by text — the game has no text in 3D.
    const band = new THREE.Mesh(box, glassMat);
    band.scale.set(spec.w + 0.04, 0.5, spec.l * 0.7);
    band.position.set(0, 0.55 + spec.h + spec.cabin * 0.4, 0);
    group.add(band);
    const sign = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: kind === 'shuttle' ? 0x2e5f8a : 0xf2c94c }));
    sign.scale.set(1.6, 0.3, 0.6);
    sign.position.set(0, 0.55 + spec.h + spec.cabin + 0.12, 0);
    group.add(sign);
    if (kind === 'shuttle') {
      const stripe = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x2e5f8a }));
      stripe.scale.set(spec.w + 0.02, 0.28, spec.l * 0.8);
      stripe.position.set(0, 0.55 + spec.h * 0.45, 0);
      group.add(stripe);
    }
  }
  if (kind === 'interceptor') {
    // A red-and-blue light bar and a rear spoiler: the interceptor is
    // a patrol car in black, and the bar is how the player tells it
    // apart at four stars before it outruns them.
    const barR = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    barR.scale.set(spec.w * 0.25, 0.22, 0.5);
    barR.position.set(-spec.w * 0.13, 0.55 + spec.h + spec.cabin + 0.12, 0);
    group.add(barR);
    const barB = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    barB.scale.set(spec.w * 0.25, 0.22, 0.5);
    barB.position.set(spec.w * 0.13, 0.55 + spec.h + spec.cabin + 0.12, 0);
    group.add(barB);
    const spoiler = new THREE.Mesh(box, bodyMat);
    spoiler.scale.set(spec.w * 0.9, 0.12, 0.3);
    spoiler.position.set(0, 0.55 + spec.h + 0.3, -spec.l * 0.48);
    group.add(spoiler);
  }
  if (kind === 'limo') {
    // A divider band behind the driver and a long roof: the limo is a
    // sedan stretched to 6.4 m, and the band is what says "not a
    // sedan" from the side.
    const divider = new THREE.Mesh(box, glassMat);
    divider.scale.set(spec.w * 0.86, 0.5, 0.12);
    divider.position.set(0, 0.55 + spec.h + spec.cabin * 0.5, spec.l * 0.1);
    group.add(divider);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(box, headMat);
    head.scale.set(0.35, 0.18, 0.1);
    head.position.set(sx * (spec.w / 2 - 0.35), 0.85, spec.l / 2);
    group.add(head);
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10), tyreMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * (spec.w / 2 - 0.05), 0.36, sz * (spec.l / 2 - 0.85));
      group.add(wheel);
    }
  }
  group.userData.spec = spec;
  return group;
}

// A car in the world: position, heading, speed, and whether the player or
// the traffic brain owns it.
export function createCar(kind, x, z, angle) {
  return {
    kind,
    mesh: buildCarMesh(kind),
    x,
    z,
    angle,
    speed: 0,
    steer: 0,
    // Traffic brain state.
    road: null, // 'x' | 'z': which axis the car travels along
    dir: 1,
    lane: 0,
    target: 0, // coordinate of the next intersection along its axis
    stuck: 0,
  };
}

export function placeCar(car, scene) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  scene.add(car.mesh);
}

// --- Traffic ---

function pickRoad(rng, centres) {
  const c = rng.pick(centres);
  return { road: rng.chance(0.5) ? 'x' : 'z', line: c, dir: rng.chance(0.5) ? 1 : -1 };
}

export function createTraffic(city, rng, count, scene) {
  const cars = [];
  const used = new Set();
  for (let i = 0; i < count; i += 1) {
    const pick = pickRoad(rng, city.centres);
    const lane = pick.dir * 3.2;
    const along = rng.range(-city.half + 10, city.half - 10);
    const key = `${pick.road}:${pick.line}:${Math.round(along / 30)}`;
    if (used.has(key)) continue;
    used.add(key);
    const x = pick.road === 'x' ? along : pick.line + lane;
    const z = pick.road === 'x' ? pick.line + lane : along;
    const angle = pick.road === 'x' ? (pick.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (pick.dir > 0 ? 0 : Math.PI);
    const car = createCar(
      // Weighted traffic: sedans and taxis dominate, vans and trucks
      // are common, muscle is rarer, and a bus or a limo shows up
      // about as often as a second taxi — enough that the north
      // streets feel busy without the city turning into a bus depot.
      rng.pickWeighted(
        ['sedan', 'taxi', 'van', 'sedan', 'truck', 'muscle', 'bus', 'limo'],
        [4, 3, 2, 1, 2, 2, 1, 1],
      ),
      x, z, angle,
    );
    car.road = pick.road;
    car.dir = pick.dir;
    car.lane = lane;
    car.speed = KINDS[car.kind].speed * rng.range(0.8, 1.05);
    // Next intersection ahead of it.
    const axis = pick.road === 'x' ? x : z;
    const ahead = city.centres.filter((c) => (pick.dir > 0 ? c > axis + 2 : c < axis - 2));
    car.target = ahead.length ? (pick.dir > 0 ? Math.min(...ahead) : Math.max(...ahead)) : (pick.dir > 0 ? CITY.half : -CITY.half);
    placeCar(car, scene);
    cars.push(car);
  }
  return cars;
}

function trafficTurn(car, city, rng) {
  // At an intersection: 60% keep going, 40% turn onto the crossing street.
  if (rng.chance(0.6)) {
    const axis = car.road === 'x' ? car.x : car.z;
    const ahead = city.centres.filter((c) => (car.dir > 0 ? c > axis + 2 : c < axis - 2));
    car.target = ahead.length ? (car.dir > 0 ? Math.min(...ahead) : Math.max(...ahead)) : (car.dir > 0 ? CITY.half : -CITY.half);
    return;
  }
  const fromLine = car.road === 'x' ? car.z - car.lane : car.x - car.lane;
  const newDir = rng.chance(0.5) ? 1 : -1;
  car.road = car.road === 'x' ? 'z' : 'x';
  car.dir = newDir;
  car.lane = newDir * 3.2;
  if (car.road === 'x') {
    car.z = fromLine + car.lane;
    car.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.x = fromLine + car.lane;
    car.angle = newDir > 0 ? 0 : Math.PI;
  }
  const axis = car.road === 'x' ? car.x : car.z;
  const ahead = city.centres.filter((c) => (car.dir > 0 ? c > axis + 2 : c < axis - 2));
  car.target = ahead.length ? (car.dir > 0 ? Math.min(...ahead) : Math.max(...ahead)) : (car.dir > 0 ? CITY.half : -CITY.half);
}

export function stepTraffic(cars, city, rng, dt, others) {
  for (const car of cars) {
    const axis = car.road === 'x' ? car.x : car.z;
    const reached = car.dir > 0 ? axis >= car.target : axis <= car.target;
    if (reached) trafficTurn(car, city, rng);
    // Slow down for a car close ahead on the same lane.
    let want = KINDS[car.kind].speed;
    for (const other of others) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 9 || dist < 0.1) continue;
      const forward = car.road === 'x' ? (dx * car.dir) / dist : (dz * car.dir) / dist;
      const lateral = car.road === 'x' ? Math.abs(dz) : Math.abs(dx);
      if (forward > 0.6 && lateral < 2.5) {
        want = Math.min(want, Math.max(0, other.speed - 2));
      }
    }
    car.speed += (want - car.speed) * Math.min(1, dt * 1.5);
    const step = car.speed * dt;
    if (car.road === 'x') car.x += step * car.dir;
    else car.z += step * car.dir;
    // Out of the city: wrap to the far side on the same road. The wrap
    // line (half + 4) sits well inside the BOUNDS fence (half + 14), so
    // traffic never touches the fence: it turns around on its own road
    // instead of driving out of town.
    const half = CITY.half;
    if (car.road === 'x' && (car.x > half + 4 || car.x < -half - 4)) car.x = -car.dir * (half + 2);
    if (car.road === 'z' && (car.z > half + 4 || car.z < -half - 4)) car.z = -car.dir * (half + 2);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.angle;
  }
}

// --- Player driving ---

// --- Player driving ---

// A kind's top traffic speed, for the police chase: patrol cars chase
// at 19 and interceptors at 22, both faster than any civilian kind's
// cruise speed, so the chase is won by turning, not by outrunning
// them on a straight road.
export function chaseSpeed(kind) {
  if (kind === 'interceptor') return 22;
  if (kind === 'police') return 19;
  return (KINDS[kind] ?? KINDS.sedan).speed;
}

// Cab work starts here: a car counts as a taxi for the side job when
// its kind is 'taxi' — a parked yellow cab or one pulled out of
// traffic, both carry the roof sign buildCarMesh adds. No other kind
// can start a shift, so stealing a sedan never offers a fare by
// accident, and a police car never does either.
export function isTaxiCar(car) {
  return car != null && car.kind === 'taxi';
}

// --- Police roadblocks ---
// A roadblock is three striped barriers across a road plus the two
// patrol cars that stand behind them, built by main.js when the heat
// hits three stars. The barriers are real colliders in the city's
// list, so ramming one is a crash like any other; clearRoadblock
// removes the meshes and the colliders together, so a cleared
// roadblock leaves nothing invisible behind. The barrier meshes are
// red-and-white striped by alternating boxes, because the game has
// no stripe texture.
export function createRoadblock(scene, city, x, z, angle) {
  const group = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const red = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f2e8 });
  const colliders = [];
  // Three barriers across the road, 3.4 m apart, each a 3.6 m striped
  // board on two legs. The road is 14 m wide; the barriers cover the
  // middle 10 m and leave a gap at each kerb the player can thread —
  // a roadblock is a problem to drive around, not a wall.
  for (let i = -1; i <= 1; i += 1) {
    const bx = x + Math.cos(angle) * i * 3.4;
    const bz = z - Math.sin(angle) * i * 3.4;
    for (let s = -1; s <= 1; s += 1) {
      const seg = new THREE.Mesh(box, s === 0 ? white : red);
      seg.scale.set(1.2, 0.7, 0.18);
      seg.position.set(bx + Math.sin(angle) * s * 1.2, 0.9, bz + Math.cos(angle) * s * 1.2);
      seg.rotation.y = angle;
      group.add(seg);
    }
    for (const sx of [-1.4, 1.4]) {
      const leg = new THREE.Mesh(box, red);
      leg.scale.set(0.18, 0.9, 0.18);
      leg.position.set(bx + Math.cos(angle) * sx, 0.45, bz - Math.sin(angle) * sx);
      group.add(leg);
    }
    const c = { x: bx, z: bz, hx: 1.9, hz: 1.9 };
    colliders.push(c);
    city.colliders.push(c);
  }
  group.position.set(0, 0, 0);
  scene.add(group);
  return { group, colliders };
}

export function clearRoadblock(scene, city, rb) {
  if (!rb) return;
  scene.remove(rb.group);
  for (const c of rb.colliders) {
    const i = city.colliders.indexOf(c);
    if (i >= 0) city.colliders.splice(i, 1);
  }
}

export function stepPlayerCar(car, input, dt, city, grip = 1) {
  const spec = KINDS[car.kind];
  const forward = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  // Grip scales the whole model: in the rain (grip 0.75) the car
  // accelerates slower, brakes longer, and steers less, so a wet
  // chase really does slide wider than a dry one. The grip comes
  // from the weather system; dry weather passes 1 and the model is
  // exactly the one the earlier revisions tuned.
  if (forward) car.speed += CAR.accel * grip * dt;
  else if (back) {
    if (car.speed > 0.5) car.speed -= CAR.brake * grip * dt;
    else car.speed -= CAR.reverseAccel * grip * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * grip * dt);
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(spec.speed * 2.1 * (0.75 + 0.25 * grip), car.speed));
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerSpeed = CAR.steer * (0.7 + 0.3 * grip) * Math.max(0.35, 1 - Math.abs(car.speed) / (spec.speed * 2.4));
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  // Turn rate scales with speed and reverses when reversing.
  car.angle += car.steer * steerSpeed * dt * Math.min(1, Math.abs(car.speed) / 8) * Math.sign(car.speed);
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  const fixed = resolveCollisions(city, nx, nz, 1.6);
  if (fixed.hit && Math.abs(car.speed) > 4) {
    car.speed *= 0.4; // a thud, not a full stop: arcade, not a sim
  }
  // Hitting the city-limit fence is the same kind of thud as a building,
  // and the car remembers it so main.js can tell the player why the car
  // stopped. The fence line is 14 m past the last street at most, so a
  // car at speed reaches it only by driving off the grid on purpose.
  car.bounded = fixed.bounded;
  if (fixed.bounded && Math.abs(car.speed) > 4) {
    car.speed *= 0.4;
  }
  car.x = fixed.x;
  car.z = fixed.z;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  return fixed.hit;
}
