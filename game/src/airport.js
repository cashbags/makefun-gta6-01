// airport.js — Solmar International, the north-edge district.
//
// The airport sits on the strip the old city never used: north of
// the last street (z = -150), inside the extended fence
// (BOUNDS.zMin is now -236). It is a second neighbourhood, not a
// backdrop: a terminal the player can walk up to, a hangar, a
// control tower, fuel tanks, a runway with a plane taxiing on it,
// and a shuttle bus the player can steal for mission 6.
// Everything is built from the fork passed in, so the airport
// costs the main seeded stream nothing and the city behind it
// builds exactly as before.
//
// Layout, in world metres (x east, z south, so the airport is the
// negative-z strip):
//   access road   x = 20, z -150 .. -182, 14 m wide, joining the
//                 northernmost street to the terminal forecourt
//   terminal      centred (20, -192), 64 m wide, 16 m deep, 12 m
//                 tall, glass front facing the forecourt, roof sign
//   forecourt     x 0..44, z -196..-178: where the shuttle parks
//                 and the airport crowd walks
//   hangar        centred (-60, -190), 28 m wide, 20 m deep, 14 m
//                 tall, open door facing the taxiway — the
//                 arms-deal site
//   tower         shaft at (95, -190), cab at 26 m, the tallest
//                 thing on the north edge
//   fuel tanks    three cylinders at x -84..-72, z -212
//   taxiway       z = -202, x -80..110
//   runway        z = -218, x -70..110, 16 m wide, with threshold
//                 bars and centre dashes; the taxiing plane runs
//                 on it
//   apron         the whole strip, concrete, at y = 0.07 so it
//                 reads against the city's pale ground
// Colliders are pushed into the same list the city uses, so the
// terminal, hangar, tower, tanks and parked planes all stop cars
// and people exactly like any other building. The runway and
// taxiway have no colliders: the player can drive the full length
// of the runway, which is the point of the finale escape.
import * as THREE from 'three';

export const AIRPORT = {
  x0: -90,
  x1: 130,
  z0: -232,
  z1: -166,
  terminal: { x: 20, z: -192 },
  hangar: { x: -60, z: -190 },
  tower: { x: 95, z: -190 },
  runway: { x: 20, z: -218 },
  // The taxiing plane's path: it runs the runway east, turns, and
  // runs it back west, forever, at 6 m/s. The position is a
  // triangle wave of w.time, so it is deterministic and needs no
  // state of its own.
  taxi: { x0: -60, x1: 100, z: -218, speed: 6 },
  // The taxi stand: the kerb on the forecourt where the yellow cabs
  // wait for airport fares, east of the terminal doors and clear of
  // the shuttle stop (34, -184) and the crowd's walking box
  // (x 0..44, z -196..-178). It is not a mission marker — no job
  // points at it — but it is where an airport fare is picked up and
  // where one of the twelve hidden packages sits, so the forecourt
  // is a place to work as well as a place to arrive.
  taxiStand: { x: 40, z: -180 },
};

// The stand as a fresh point, so a caller that moves it (a package
// offset, a fare pickup) never moves the constant for everyone else.
export function taxiStandSpot() {
  return { x: AIRPORT.taxiStand.x, z: AIRPORT.taxiStand.z };
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

function boxPart(material, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  return mesh;
}

function flatPart(material, w, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

// A parked or taxiing plane, from boxes and one cylinder: fuselage,
// nose cone, wings, tail fin, two engines, nav lights. Big enough
// to read from the terminal forecourt, small enough to sit on the
// apron without touching the fence.
export function buildPlaneMesh() {
  const group = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x2e5f8a });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2530 });
  // Fuselage: a cylinder along x, 18 m long, 2.4 m across, at 2 m up.
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 18, 10), white);
  fus.rotation.z = Math.PI / 2;
  fus.position.y = 2.0;
  group.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 10), white);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(10.5, 2.0, 0);
  group.add(nose);
  // Blue cheatline along the fuselage, so the plane reads as an
  // airliner from the side instead of a white tube.
  group.add(boxPart(blue, 17, 0.5, 2.42, 0, 2.3, 0));
  // Cockpit windows: a dark box at the nose.
  group.add(boxPart(glass, 1.2, 0.7, 2.0, 8.6, 2.5, 0));
  // Wings: one wide flat box through the fuselage, swept back by
  // rotation, plus a tailplane and a fin.
  const wing = boxPart(white, 5, 0.3, 22, 0.5, 1.8, 0);
  wing.rotation.y = 0.28;
  group.add(wing);
  group.add(boxPart(white, 2.2, 0.25, 9, -8.4, 2.2, 0));
  group.add(boxPart(blue, 2.4, 4.2, 0.3, -8.6, 4.4, 0));
  // Two engines under the wings.
  for (const sz of [-1, 1]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3.2, 8), white);
    eng.rotation.z = Math.PI / 2;
    eng.position.set(1.2, 1.1, sz * 5.2);
    group.add(eng);
  }
  // Nav lights: red on the left wingtip, green on the right, white
  // on the tail — the three dots that say "airplane" at night.
  const lights = [
    [0.5, 2.0, -11, 0xff3b30],
    [0.5, 2.0, 11, 0x34c759],
    [-9.5, 2.4, 0, 0xffffff],
  ];
  for (const [lx, ly, lz, color] of lights) {
    group.add(boxPart(new THREE.MeshBasicMaterial({ color }), 0.3, 0.3, 0.3, lx, ly, lz));
  }
  return group;
}

