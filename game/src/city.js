// city.js — Solmar Bay, built from one seed.
// A 5x5 grid of blocks split by streets, each block holding one to four
// procedural buildings (boxes with a shared canvas window texture, varied
// heights and stucco colours), a park, a marina and a waterfront on the south
// edge, docks on the west edge, and named landmarks the missions point at.
// The module also owns the collision list (axis-aligned boxes) and the road
// graph the traffic and the pedestrians walk on. Nothing here loads a file:
// the window texture is drawn on a canvas at build time.
import * as THREE from 'three';
import { CITY } from './config.js';

const PALETTE = [0xe8b98a, 0xd98c6a, 0x7fb3a3, 0xe6d3a3, 0xc97b7b, 0x8fa8c8, 0xd9c9b8, 0xa8b89a, 0xe0a458, 0x9a8fb8];
const ROOF = [0x5a4a3a, 0x6b5a4a, 0x4a4a52, 0x7a6a55];

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

export function createCity(rng) {
  const group = new THREE.Group();
  const colliders = []; // {x, z, hx, hz} axis-aligned boxes
  const parkedSpots = []; // {x, z, angle, kind}
  const pedSpots = []; // {x, z} sidewalk points
  const markers = {};
  const winTex = windowTexture();
  const roadTex = roadTexture();
  const half = CITY.half;

  // Ground: pale concrete, big enough to reach the waterline.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 220, half * 2 + 260),
    new THREE.MeshLambertMaterial({ color: 0xb8ad98 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 40);
  group.add(ground);

  // Water south of the city, with a sandy strip between city and sea.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 260, 150),
    new THREE.MeshLambertMaterial({ color: 0x2e7f9e }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, half + 78);
  group.add(water);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 220, 10),
    new THREE.MeshLambertMaterial({ color: 0xe0cf9e }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.06, half + 5);
  group.add(sand);

  // Streets: dark strips along every road centre, both directions. A
  // vertical road is a tall plane (width across, length along z); a
  // horizontal road is a wide plane with the dash texture turned 90 deg so
  // the centre line runs along the road, not across it.
  const roadMatV = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadTexH = roadTex.clone();
  roadTexH.center.set(0.5, 0.5);
  roadTexH.rotation = Math.PI / 2;
  roadTexH.needsUpdate = true;
  const roadMatH = new THREE.MeshLambertMaterial({ map: roadTexH });
  const centres = roadCentres();
  for (const c of centres) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, half * 2), roadMatV);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.08, 0);
    group.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, CITY.road), roadMatH);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.08, c);
    group.add(h);
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildingMats = PALETTE.map(
    (color) => new THREE.MeshLambertMaterial({ color, map: winTex }),
  );
  const roofMats = ROOF.map((color) => new THREE.MeshLambertMaterial({ color }));

  function addBuilding(x, z, w, d, h, matIndex) {
    const m = new THREE.Mesh(boxGeo, buildingMats[matIndex % buildingMats.length]);
    m.scale.set(w, h, d);
    m.position.set(x, h / 2, z);
    group.add(m);
    const roof = new THREE.Mesh(boxGeo, roofMats[matIndex % roofMats.length]);
    roof.scale.set(w + 0.6, 0.7, d + 0.6);
    roof.position.set(x, h + 0.35, z);
    group.add(roof);
    // Rooftop box, so the skyline is not flat.
    if (h > 16) {
      const ac = new THREE.Mesh(boxGeo, roofMats[(matIndex + 1) % roofMats.length]);
      ac.scale.set(Math.min(6, w * 0.3), 1.6, Math.min(6, d * 0.3));
      ac.position.set(x + w * 0.15, h + 1.4, z - d * 0.15);
      group.add(ac);
    }
    colliders.push({ x, z, hx: w / 2, hz: d / 2 });
    return { x, z, w, d, h };
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

  function blockCentre(bx, bz) {
    return {
      x: -half + CITY.road + CITY.block / 2 + bx * CITY.pitch,
      z: -half + CITY.road + CITY.block / 2 + bz * CITY.pitch,
    };
  }

  // Park: grass, trees, benches, no colliders but the trunks.
  {
    const p = blockCentre(2, 2);
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.block, CITY.block),
      new THREE.MeshLambertMaterial({ color: 0x5f9e52 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(p.x, 0.1, p.z);
    group.add(grass);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
    for (let i = 0; i < 9; i += 1) {
      const tx = p.x + rng.range(-18, 18);
      const tz = p.z + rng.range(-18, 18);
      const trunk = new THREE.Mesh(boxGeo, trunkMat);
      trunk.scale.set(0.7, 3, 0.7);
      trunk.position.set(tx, 1.5, tz);
      group.add(trunk);
      const leaves = new THREE.Mesh(boxGeo, leafMat);
      leaves.scale.set(3.4, 2.6, 3.4);
      leaves.position.set(tx, 4.2, tz);
      group.add(leaves);
      colliders.push({ x: tx, z: tz, hx: 0.5, hz: 0.5 });
    }
  }

  // Landmarks. Each is a distinct building plus a marker the missions use.
  function landmark(bx, bz, w, d, h, color, name) {
    const p = blockCentre(bx, bz);
    const mat = new THREE.MeshLambertMaterial({ color, map: winTex });
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(p.x, h / 2, p.z);
    group.add(m);
    colliders.push({ x: p.x, z: p.z, hx: w / 2, hz: d / 2 });
    // A sign board on the roof edge so the place reads from the street.
    const sign = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xf2f2e8 }));
    sign.scale.set(Math.min(w, 16), 2.2, 0.8);
    sign.position.set(p.x, h + 1.4, p.z + d / 2 - 0.4);
    group.add(sign);
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
      const m = new THREE.Mesh(boxGeo, contMats[i % 4]);
      const horizontal = i % 2 === 0;
      m.scale.set(horizontal ? 12 : 4, 3.4, horizontal ? 4 : 12);
      m.position.set(dx + (i % 3) * 8 - 8, 1.7, -40 + i * 16);
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
      const pier = new THREE.Mesh(boxGeo, pierMat);
      pier.scale.set(4, 0.8, 22);
      pier.position.set(px, 0.5, half + 12);
      group.add(pier);
    }
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2e8 });
    for (const [bx, bz] of [[-30, half + 22], [10, half + 24]]) {
      const hull = new THREE.Mesh(boxGeo, hullMat);
      hull.scale.set(3.4, 1.6, 9);
      hull.position.set(bx, 0.9, bz);
      group.add(hull);
    }
  }

  // Street lamps along every road, and trees on alternating corners.
  {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x4a8a42 });
    for (const c of centres) {
      for (let s = -half + 10; s < half - 5; s += 34) {
        const pole = new THREE.Mesh(boxGeo, poleMat);
        pole.scale.set(0.35, 6, 0.35);
        pole.position.set(c + CITY.road / 2 + 1.2, 3, s);
        group.add(pole);
        const lamp = new THREE.Mesh(boxGeo, lampMat);
        lamp.scale.set(1.4, 0.5, 0.6);
        lamp.position.set(c + CITY.road / 2 + 0.9, 6.1, s);
        group.add(lamp);
        if (rng.chance(0.5)) {
          const tx = c - CITY.road / 2 - 1.2;
          const tz = s + 12;
          const trunk = new THREE.Mesh(boxGeo, poleMat);
          trunk.scale.set(0.6, 2.6, 0.6);
          trunk.position.set(tx, 1.3, tz);
          group.add(trunk);
          const leaves = new THREE.Mesh(boxGeo, leafMat);
          leaves.scale.set(3, 2.4, 3);
          leaves.position.set(tx, 3.8, tz);
          group.add(leaves);
        }
      }
    }
  }

  // Parked-car spots: along road edges, facing along the road.
  for (const c of centres) {
    for (let s = -half + 22; s < half - 10; s += 44) {
      if (rng.chance(0.45)) {
        parkedSpots.push({ x: c + CITY.road / 2 - 2.6, z: s, angle: rng.chance(0.5) ? 0 : Math.PI, kind: rng.pick(['sedan', 'taxi', 'van', 'sport']) });
      }
      if (rng.chance(0.35)) {
        parkedSpots.push({ x: c - CITY.road / 2 + 2.6, z: s + 18, angle: rng.chance(0.5) ? 0 : Math.PI, kind: rng.pick(['sedan', 'taxi', 'sport']) });
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
      const cloud = new THREE.Mesh(boxGeo, cloudMat);
      cloud.scale.set(rng.range(18, 40), 3, rng.range(10, 18));
      cloud.position.set(rng.range(-half, half), rng.range(55, 75), rng.range(-half, half));
      group.add(cloud);
    }
  }

  return { group, colliders, parkedSpots, pedSpots, markers, centres };
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
        // Centre inside the box: push out along the smallest penetration.
        const px = c.hx + r - Math.abs(x - c.x);
        const pz = c.hz + r - Math.abs(z - c.z);
        if (px < pz) x = c.x + (x >= c.x ? c.hx + r : -c.hx - r);
        else z = c.z + (z >= c.z ? c.hz + r : -c.hz - r);
      }
    }
  }
  // The city has edges: keep the player inside the ground, water included.
  const lim = CITY.half + 60;
  x = Math.max(-lim, Math.min(lim, x));
  z = Math.max(-CITY.half - 6, Math.min(CITY.half + 60, z));
  return { x, z, hit };
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
