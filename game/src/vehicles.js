// vehicles.js — cars: how they look, how traffic drives them, how the
// player drives one. Every car is boxes: a body, a cabin, four wheels and
// headlights, in a per-kind colour. Traffic follows the road graph: each car
// owns a road and a direction, drives to the next intersection, then either
// keeps going or turns onto the crossing street. The player's car uses a
// simple arcade model (accelerate, brake/reverse, steering that bites more
// at low speed) and stops dead against buildings, which the collision pass
// in city.js enforces.
import * as THREE from 'three';
import { CITY, CAR } from './config.js';
import { resolveCollisions } from './city.js';

const KINDS = {
  sedan: { color: 0x4a6fa5, w: 2.0, l: 4.4, h: 0.75, cabin: 0.62, speed: 11 },
  taxi: { color: 0xf2c94c, w: 2.0, l: 4.4, h: 0.75, cabin: 0.62, speed: 12 },
  van: { color: 0x8a8f96, w: 2.2, l: 5.2, h: 1.5, cabin: 0.9, speed: 9 },
  sport: { color: 0xc23b2e, w: 2.0, l: 4.2, h: 0.6, cabin: 0.5, speed: 15 },
  police: { color: 0x1f2a44, w: 2.0, l: 4.5, h: 0.78, cabin: 0.62, speed: 16 },
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
    const car = createCar(rng.pick(['sedan', 'taxi', 'van', 'sedan']), x, z, angle);
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

export function stepPlayerCar(car, input, dt, city) {
  const spec = KINDS[car.kind];
  const forward = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  if (forward) car.speed += CAR.accel * dt;
  else if (back) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(spec.speed * 2.1, car.speed));
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerSpeed = CAR.steer * Math.max(0.35, 1 - Math.abs(car.speed) / (spec.speed * 2.4));
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