// The taxiing plane: one plane mesh on the runway, moved by
// stepTaxiPlane from the weather clock. It never takes off — it
// taxis east, turns at the threshold, and taxis back west, so the
// runway is alive whenever the player looks north.
export function createTaxiPlane(scene) {
  const mesh = buildPlaneMesh();
  mesh.position.set(AIRPORT.taxi.x0, 0, AIRPORT.taxi.z);
  mesh.rotation.y = Math.PI / 2; // nose east, along the runway
  scene.add(mesh);
  return { mesh, x: AIRPORT.taxi.x0, z: AIRPORT.taxi.z, heading: Math.PI / 2 };
}

export function stepTaxiPlane(plane, time) {
  const { x0, x1, speed } = AIRPORT.taxi;
  const span = x1 - x0;
  const period = (span * 2) / speed;
  const t = time % period;
  // Triangle wave: east for the first half-period, west for the second.
  if (t < span / speed) {
    plane.x = x0 + t * speed;
    plane.heading = Math.PI / 2;
  } else {
    plane.x = x1 - (t - span / speed) * speed;
    plane.heading = -Math.PI / 2;
  }
  plane.z = AIRPORT.taxi.z;
  plane.mesh.position.set(plane.x, 0, plane.z);
  plane.mesh.rotation.y = plane.heading;
}

function addGround(group) {
  const concrete = new THREE.MeshLambertMaterial({ color: 0x9a9a94 });
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
  // Apron: the whole strip, concrete, so the airport reads as one
  // paved place from the air and from the last street south of it.
  group.add(flatPart(concrete,
    AIRPORT.x1 - AIRPORT.x0, AIRPORT.z1 - AIRPORT.z0,
    (AIRPORT.x0 + AIRPORT.x1) / 2, 0.07, (AIRPORT.z0 + AIRPORT.z1) / 2));
  // Access road: from the northernmost street (z = -150) to the
  // forecourt (z = -182), 14 m wide, at the terminal's x. It is the
  // only way in by car, and the roadblock logic snaps to it.
  group.add(flatPart(asphalt, 14, 36, 20, 0.08, -166));
  // Taxiway: the east-west strip the planes and the shuttle use.
  group.add(flatPart(asphalt, 190, 12, 15, 0.08, -202));
  // Runway: dark asphalt with white threshold bars and centre
  // dashes, drawn as thin boxes (not a texture) so the markings
  // stay crisp at any distance. No collider: the player drives it
  // in the finale.
  group.add(flatPart(asphalt, 180, 16, 20, 0.09, -218));
  const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const tx of [-66, -58, 106, 114]) {
    // Threshold bars at both ends, four bars each.
    for (let i = 0; i < 4; i += 1) {
      group.add(boxPart(markMat, 1.2, 0.05, 6, tx, 0.12, -222 + i * 3));
    }
  }
  for (let x = -56; x <= 96; x += 16) {
    group.add(boxPart(markMat, 8, 0.05, 0.8, x, 0.12, -218));
  }
}

function addTerminal(group, colliders) {
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f2e8 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x2a4a5e });
  // Terminal: a long low box with a glass front and a roof sign, so
  // it reads as an airport from the forecourt and as a landmark
  // from the city. The front wall is glass; the sign is a white
  // slab on the roof edge, because the game has no text in 3D.
  group.add(boxPart(new THREE.MeshLambertMaterial({ color: 0xd9c9b8 }), 64, 12, 16, 20, 6, -192));
  group.add(boxPart(glass, 60, 7, 0.6, 20, 4.5, -183.8));
  group.add(boxPart(white, 30, 2.2, 0.8, 20, 13.2, -184.5));
  // Jet bridges: two boxes from the terminal's north face toward
  // the taxiway, where the parked planes stand.
  for (const jx of [4, 36]) {
    group.add(boxPart(white, 3, 2.4, 8, jx, 3.4, -202));
  }
  colliders.push({ x: 20, z: -192, hx: 32, hz: 8 });
}

function addHangar(group, colliders) {
  // Hangar: a tall box with a dark open door on its south face, big
  // enough to park a plane inside. The door is a dark inset box,
  // not a hole — the player meets the buyers outside it, not inside.
  group.add(boxPart(new THREE.MeshLambertMaterial({ color: 0x8fa8c8 }), 28, 14, 20, -60, 7, -190));
  group.add(boxPart(new THREE.MeshLambertMaterial({ color: 0x2a2f38 }), 20, 10, 0.6, -60, 5, -179.8));
  colliders.push({ x: -60, z: -190, hx: 14, hz: 10 });
}

