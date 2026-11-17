// city.js — Solmar Bay, built from one seed.
// A 5x5 grid of blocks split by streets, each block holding one to four
// procedural buildings (boxes with a shared canvas window texture, varied
// heights and stucco colours), a park, a marina and a waterfront on the south
// edge, docks on the west edge, and named landmarks the missions point at.
// A fence and a ring of hills mark the city limit on the BOUNDS rectangle
// from config.js, so the map ends at something visible instead of bare
// ground; the water is the boundary on the south side.
// The module also owns the collision list (axis-aligned boxes) and the road
// graph the traffic and the pedestrians walk on. Nothing here loads a file:
// the window texture is drawn on a canvas at build time.
import * as THREE from 'three';
import { CITY, BOUNDS } from './config.js';

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

  // The city limit: a fence on the BOUNDS rectangle plus a ring of hills
  // behind it, so the edge of the playable map reads as a place instead
  // of bare concrete running out. The fence is posts every 8 m with two
  // rails; the hills are big flattened slabs whose heights come from
  // their index, never from the RNG, so the fence costs the seeded
  // stream nothing and the city behind it builds exactly as before.
  // The south side has no fence or hills: the water is the boundary
  // there, and the marina piers already reach past the sand.
  {
    const postMat = new THREE.MeshLambertMaterial({ color: 0x6a6f75 });
    const railMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
    const postGeo = new THREE.BoxGeometry(0.28, 2.2, 0.28);
    const fenceX = BOUNDS.x;
    const fenceZMin = BOUNDS.zMin;
    const fenceZMax = BOUNDS.zMax;
    for (let z = fenceZMin; z <= fenceZMax; z += 8) {
      for (const x of [-fenceX, fenceX]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, 1.1, z);
        group.add(post);
      }
    }
    for (let x = -fenceX; x <= fenceX; x += 8) {
      for (const z of [fenceZMin, fenceZMax]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, 1.1, z);
        group.add(post);
      }
    }
    const railLenX = fenceX * 2;
    const railLenZ = fenceZMax - fenceZMin;
    for (const y of [0.9, 1.7]) {
      for (const x of [-fenceX, fenceX]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, railLenZ), railMat);
        rail.position.set(x, y, (fenceZMin + fenceZMax) / 2);
        group.add(rail);
      }
      for (const z of [fenceZMin, fenceZMax]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(railLenX, 0.12, 0.12), railMat);
        rail.position.set(0, y, z);
        group.add(rail);
      }
    }
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x6f8a5a });
    const hillMat2 = new THREE.MeshLambertMaterial({ color: 0x7d9468 });
    const hillGeo = new THREE.BoxGeometry(1, 1, 1);
    let hi = 0;
    for (let x = -fenceX - 10; x <= fenceX + 10; x += 26) {
      const h = 8 + ((hi * 7) % 11);
      const hill = new THREE.Mesh(hillGeo, hi % 2 === 0 ? hillMat : hillMat2);
      hill.scale.set(30, h, 22);
      hill.position.set(x, h / 2 - 0.5, fenceZMin - 22);
      group.add(hill);
      hi += 1;
    }
    for (let z = fenceZMin; z <= fenceZMax; z += 30) {
      for (const side of [-1, 1]) {
        const h = 9 + ((hi * 5) % 10);
        const hill = new THREE.Mesh(hillGeo, hi % 2 === 0 ? hillMat2 : hillMat);
        hill.scale.set(20, h, 34);
        hill.position.set(side * (fenceX + 24), h / 2 - 0.5, z);
        group.add(hill);
        hi += 1;
      }
    }
  }

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

  // The beach: the sand strip south of the city is not empty. A
  // lifeguard tower watches the water, and three umbrellas with
  // loungers give the marina a place to be that is not a mission
  // marker. Everything here is fixed-position (no RNG draws), so the
  // beach costs the seeded stream nothing.
  {
    const sandMat = new THREE.MeshLambertMaterial({ color: 0xe0cf9e });
    const towerMat = new THREE.MeshLambertMaterial({ color: 0xf2f2e8 });
    const towerRoof = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
    const legMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    // Lifeguard tower at the west end of the beach.
    const towerX = -60;
    const towerZ = half + 5;
    for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      const leg = new THREE.Mesh(boxGeo, legMat);
      leg.scale.set(0.3, 3.4, 0.3);
      leg.position.set(towerX + lx, 1.7, towerZ + lz);
      group.add(leg);
    }
    const cabin = new THREE.Mesh(boxGeo, towerMat);
    cabin.scale.set(3.6, 2.2, 3.6);
    cabin.position.set(towerX, 4.5, towerZ);
    group.add(cabin);
    const roof = new THREE.Mesh(boxGeo, towerRoof);
    roof.scale.set(4.4, 0.3, 4.4);
    roof.position.set(towerX, 5.8, towerZ);
    group.add(roof);
    colliders.push({ x: towerX, z: towerZ, hx: 1.8, hz: 1.8 });
    // Umbrellas and loungers down the sand, facing the water.
    const umbrellaCols = [0xc23b2e, 0xf2c94c, 0x4a6fa5];
    for (let i = 0; i < 3; i += 1) {
      const ux = -20 + i * 30;
      const uz = half + 5;
      const pole = new THREE.Mesh(boxGeo, legMat);
      pole.scale.set(0.18, 2.6, 0.18);
      pole.position.set(ux, 1.3, uz);
      group.add(pole);
      const canopy = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: umbrellaCols[i] }));
      canopy.scale.set(4.2, 0.25, 4.2);
      canopy.position.set(ux, 2.7, uz);
      canopy.rotation.y = Math.PI / 4;
      group.add(canopy);
      const lounger = new THREE.Mesh(boxGeo, sandMat);
      lounger.scale.set(1.0, 0.4, 2.4);
      lounger.position.set(ux + 3.4, 0.2, uz);
      group.add(lounger);
    }
  }

  // The plaza: block (4,2) on the east side was an empty block (it is
  // in the landmark set but has no landmark building), so it becomes
  // the city's square — a fountain, benches and trees, all fixed
  // position, no RNG. The fountain basin is a collider; the benches
  // and trees are low enough to walk around, with trunk colliders on
  // the trees like the park's.
  {
    const p = blockCentre(4, 2);
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
    const basinWater = new THREE.MeshLambertMaterial({ color: 0x2e7f9e });
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    const basin = new THREE.Mesh(boxGeo, stoneMat);
    basin.scale.set(12, 1.0, 12);
    basin.position.set(p.x, 0.5, p.z);
    group.add(basin);
    const waterTop = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      basinWater,
    );
    waterTop.rotation.x = -Math.PI / 2;
    waterTop.position.set(p.x, 1.05, p.z);
    group.add(waterTop);
    const pillar = new THREE.Mesh(boxGeo, stoneMat);
    pillar.scale.set(1.6, 3.4, 1.6);
    pillar.position.set(p.x, 2.7, p.z);
    group.add(pillar);
    const cap = new THREE.Mesh(boxGeo, stoneMat);
    cap.scale.set(3.2, 0.5, 3.2);
    cap.position.set(p.x, 4.6, p.z);
    group.add(cap);
    colliders.push({ x: p.x, z: p.z, hx: 6, hz: 6 });
    for (const [bx, bz, along] of [
      [p.x - 14, p.z, 0], [p.x + 14, p.z, 0],
      [p.x, p.z - 14, 1], [p.x, p.z + 14, 1],
    ]) {
      const bench = new THREE.Mesh(boxGeo, benchMat);
      bench.scale.set(along ? 4.4 : 1.2, 0.5, along ? 1.2 : 4.4);
      bench.position.set(bx, 0.25, bz);
      group.add(bench);
    }
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
    for (const [tx, tz] of [
      [p.x - 16, p.z - 16], [p.x + 16, p.z - 16],
      [p.x - 16, p.z + 16], [p.x + 16, p.z + 16],
    ]) {
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
        parkedSpots.push({ x: c + CITY.road / 2 - 2.6, z: s, angle: rng.chance(0.5) ? 0 : Math.PI, kind: rng.pick(['sedan', 'taxi', 'van', 'sport', 'muscle', 'truck']) });
      }
      if (rng.chance(0.35)) {
        parkedSpots.push({ x: c - CITY.road / 2 + 2.6, z: s + 18, angle: rng.chance(0.5) ? 0 : Math.PI, kind: rng.pick(['sedan', 'taxi', 'sport', 'muscle']) });
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
  // The city has edges: keep every mover inside the fenced BOUNDS
  // rectangle (the docks and the marina sit just inside it by design).
  // `bounded` tells the caller the fence, not a building, stopped the
  // move, so the car can thud and the HUD can say why. The old limit
  // (half + 60) let a car drive 60 m past the last street onto bare
  // concrete; the fence line is 14 m past the grid at most, and the
  // fence and hills are drawn on exactly this line.
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
