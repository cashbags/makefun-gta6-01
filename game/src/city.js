// city.js — Solmar Bay, built from one seed.
// A 5x5 grid of blocks split by streets, each block holding one to
// four procedural buildings (boxes with a shared canvas window
// texture, varied heights and stucco colours), a park, a marina and
// a waterfront on the south edge, docks on the west edge, and named
// landmarks the missions point at. North of the grid, past the
// last street, is Solmar International airport (airport.js): a
// terminal, a hangar, a control tower, fuel tanks, a runway with a
// taxiing plane, and the shuttle for mission 6. A fence and a ring
// of hills mark the city limit on the BOUNDS rectangle from
// config.js, so the map ends at something visible instead of bare
// ground; the water is the boundary on the south side. The module
// also owns the collision list (axis-aligned boxes) and the road
// graph the traffic and the pedestrians walk on. Nothing here loads
// a file: the window texture is drawn on a canvas at build time.
//
// Draw order is the world: createCity calls its section builders
// in a fixed order and each section draws from the seeded stream
// in the same order it always has — buildings, park trees, street
// trees, parked cars, clouds — so the same seed still builds the
// same city. A section that draws nothing (fence, beach, plaza,
// landmarks) costs the stream nothing and can move freely; a
// section that draws must stay where it is.
import * as THREE from 'three';
import { CITY, BOUNDS, PACKAGES } from './config.js';
import { buildAirport, taxiStandSpot } from './airport.js';

const PALETTE = [0xe8b98a, 0xd98c6a, 0x7fb3a3, 0xe6d3a3, 0xc97b7b, 0x8fa8c8, 0xd9c9b8, 0xa8b89a, 0xe0a458, 0x9a8fb8];
const ROOF = [0x5a4a3a, 0x6b5a4a, 0x4a4a52, 0x7a6a55];

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

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#20242c';
  for (let y = 12; y < 244; y += 28) {
    for (let x = 10; x < 118; x += 28) {
      g.fillRect(x, y, 18, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#33363b';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#f2c94c';
  g.fillRect(30, 16, 4, 96);
  g.fillRect(30, 144, 4, 96);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 8);
  return t;
}

// Road centre lines, one per street, across the whole city.
export function roadCentres() {
  const out = [];
  const start = -CITY.half + CITY.road / 2;
  for (let i = 0; i <= CITY.blocks; i += 1) out.push(start + i * CITY.pitch);
  return out;
}

// The hidden-package table: [marker key, dx, dz] per case, twelve
// rows, one per landmark and one per outlying place. The offsets
// are in metres from the marker, chosen by hand against the map:
// each case sits a few metres off its marker's front, clear of the
// building colliders and on walkable ground, never inside a wall
// and never in the water. 'taxiStand' is not a mission marker — it
// is the airport kerb from airport.js — so createCity resolves it
// through taxiStandSpot() instead of the markers table. The count
// must match PACKAGES.count; createCity throws if it does not, so
// a table edit that drops a row fails loudly at boot, not silently
// in the hunt. The rows stay in this literal form on purpose:
// main.ts counts them with a regex over this file.
const PACKAGE_SPOTS = [
  ['hospital', 10, 6],
  ['bank', -10, 8],
  ['garage', 10, -6],
  ['safehouse', -8, 10],
  ['shop', 12, 4],
  ['docks', 6, 20],
  ['marina', -8, -6],
  ['hangar', 10, 8],
  ['runway', -40, 0],
  ['shuttle', -6, 8],
  ['sportscar', 8, 6],
  ['taxiStand', 4, 2],
];

function addFence(group) {
  // The city limit: a fence on the BOUNDS rectangle plus a ring of
  // hills behind it, so the edge of the playable map reads as a
  // place instead of bare concrete running out. The fence is posts
  // every 8 m with two rails; the hills are big flattened slabs
  // whose heights come from their index, never from the RNG, so
  // the fence costs the seeded stream nothing and the city behind
  // it builds exactly as before. The south side has no fence or
  // hills: the water is the boundary there, and the marina piers
  // already reach past the sand.
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6a6f75 });
  const railMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
  const fenceX = BOUNDS.x;
  const fenceZMin = BOUNDS.zMin;
  const fenceZMax = BOUNDS.zMax;
  for (let z = fenceZMin; z <= fenceZMax; z += 8) {
    for (const x of [-fenceX, fenceX]) {
      group.add(boxPart(postMat, 0.28, 2.2, 0.28, x, 1.1, z));
    }
  }
  for (let x = -fenceX; x <= fenceX; x += 8) {
    for (const z of [fenceZMin, fenceZMax]) {
      group.add(boxPart(postMat, 0.28, 2.2, 0.28, x, 1.1, z));
    }
  }
  const railLenX = fenceX * 2;
  const railLenZ = fenceZMax - fenceZMin;
  for (const y of [0.9, 1.7]) {
    for (const x of [-fenceX, fenceX]) {
      group.add(boxPart(railMat, 0.12, 0.12, railLenZ, x, y, (fenceZMin + fenceZMax) / 2));
    }
    for (const z of [fenceZMin, fenceZMax]) {
      group.add(boxPart(railMat, railLenX, 0.12, 0.12, 0, y, z));
    }
  }
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x6f8a5a });
  const hillMat2 = new THREE.MeshLambertMaterial({ color: 0x7d9468 });
  let hi = 0;
  for (let x = -fenceX - 10; x <= fenceX + 10; x += 26) {
    const h = 8 + ((hi * 7) % 11);
    group.add(boxPart(hi % 2 === 0 ? hillMat : hillMat2, 30, h, 22, x, h / 2 - 0.5, fenceZMin - 22));
    hi += 1;
  }
  for (let z = fenceZMin; z <= fenceZMax; z += 30) {
    for (const side of [-1, 1]) {
      const h = 9 + ((hi * 5) % 10);
      group.add(boxPart(hi % 2 === 0 ? hillMat2 : hillMat, 20, h, 34, side * (fenceX + 24), h / 2 - 0.5, z));
      hi += 1;
    }
  }
}

