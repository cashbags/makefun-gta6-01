// peds.js — the people on the sidewalks, and the police who chase the
// player. Pedestrians are simple box figures in varied shirts who walk a
// sidewalk, turn at intersections, and run away from gunshots and crashes.
// Police come in two kinds: foot cops who chase on foot and try to bust the
// player at close range, and patrol cars that ram the player's car. All of
// it is deterministic: every decision draws from the seeded stream.
// Pedestrians have moods now: commuters walk the sidewalks at a steady
// pace, tourists stroll and stop to look around, joggers run the
// sidewalks faster than a walk and never stop. A few are jaywalkers:
// when their walk timer comes due they cross the road instead of
// turning at the corner, so the streets have people in them, not just
// beside them. The airport has its own crowd, bounded to the terminal
// forecourt, walking between the doors instead of the city grid.
import * as THREE from 'three';
import { CITY, COMBAT } from './config.js';
import { resolveCollisions, isOnRoad } from './city.js';

const SHIRTS = [0xd95f4b, 0x4b8fd9, 0x6fbf5a, 0xe0c04a, 0xb06fd9, 0xe8e2d5, 0x3a3f45, 0xd97ba8];
const PANTS = [0x2a2f38, 0x4a3a2a, 0x5a5f6a, 0x2f4a2f];

// How many pedestrians walk the city at once. main.js spawns exactly
// this many and the respawn loop keeps the count: the dead come back,
// so the number is a population, not a spawn budget. Twenty-four is
// enough that every street has someone on it and few enough that the
// sidewalk never looks like a crowd. The airport crowd (eight more,
// bounded to the terminal forecourt) is separate: the city count
// stays 24, and the terminal gets its own people.
export const PED_COUNT = 24;

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
  // Mood decides the walk: commuters are the default, tourists are
  // slow and stop to look around, joggers are fast and never stop.
  // The mood is drawn at spawn, never in the step, so the step costs
  // the seeded stream nothing and a ped's behaviour is fixed for
  // life — the street reads as people with habits, not dice rolls.
  const mood = rng.pickWeighted(['commuter', 'commuter', 'tourist', 'jogger'], [4, 1, 2, 2]);
  const speed = mood === 'jogger' ? rng.range(2.2, 2.8)
    : mood === 'tourist' ? rng.range(0.8, 1.2)
    : rng.range(1.0, 1.7);
  return {
    mesh, x, z, health: COMBAT.pedHealth, dead: false,
    axis, dir: rng.chance(0.5) ? 1 : -1,
    speed, walkPhase: rng.range(0, 6.28),
    flee: 0, // seconds of running left
    target: rng.pick([-CITY.half, CITY.half]),
    mood,
    // Tourists pause: nextPause is a walkPhase value, pauseLeft counts
    // down in seconds while they stand and look. Both are set at spawn
    // from the same stream, so the pauses are deterministic and the
    // step never draws.
    nextPause: mood === 'tourist' ? rng.range(6, 14) : Infinity,
    pauseLeft: 0,
    pauseGap: 9 + rng.range(0, 5),
    // Jaywalkers cross the road when their timer comes due: jayAt is a
    // walkPhase value, and crossing swaps the walking axis instead of
    // reversing direction, so the ped steps off the sidewalk and
    // across the street. About one ped in five jaywalks.
    jaywalker: rng.chance(0.18),
    jayAt: rng.range(10, 25),
    bounds: null, // set for the airport crowd: {x0, x1, z0, z1}
  };
}

