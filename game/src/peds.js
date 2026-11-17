// peds.js — the people on the sidewalks, and the police who chase the
// player. Pedestrians are simple box figures in varied shirts who walk a
// sidewalk, turn at intersections, and run away from gunshots and crashes.
// Police come in two kinds: foot cops who chase on foot and try to bust the
// player at close range, and patrol cars that ram the player's car. All of
// it is deterministic: every decision draws from the seeded stream.
import * as THREE from 'three';
import { CITY, COMBAT } from './config.js';
import { resolveCollisions, isOnRoad } from './city.js';

const SHIRTS = [0xd95f4b, 0x4b8fd9, 0x6fbf5a, 0xe0c04a, 0xb06fd9, 0xe8e2d5, 0x3a3f45, 0xd97ba8];
const PANTS = [0x2a2f38, 0x4a3a2a, 0x5a5f6a, 0x2f4a2f];

export function buildPersonMesh(shirt, pants, police) {
  const group = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a077 });
  const legs = new THREE.Mesh(box, pantsMat);
  legs.scale.set(0.42, 0.75, 0.3);
  legs.position.y = 0.375;
  group.add(legs);
  const torso = new THREE.Mesh(box, shirtMat);
  torso.scale.set(0.52, 0.62, 0.32);
  torso.position.y = 1.06;
  group.add(torso);
  if (police) {
    const badge = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xf2c94c }));
    badge.scale.set(0.12, 0.12, 0.05);
    badge.position.set(0.14, 1.2, 0.18);
    group.add(badge);
    const hat = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0x1f2a44 }));
    hat.scale.set(0.34, 0.12, 0.34);
    hat.position.y = 1.68;
    group.add(hat);
  }
  const head = new THREE.Mesh(box, skinMat);
  head.scale.set(0.34, 0.34, 0.32);
  head.position.y = 1.55;
  group.add(head);
  const armMat = shirtMat;
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(box, armMat);
    arm.scale.set(0.12, 0.55, 0.14);
    arm.position.set(sx * 0.33, 1.05, 0);
    arm.name = sx < 0 ? 'armL' : 'armR';
    group.add(arm);
  }
  return group;
}

export function createPed(rng, x, z) {
  const mesh = buildPersonMesh(rng.pick(SHIRTS), rng.pick(PANTS), false);
  const axis = rng.chance(0.5) ? 'x' : 'z';
  return {
    mesh, x, z, health: COMBAT.pedHealth, dead: false,
    axis, dir: rng.chance(0.5) ? 1 : -1,
    speed: rng.range(1.0, 1.7), walkPhase: rng.range(0, 6.28),
    flee: 0, // seconds of running left
    target: rng.pick([-CITY.half, CITY.half]),
  };
}

export function createCop(x, z) {
  const mesh = buildPersonMesh(0x1f2a44, 0x1f2a44, true);
  return {
    mesh, x, z, health: COMBAT.copHealth, dead: false,
    speed: 4.6, walkPhase: 0, bustTimer: 0, shootTimer: 1,
  };
}

export function placePerson(p, scene) {
  p.mesh.position.set(p.x, 0, p.z);
  scene.add(p.mesh);
}

// Pedestrians walk their sidewalk axis; at the city edge they turn around.
// A scare (gunshot, crash, car bearing down) makes them run the other way.
export function stepPeds(peds, city, rng, dt, scare) {
  for (const p of peds) {
    if (p.dead) continue;
    if (scare) {
      p.flee = 3;
      p.dir = scare.x > p.x ? -1 : 1;
    }
    const speed = p.flee > 0 ? 4.4 : p.speed;
    if (p.flee > 0) p.flee -= dt;
    let nx = p.x;
    let nz = p.z;
    if (p.axis === 'x') nx += p.dir * speed * dt;
    else nz += p.dir * speed * dt;
    if (nx > CITY.half - 2 || nx < -CITY.half + 2 || nz > CITY.half - 2 || nz < -CITY.half + 2) {
      p.dir *= -1;
      nx = p.x;
      nz = p.z;
    }
    const fixed = resolveCollisions(city, nx, nz, 0.4);
    p.x = fixed.x;
    p.z = fixed.z;
    p.walkPhase += dt * (p.flee > 0 ? 11 : 6);
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
    // Swing the arms while walking; a cheap walk cycle from one sine.
    const swing = Math.sin(p.walkPhase) * 0.5;
    const armL = p.mesh.getObjectByName('armL');
    const armR = p.mesh.getObjectByName('armR');
    if (armL) armL.rotation.x = swing;
    if (armR) armR.rotation.x = -swing;
  }
}

// Foot cops run at the player; they shoot (badly) past 6 m and try to bust
// inside bust range. Returns 'busted' when the bust timer completes, and
// pushes shot events (from, damage) into the events list for the caller.
export function stepCops(cops, player, city, dt, events) {
  let busted = false;
  for (const cop of cops) {
    if (cop.dead) continue;
    const dx = player.x - cop.x;
    const dz = player.z - cop.z;
    const dist = Math.hypot(dx, dz) || 0.01;
    const speed = cop.speed;
    const nx = cop.x + (dx / dist) * speed * dt;
    const nz = cop.z + (dz / dist) * speed * dt;
    // Cops do not path around buildings: they slide along them.
    const fixed = resolveCollisions(city, nx, nz, 0.4);
    cop.x = fixed.x;
    cop.z = fixed.z;
    cop.walkPhase += dt * 9;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = Math.atan2(dx, dz);
    const swing = Math.sin(cop.walkPhase) * 0.5;
    const armL = cop.mesh.getObjectByName('armL');
    const armR = cop.mesh.getObjectByName('armR');
    if (armL) armL.rotation.x = swing;
    if (armR) armR.rotation.x = -swing;
    if (player.inCar) {
      cop.bustTimer = 0;
      continue;
    }
    if (dist < 2.4) {
      cop.bustTimer += dt;
      if (cop.bustTimer >= 2.0) busted = true;
    } else {
      cop.bustTimer = Math.max(0, cop.bustTimer - dt);
      cop.shootTimer -= dt;
      if (dist < 30 && cop.shootTimer <= 0) {
        cop.shootTimer = 1.4;
        events.push({ type: 'copShot', from: { x: cop.x, z: cop.z }, damage: 8, hit: dist < 18 });
      }
    }
  }
  return busted;
}

export function nearestPed(peds, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const p of peds) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function isPedOnRoad(city, p) {
  return isOnRoad(city, p.x, p.z);
}