function addTowerAndTanks(group, colliders) {
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f2e8 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x2a4a5e });
  // Control tower: a narrow shaft and a glass cab at 26 m, the
  // tallest thing on the north edge and the player's landmark for
  // "airport" from anywhere in the city.
  group.add(boxPart(white, 4, 24, 4, 95, 12, -190));
  group.add(boxPart(glass, 8, 4, 8, 95, 26, -190));
  group.add(boxPart(new THREE.MeshLambertMaterial({ color: 0xc23b2e }), 8.6, 0.5, 8.6, 95, 28.3, -190));
  colliders.push({ x: 95, z: -190, hx: 2, hz: 2 });
  // Fuel farm: three white cylinders west of the hangar, with a low
  // bund wall around them. Cylinders get box colliders (the
  // collision pass only knows boxes), sized to the cylinder's
  // diameter.
  const tankMat = new THREE.MeshLambertMaterial({ color: 0xf2f2e8 });
  for (let i = 0; i < 3; i += 1) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 6, 12), tankMat);
    tank.position.set(-84 + i * 8, 3, -212);
    group.add(tank);
    colliders.push({ x: -84 + i * 8, z: -212, hx: 3, hz: 3 });
  }
  group.add(boxPart(new THREE.MeshLambertMaterial({ color: 0x9a9a94 }), 30, 1.2, 10, -76, 0.6, -212));
}

function addParkedPlanes(rng, group, colliders) {
  // Two parked planes on the apron, angled to the taxiway, with
  // seeded nose directions (one east, one west) so the same seed
  // always parks them the same way. These two chance draws are the
  // airport's only draws from its fork.
  const parkedPlanes = [
    { x: -10, z: -206, angle: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 },
    { x: 62, z: -206, angle: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 },
  ];
  for (const pp of parkedPlanes) {
    const plane = buildPlaneMesh();
    plane.position.set(pp.x, 0, pp.z);
    plane.rotation.y = pp.angle;
    group.add(plane);
    colliders.push({ x: pp.x, z: pp.z, hx: 9, hz: 4 });
  }
}

function addLights(group) {
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  // Floodlight poles along the runway and the forecourt, so the
  // airport is lit at night (the lamps are basic material, already
  // bright, and the weather system never dims them).
  for (const [lx, lz] of [[-70, -210], [-10, -210], [50, -210], [110, -210], [0, -180], [40, -180]]) {
    group.add(boxPart(poleMat, 0.4, 9, 0.4, lx, 4.5, lz));
    group.add(boxPart(lampMat, 1.8, 0.6, 0.8, lx, 9.2, lz));
  }
  // Windsock near the runway threshold: a pole and an orange cone
  // pointing east, the one moving thing on the ground besides the
  // taxiing plane (it is static geometry; the wind is not simulated).
  group.add(boxPart(poleMat, 0.3, 6, 0.3, -72, 3, -226));
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 3.2, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8722a }),
  );
  sock.rotation.z = -Math.PI / 2;
  sock.position.set(-70.2, 6, -226);
  group.add(sock);
}

// Build the district into the city's group. `rng` is a fork of the
// city's stream; every draw here is the airport's own, so adding or
// removing an airport prop can never reshuffle the city, the traffic
// or the opening pedestrians. Markers, parked spots and ped spots
// are appended to the same arrays the city returns, so missions,
// the shuttle and the crowd all read the airport through the same
// objects as the rest of the map.
export function buildAirport(rng, group, colliders, parkedSpots, pedSpots, markers) {
  addGround(group);
  addTerminal(group, colliders);
  addHangar(group, colliders);
  addTowerAndTanks(group, colliders);
  addParkedPlanes(rng, group, colliders);
  addLights(group);

  // Markers the missions use: the terminal front (mission 6), the
  // hangar door (mission 7), the runway centre (mission 8), and the
  // shuttle's parking spot (mission 6's steal target).
  markers.airport = { x: 20, z: -182 };
  markers.hangar = { x: -60, z: -178 };
  markers.runway = { x: 20, z: -218 };
  markers.shuttle = { x: 34, z: -184 };
  // The shuttle itself: parked at the forecourt, mission-flagged so
  // mission 6's steal stage recognises it.
  parkedSpots.push({ x: 34, z: -184, angle: 0, kind: 'shuttle', mission: 'shuttle' });
  // A couple of ordinary parked cars at the forecourt, so the
  // airport is not only the shuttle: a taxi waiting for fares, a
  // limo.
  parkedSpots.push({ x: 8, z: -182, angle: Math.PI, kind: 'taxi' });
  parkedSpots.push({ x: 44, z: -182, angle: Math.PI, kind: 'limo' });
  // Forecourt ped spots: the crowd spawner in peds.js walks these,
  // and the ordinary respawn loop can use them too.
  for (const [px, pz] of [[6, -186], [14, -180], [26, -186], [38, -180], [20, -178], [30, -188]]) {
    pedSpots.push({ x: px, z: pz });
  }
}