function addGround(group, half) {
  // Ground: pale concrete, big enough to reach the waterline.
  group.add(flatPart(new THREE.MeshLambertMaterial({ color: 0xb8ad98 }), half * 2 + 220, half * 2 + 260, 0, 0, 40));
  // Water south of the city, with a sandy strip between city and sea.
  group.add(flatPart(new THREE.MeshLambertMaterial({ color: 0x2e7f9e }), half * 2 + 260, 150, 0, 0.05, half + 78));
  group.add(flatPart(new THREE.MeshLambertMaterial({ color: 0xe0cf9e }), half * 2 + 220, 10, 0, 0.06, half + 5));
}

function addRoads(group, centres, half, roadMatV, roadMatH) {
  // Streets: dark strips along every road centre, both directions.
  // A vertical road is a tall plane (width across, length along z);
  // a horizontal road is a wide plane with the dash texture turned
  // 90 deg so the centre line runs along the road, not across it.
  for (const c of centres) {
    group.add(flatPart(roadMatV, CITY.road, half * 2, c, 0.08, 0));
    group.add(flatPart(roadMatH, half * 2, CITY.road, 0, 0.08, c));
  }
}

export function createCity(rng) {
  const group = new THREE.Group();
  const colliders = []; // {x, z, hx, hz} axis-aligned boxes
  const parkedSpots = []; // {x, z, angle, kind}
  const pedSpots = []; // {x, z} sidewalk points
  const markers = {};
  const winTex = windowTexture();
  const roadTex = roadTexture();
  const half = CITY.half;

  addGround(group, half);
  addFence(group);

  const roadMatV = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadTexH = roadTex.clone();
  roadTexH.center.set(0.5, 0.5);
  roadTexH.rotation = Math.PI / 2;
  roadTexH.needsUpdate = true;
  const roadMatH = new THREE.MeshLambertMaterial({ map: roadTexH });
  const centres = roadCentres();
  addRoads(group, centres, half, roadMatV, roadMatH);

  const buildingMats = PALETTE.map(
    (color) => new THREE.MeshLambertMaterial({ color, map: winTex }),
  );
  const roofMats = ROOF.map((color) => new THREE.MeshLambertMaterial({ color }));

  function addBuilding(x, z, w, d, h, matIndex) {
    group.add(boxPart(buildingMats[matIndex % buildingMats.length], w, h, d, x, h / 2, z));
    group.add(boxPart(roofMats[matIndex % roofMats.length], w + 0.6, 0.7, d + 0.6, x, h + 0.35, z));
    // Rooftop box, so the skyline is not flat.
    if (h > 16) {
      group.add(boxPart(roofMats[(matIndex + 1) % roofMats.length],
        Math.min(6, w * 0.3), 1.6, Math.min(6, d * 0.3), x + w * 0.15, h + 1.4, z - d * 0.15));
    }
    colliders.push({ x, z, hx: w / 2, hz: d / 2 });
    return { x, z, w, d, h };
  }

  function blockCentre(bx, bz) {
    return {
      x: -half + CITY.road + CITY.block / 2 + bx * CITY.pitch,
      z: -half + CITY.road + CITY.block / 2 + bz * CITY.pitch,
    };
  }

  // Blocks: fill each with buildings, except the park block and the
  // landmark blocks, which get their own treatment below.
  const parkBlock = { bx: 2, bz: 2 };
  const landmarkBlocks = new Set(['1,1', '3,1', '2,3', '1,3', '3,3', '4,2', '0,2']);
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const cx = -half + CITY.road + CITY.block / 2 + bx * CITY.pitch;
      const cz = -half + CITY.road + CITY.block / 2 + bz * CITY.pitch;
      if (bx === parkBlock.bx && bz === parkBlock.bz) continue;
      if (landmarkBlocks.has(`${bx},${bz}`)) continue;
      const count = rng.int(1, 3);
      if (count === 1) {
        addBuilding(cx, cz, CITY.block * rng.range(0.7, 0.9), CITY.block * rng.range(0.7, 0.9), rng.range(10, 42), rng.int(0, 9));
      } else {
        // Split the block into a row of smaller buildings.
        const vertical = rng.chance(0.5);
        for (let i = 0; i < count; i += 1) {
          const t = (i + 0.5) / count - 0.5;
          if (vertical) addBuilding(cx + t * CITY.block * 0.7, cz, CITY.block * 0.55, CITY.block * rng.range(0.6, 0.85), rng.range(8, 30), rng.int(0, 9));
          else addBuilding(cx, cz + t * CITY.block * 0.7, CITY.block * rng.range(0.6, 0.85), CITY.block * 0.55, rng.range(8, 30), rng.int(0, 9));
        }
      }
    }
  }

  // Park: grass, trees, benches, no colliders but the trunks.
  {
    const p = blockCentre(2, 2);
    group.add(flatPart(new THREE.MeshLambertMaterial({ color: 0x5f9e52 }), CITY.block, CITY.block, p.x, 0.1, p.z));
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
    for (let i = 0; i < 9; i += 1) {
      const tx = p.x + rng.range(-18, 18);
      const tz = p.z + rng.range(-18, 18);
      group.add(boxPart(trunkMat, 0.7, 3, 0.7, tx, 1.5, tz));
      group.add(boxPart(leafMat, 3.4, 2.6, 3.4, tx, 4.2, tz));
      colliders.push({ x: tx, z: tz, hx: 0.5, hz: 0.5 });
    }
  }

  // Landmarks. Each is a distinct building plus a marker the
  // missions use.
  function landmark(bx, bz, w, d, h, color, name) {
    const p = blockCentre(bx, bz);
    const mat = new THREE.MeshLambertMaterial({ color, map: winTex });
    group.add(boxPart(mat, w, h, d, p.x, h / 2, p.z));
    colliders.push({ x: p.x, z: p.z, hx: w / 2, hz: d / 2 });
    // A sign board on the roof edge so the place reads from the
    // street.
    group.add(boxPart(new THREE.MeshLambertMaterial({ color: 0xf2f2e8 }), Math.min(w, 16), 2.2, 0.8, p.x, h + 1.4, p.z + d / 2 - 0.4));
    markers[name] = { x: p.x, z: p.z + d / 2 + 6 };
    return p;
  }
  landmark(1, 1, 30, 22, 14, 0xd9e2e8, 'hospital'); // St. Anselm Hospital
  landmark(3, 1, 34, 24, 26, 0xc9a24a, 'bank'); // Solmar Trust Bank
  landmark(2, 3, 26, 20, 12, 0x7fb3a3, 'garage'); // Vega Motors garage
  landmark(1, 3, 24, 18, 10, 0xe8b98a, 'safehouse'); // Rook's flat
  landmark(3, 3, 28, 20, 16, 0x8fa8c8, 'shop'); // Corner shops

  // Docks on the west edge: containers and crates outside the grid.
  {
    const dx = -half - 8;
    const contMats = [0xb8563e, 0x3e7fb8, 0x5a9e4a, 0xc9a24a].map(
      (c) => new THREE.MeshLambertMaterial({ color: c }),
    );
    for (let i = 0; i < 6; i += 1) {
      const horizontal = i % 2 === 0;
      const m = boxPart(contMats[i % 4],
        horizontal ? 12 : 4, 3.4, horizontal ? 4 : 12,
        dx + (i % 3) * 8 - 8, 1.7, -40 + i * 16);
      group.add(m);
      colliders.push({ x: m.position.x, z: m.position.z, hx: m.scale.x / 2, hz: m.scale.z / 2 });
    }
    markers.docks = { x: dx + 4, z: 0 };
    markers.marina = { x: 30, z: half + 2 };
    markers.package = { x: dx + 4, z: 34 };
    markers.vault = markers.bank;
  }

  // Marina piers jutting into the water, with two boats.
  {
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    for (const px of [-30, 10, 50]) {
      group.add(boxPart(pierMat, 4, 0.8, 22, px, 0.5, half + 12));
    }
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2e8 });
    for (const [bx, bz] of [[-30, half + 22], [10, half + 24]]) {
      group.add(boxPart(hullMat, 3.4, 1.6, 9, bx, 0.9, bz));
    }
  }

  // The beach: the sand strip south of the city is not empty. A
  // lifeguard tower watches the water, and three umbrellas with
  // loungers give the marina a place to be that is not a mission
  // marker. Everything here is fixed-position (no RNG draws), so
  // the beach costs the seeded stream nothing.
  {
    const legMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    const towerMat = new THREE.MeshLambertMaterial({ color: 0xf2f2e8 });
    const towerRoof = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
    // Lifeguard tower at the west end of the beach.
    const towerX = -60;
    const towerZ = half + 5;
    for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      group.add(boxPart(legMat, 0.3, 3.4, 0.3, towerX + lx, 1.7, towerZ + lz));
    }
    group.add(boxPart(towerMat, 3.6, 2.2, 3.6, towerX, 4.5, towerZ));
    group.add(boxPart(towerRoof, 4.4, 0.3, 4.4, towerX, 5.8, towerZ));
    colliders.push({ x: towerX, z: towerZ, hx: 1.8, hz: 1.8 });
    // Umbrellas and loungers down the sand, facing the water.
    const umbrellaCols = [0xc23b2e, 0xf2c94c, 0x4a6fa5];
    const sandMat = new THREE.MeshLambertMaterial({ color: 0xe0cf9e });
    for (let i = 0; i < 3; i += 1) {
      const ux = -20 + i * 30;
      const uz = half + 5;
      group.add(boxPart(legMat, 0.18, 2.6, 0.18, ux, 1.3, uz));
      const canopy = boxPart(new THREE.MeshLambertMaterial({ color: umbrellaCols[i] }), 4.2, 0.25, 4.2, ux, 2.7, uz);
      canopy.rotation.y = Math.PI / 4;
      group.add(canopy);
      group.add(boxPart(sandMat, 1.0, 0.4, 2.4, ux + 3.4, 0.2, uz));
    }
  }

  // The plaza: block (4,2) on the east side was an empty block (it
  // is in the landmark set but has no landmark building), so it
  // becomes the city's square — a fountain, benches and trees, all
  // fixed position, no RNG. The fountain basin is a collider; the
  // benches and trees are low enough to walk around, with trunk
  // colliders on the trees like the park's.
  {
    const p = blockCentre(4, 2);
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
    const basinWater = new THREE.MeshLambertMaterial({ color: 0x2e7f9e });
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    group.add(boxPart(stoneMat, 12, 1.0, 12, p.x, 0.5, p.z));
    group.add(flatPart(basinWater, 10, 10, p.x, 1.05, p.z));
    group.add(boxPart(stoneMat, 1.6, 3.4, 1.6, p.x, 2.7, p.z));
    group.add(boxPart(stoneMat, 3.2, 0.5, 3.2, p.x, 4.6, p.z));
    colliders.push({ x: p.x, z: p.z, hx: 6, hz: 6 });
    for (const [bx, bz, along] of [
      [p.x - 14, p.z, 0], [p.x + 14, p.z, 0],
      [p.x, p.z - 14, 1], [p.x, p.z + 14, 1],
    ]) {
      group.add(boxPart(benchMat, along ? 4.4 : 1.2, 0.5, along ? 1.2 : 4.4, bx, 0.25, bz));
    }
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
    for (const [tx, tz] of [
      [p.x - 16, p.z - 16], [p.x + 16, p.z - 16],
      [p.x - 16, p.z + 16], [p.x + 16, p.z + 16],
    ]) {
      group.add(boxPart(trunkMat, 0.7, 3, 0.7, tx, 1.5, tz));
      group.add(boxPart(leafMat, 3.4, 2.6, 3.4, tx, 4.2, tz));
      colliders.push({ x: tx, z: tz, hx: 0.5, hz: 0.5 });
    }
  }

  // Street lamps along every road, and trees on alternating corners.
  {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x4a8a42 });
    for (const c of centres) {
      for (let s = -half + 10; s < half - 5; s += 34) {
        group.add(boxPart(poleMat, 0.35, 6, 0.35, c + CITY.road / 2 + 1.2, 3, s));
        group.add(boxPart(lampMat, 1.4, 0.5, 0.6, c + CITY.road / 2 + 0.9, 6.1, s));
        if (rng.chance(0.5)) {
          const tx = c - CITY.road / 2 - 1.2;
          const tz = s + 12;
          group.add(boxPart(poleMat, 0.6, 2.6, 0.6, tx, 1.3, tz));
          group.add(boxPart(leafMat, 3, 2.4, 3, tx, 3.8, tz));
        }
      }
    }
  }

  // Parked-car spots: along road edges, facing along the road.
  for (const c of centres) {
    for (let s = -half + 22; s < half - 10; s += 44) {
      if (rng.chance(0.45)) {
        parkedSpots.push({ x: c + CITY.road / 2 - 2.6, z: s, angle: rng.chance(0.5) ? 0 : Math.PI, kind: rng.pick(['sedan', 'taxi', 'van', 'sport', 'muscle', 'truck', 'bus']) });
      }
      if (rng.chance(0.35)) {
        parkedSpots.push({ x: c - CITY.road / 2 + 2.6, z: s + 18, angle: rng.chance(0.5) ? 0 : Math.PI, kind: rng.pick(['sedan', 'taxi', 'sport', 'muscle', 'limo']) });
      }
    }
  }
  // The Hot Wheels target: a red sports car parked by the park.
  const park = blockCentre(2, 2);
  parkedSpots.push({ x: park.x + CITY.block / 2 + CITY.road / 2 - 2.6, z: park.z, angle: 0, kind: 'sport', mission: 'wheels' });
  markers.sportscar = { x: park.x + CITY.block / 2 + CITY.road / 2 - 2.6, z: park.z };

  // Pedestrian spots: on the sidewalks beside every road.
  for (const c of centres) {
    for (let s = -half + 8; s < half - 4; s += 26) {
      pedSpots.push({ x: c + CITY.road / 2 + 1.6, z: s });
      pedSpots.push({ x: c - CITY.road / 2 - 1.6, z: s + 13 });
    }
  }

  // Clouds: flat white slabs drifting far above the city.
  {
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 10; i += 1) {
      const cloud = boxPart(cloudMat, rng.range(18, 40), 3, rng.range(10, 18),
        rng.range(-half, half), rng.range(55, 75), rng.range(-half, half));
      group.add(cloud);
    }
  }

  // Solmar International, on the north strip: built last, from a
  // fork, so the airport's draws never touch the city's stream and
  // the city above builds exactly as it did before the airport
  // existed. The airport appends its own colliders, parked spots,
  // ped spots and mission markers to the same arrays, so the fence
  // (drawn on the extended BOUNDS rectangle) already stands north
  // of it and the missions can point at the terminal, the hangar
  // and the runway.
  buildAirport(rng.fork(), group, colliders, parkedSpots, pedSpots, markers);

  // Hidden packages: twelve gold cases, one per landmark, at fixed
  // offsets from the mission markers — never drawn from the RNG, so
  // the same seed always hides them in the same places and the hunt
  // never reshuffles between replays. The offsets sit a few metres
  // off each marker's front, clear of the building colliders, on
  // ground the player can walk: the hospital case is by the steps,
  // the docks case behind the containers, the runway case out on
  // the open strip, the airport case at the taxi stand (the kerb
  // where the cabs wait, from airport.js, not the terminal doors).
  // The table is the whole placement rule — main.js only builds a
  // mesh per spot and collects it — so moving a case is one row.
  const packageSpots = PACKAGE_SPOTS.map(([key, dx, dz]) => {
    const at = key === 'taxiStand' ? taxiStandSpot() : markers[key];
    return { x: at.x + dx, z: at.z + dz, key };
  });
  if (packageSpots.length !== PACKAGES.count) {
    throw new Error(`package table holds ${packageSpots.length} spots, PACKAGES.count says ${PACKAGES.count}`);
  }

  return { group, colliders, parkedSpots, pedSpots, markers, centres, packageSpots };
}