// The airport crowd: eight pedestrians bounded to the terminal
// forecourt (x 0..44, z -196..-178), walking between the terminal
// doors and the shuttle stop. They are ordinary peds with a bounds
// box, so stepPeds keeps them inside it and the respawn loop treats
// them like anyone else — a dead crowd ped comes back on a city
// sidewalk, which is fine: the forecourt refills from the crowd
// spawner's own count only at build time, and eight is enough that
// the terminal never looks empty.
export function createAirportCrowd(city, rng, scene) {
  const crowd = [];
  const bounds = { x0: 0, x1: 44, z0: -196, z1: -178 };
  const spots = city.pedSpots.filter((s) => s.x >= bounds.x0 && s.x <= bounds.x1 && s.z >= bounds.z0 && s.z <= bounds.z1);
  for (let i = 0; i < 8; i += 1) {
    const spot = spots.length ? spots[i % spots.length] : { x: 20, z: -186 };
    const ped = createPed(rng.fork(), spot.x + rng.range(-2, 2), spot.z + rng.range(-2, 2));
    ped.bounds = bounds;
    // The forecourt crowd is mostly tourists and commuters, never
    // joggers: nobody runs for a plane that is still at the gate.
    if (ped.mood === 'jogger') {
      ped.mood = 'tourist';
      ped.speed = 1.0;
    }
    placePerson(ped, scene);
    crowd.push(ped);
  }
  return crowd;
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
// They turn at CITY.half - 2, well inside the BOUNDS fence (half + 14),
// so they never reach the fence: the sidewalks end at the last street and
// the peds stay on the sidewalks. That is deliberate — a pedestrian
// wandering out to the fence would look lost, and the fence is the
// player's boundary, not the city's population boundary.
//
// Three behaviours ride on top of the walk, all decided at spawn so the
// step draws nothing from the stream:
//   bounds — the airport crowd walks inside its forecourt box and turns
//     at the box edges instead of the city edge;
//   tourists — when walkPhase passes nextPause they stand still for
//     2.5 s (looking at the terminal, or the skyline), then walk on;
//   jaywalkers — when walkPhase passes jayAt they swap walking axis
//     instead of turning, stepping off the sidewalk and across the
//     street, then carry on on the other side.
// A scare makes a ped run directly away from the scare on the dominant
// axis (not just flip direction on its current axis), so a gunshot in
// front of a ped sends them away from the shooter, and a car bearing
// down on the sidewalk sends them off it.
// A taxi fare's passenger: the ped stands at the pickup kerb and waits
// instead of walking. tagPassenger marks them; stepPeds keeps a marked
// ped standing (position pinned, arms still) until main.js removes them
// when they board. A waiting passenger never flees, never jaywalks and
// never respawns elsewhere — they are the one person on the street with
// somewhere to be, and it is the taxi.
export function tagPassenger(ped) {
  ped.waiting = true;
  return ped;
}

export function stepPeds(peds, city, rng, dt, scare) {
  for (const p of peds) {
    if (p.dead) continue;
    // A waiting fare stands at the kerb: no walking, no turning, no
    // fleeing from a nearby gunshot — the fare is why they are there.
    // Their mesh is pinned to their spot and the loop moves on, so a
    // passenger costs the step nothing until they board.
    if (p.waiting) {
      p.mesh.position.set(p.x, 0, p.z);
      continue;
    }
    if (scare) {
      p.flee = 3;
      // Run away from the scare on the axis it is closest on: the ped
      // turns to face away, even if that means leaving its sidewalk.
      const dx = p.x - scare.x;
      const dz = p.z - scare.z;
      if (Math.abs(dx) >= Math.abs(dz)) {
        p.axis = 'x';
        p.dir = dx >= 0 ? 1 : -1;
      } else {
        p.axis = 'z';
        p.dir = dz >= 0 ? 1 : -1;
      }
    }
    // Tourists stop to look: while pauseLeft counts down they stand
    // still (walkPhase frozen, arms still), then walk on and schedule
    // the next pause from the gap drawn at spawn.
    if (p.mood === 'tourist' && p.pauseLeft > 0) {
      p.pauseLeft -= dt;
      p.mesh.position.set(p.x, 0, p.z);
      continue;
    }
    if (p.mood === 'tourist' && p.walkPhase >= (p.nextPause ?? Infinity)) {
      p.pauseLeft = 2.5;
      p.nextPause = p.walkPhase + (p.pauseGap ?? 9);
    }
    // Jaywalkers cross when their timer comes due: swap the walking
    // axis and keep the direction, so the ped steps off the sidewalk
    // and across the street instead of turning at the corner.
    if (p.jaywalker && p.walkPhase >= (p.jayAt ?? Infinity)) {
      p.axis = p.axis === 'x' ? 'z' : 'x';
      p.dir = p.dir > 0 ? 1 : -1;
      p.jayAt = p.walkPhase + 20;
    }
    const speed = p.flee > 0 ? 4.4 : p.speed;
    if (p.flee > 0) p.flee -= dt;
    let nx = p.x;
    let nz = p.z;
    if (p.axis === 'x') nx += p.dir * speed * dt;
    else nz += p.dir * speed * dt;
    // The turn-around: the airport crowd turns at its forecourt box,
    // everyone else at the city edge. The box check comes first so a
    // bounded ped never tests the city limit at all.
    if (p.bounds) {
      if (nx > p.bounds.x1 || nx < p.bounds.x0 || nz > p.bounds.z1 || nz < p.bounds.z0) {
        p.dir *= -1;
        nx = p.x;
        nz = p.z;
      }
    } else if (nx > CITY.half - 2 || nx < -CITY.half + 2 || nz > CITY.half - 2 || nz < -CITY.half + 2) {
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