// Push a circle (x, z, radius) out of every collider it overlaps.
// Returns true when a push happened. Cheap and exact for boxes.
export function resolveCollisions(city, x, z, r) {
  let hit = false;
  for (const c of city.colliders) {
    const nx = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
    const nz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest
        // penetration.
        const px = c.hx + r - Math.abs(x - c.x);
        const pz = c.hz + r - Math.abs(z - c.z);
        if (px < pz) x = c.x + (x >= c.x ? c.hx + r : -c.hx - r);
        else z = c.z + (z >= c.z ? c.hz + r : -c.hz - r);
      }
    }
  }
  // The city has edges: keep every mover inside the fenced BOUNDS
  // rectangle (the docks and the marina sit just inside it by
  // design). `bounded` tells the caller the fence, not a building,
  // stopped the move, so the car can thud and the HUD can say why.
  // The old limit (half + 60) let a car drive 60 m past the last
  // street onto bare concrete; the fence line is 14 m past the grid
  // at most, and the fence and hills are drawn on exactly this line.
  const bx = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, x));
  const bz = Math.max(BOUNDS.zMin, Math.min(BOUNDS.zMax, z));
  const bounded = bx !== x || bz !== z;
  return { x: bx, z: bz, hit, bounded };
}

// True when (x, z) is on a street rather than inside a block.
export function isOnRoad(city, x, z) {
  const half = CITY.half;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  for (const c of city.centres) {
    if (Math.abs(x - c) < CITY.road / 2 + 0.5) return true;
    if (Math.abs(z - c) < CITY.road / 2 + 0.5) return true;
  }
  return false;
}
