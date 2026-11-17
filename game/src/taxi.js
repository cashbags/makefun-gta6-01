// taxi.js — SOLMAR's cab-work side job: drive a yellow taxi, pick up
// fares, get paid. The job is a small state machine with no scene of its
// own: main.js owns the wiring (entering a taxi starts a shift, the step
// advances it), this module owns the money and the rules.
//
//   off     — no shift. Entering a taxi offers a fare.
//   waiting — a passenger stands at the pickup marker. Drive the taxi
//             within TAXI.pickupRadius and they board.
//   riding  — the destination is set and the timer runs. Arrive inside
//             TAXI.dropRadius before it hits zero to get paid.
//
// The fare is distance-priced: a base fee plus a per-metre rate, with a
// rain surge (wet nights pay more, because fewer cabs are out) and a
// low-rating cut (a driver under three stars earns 80% — the dispatcher
// trusts them less). The tip is up to half the fare again, scaled by
// how much of the timer is left when the passenger gets out, minus $5
// per crash on the way — smooth and fast pays, rough and late does not.
// The rating starts at 5.0, climbs 0.2 on a clean fast ride, falls 0.3
// per crash, and falls 0.5 when a fare is failed or abandoned, clamped
// to 1..5. None of this touches the story missions: cab work is money
// on the side, available from the first minute, and it never blocks or
// advances a job.
//
// Determinism: the job draws from its own stream, seeded from the
// game's seed at construction (seed ^ 0xCAB5EED), so offering a fare
// costs the shared stream nothing and the city, traffic and police
// build exactly as they did before cab work existed. The fare timer
// runs on step dt, never on the wall clock.
import * as THREE from 'three';
import { TAXI } from './config.js';
import { createRandom } from './rng.js';
import { rainFareMultiplier } from './weather.js';

// Where fares can start and end: places the player already knows, all
// reachable by road and inside the fence. The airport and hangar are in
// the list on purpose — a fare to the terminal is the longest ride in
// the game, and the longest ride pays the most.
export const TAXI_STOPS = [
  'hospital', 'bank', 'garage', 'safehouse', 'shop',
  'docks', 'marina', 'airport', 'hangar', 'shuttle',
];

const STOP_NAMES = {
  hospital: 'St. Anselm Hospital',
  bank: 'Solmar Trust Bank',
  garage: 'Vega Motors',
  safehouse: "Rook's flat",
  shop: 'the corner shops',
  docks: 'the docks',
  marina: 'the marina',
  airport: 'Solmar International',
  hangar: 'the north hangar',
  shuttle: 'the shuttle stop',
};

export function stopName(key) {
  return STOP_NAMES[key] ?? key;
}

// The fare for a ride of `dist` metres, quoted at offer time: base plus
// per-metre, then the rain surge for the weather at the offer, then the
// low-rating cut. Rounded to whole dollars — the HUD never shows cents.
export function fareFor(dist, rain, rating) {
  let fare = TAXI.baseFare + TAXI.perMetre * dist;
  fare *= rainFareMultiplier(rain);
  if (rating < TAXI.lowRatingBelow) fare *= TAXI.lowRatingCut;
  return Math.max(TAXI.baseFare, Math.round(fare));
}

export function createTaxiJob(seed) {
  const stream = createRandom((seed ^ 0xCAB5EED) >>> 0);
  const job = {
    status: 'off', // 'off' | 'waiting' | 'riding'
    pickup: null, // {x, z} + key, while waiting
    pickupKey: null,
    dest: null, // {x, z} + key, while riding
    destKey: null,
    fare: 0,
    timer: 0, // seconds left on the ride
    timerStart: 0, // the timer as set, so the tip can scale on it
    crashes: 0, // bumps and run-overs while riding
    rating: TAXI.ratingStart,
    fares: 0, // fares completed, this save
    earned: 0, // dollars earned from fares, this save
    // Offer a fare: two different stops, one to pick up at and one to
    // drive to, priced on the straight-line distance between them.
    // Returns the offer ({pickup, dest, fare, ...}) or null when a
    // shift is already live. The quoted fare is fixed at the offer —
    // the weather at the pickup, not at the drop, sets the surge.
    offerFare(markers, rain = 0) {
      if (job.status !== 'off') return null;
      const [a, b] = stream.pickN(TAXI_STOPS, 2);
      const pickup = markers[a];
      const dest = markers[b];
      if (!pickup || !dest) return null;
      const dist = Math.hypot(dest.x - pickup.x, dest.z - pickup.z);
      job.pickupKey = a;
      job.destKey = b;
      job.pickup = { x: pickup.x, z: pickup.z };
      job.dest = { x: dest.x, z: dest.z };
      job.fare = fareFor(dist, rain, job.rating);
      job.status = 'waiting';
      return {
        pickup: job.pickup, dest: job.dest, fare: job.fare,
        pickupName: stopName(a), destName: stopName(b), dist: Math.round(dist),
      };
    },
    // The passenger boards: the timer is the drive at cruise speed
    // plus slack, so a direct route with one wrong turn still makes
    // it and a sightseeing tour does not.
    board() {
      if (job.status !== 'waiting') return false;
      const dist = Math.hypot(job.dest.x - job.pickup.x, job.dest.z - job.pickup.z);
      job.timer = dist / TAXI.cruiseSpeed + TAXI.timerSlackSeconds;
      job.timerStart = job.timer;
      job.crashes = 0;
      job.status = 'riding';
      return true;
    },
    // The passenger gets out: fare plus a tip that scales with the
    // time left (up to half the fare again for a fast ride) minus $5
    // per crash. A clean fast ride lifts the rating; a rough one
    // drops it. Returns the payout breakdown for the toast.
    complete() {
      if (job.status !== 'riding') return null;
      const timeLeft = Math.max(0, job.timer / Math.max(1, job.timerStart));
      let tip = Math.round(job.fare * TAXI.tipMaxFraction * timeLeft);
      tip = Math.max(0, tip - TAXI.crashTipPenalty * job.crashes);
      const payout = job.fare + tip;
      job.rating = Math.min(5, Math.max(1,
        job.rating + (job.crashes === 0 ? TAXI.ratingStepUp : -TAXI.ratingStepDown * job.crashes)));
      job.fares += 1;
      job.earned += payout;
      const out = { fare: job.fare, tip, payout, rating: job.rating, destName: stopName(job.destKey) };
      job.status = 'off';
      job.pickup = null;
      job.dest = null;
      return out;
    },
    // The fare is failed — timer out, or the driver abandoned the cab.
    // The rating pays for it; the money does not exist.
    fail() {
      if (job.status === 'off') return;
      job.rating = Math.max(1, job.rating - TAXI.ratingFailPenalty);
      job.status = 'off';
      job.pickup = null;
      job.dest = null;
    },
    cancel() {
      job.status = 'off';
      job.pickup = null;
      job.dest = null;
    },
  };
  return job;
}

// The HUD line for the job, so main.js never formats it twice: the
// standing record when off, the pickup and the quoted fare while
// waiting, the destination and the time left while riding.
export function taxiHudLine(job) {
  if (job.status === 'waiting') {
    return `TAXI Pick up at ${stopName(job.pickupKey)} — $${job.fare} to ${stopName(job.destKey)}`;
  }
  if (job.status === 'riding') {
    return `TAXI To ${stopName(job.destKey)} — $${job.fare} · ${Math.max(0, Math.ceil(job.timer))}s left`;
  }
  return `TAXI ★${job.rating.toFixed(1)} · ${job.fares} fares · $${job.earned.toLocaleString('en-US')} earned`;
}

// The two marker meshes: a yellow octahedron over the pickup, a green
// one over the destination. They bob and spin on game time (passed in
// by main.js), so they read as beacons, not scenery. Only one shows at
// a time — the pickup while waiting, the destination while riding.
export function createTaxiMarkers(scene) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  function marker(color) {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.y = 6;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }
  const pickupMesh = marker(0xf2c94c);
  const destMesh = marker(0x7ee787);
  return {
    showPickup(x, z) {
      pickupMesh.position.set(x, 6, z);
      pickupMesh.visible = true;
      destMesh.visible = false;
    },
    showDest(x, z) {
      destMesh.position.set(x, 6, z);
      destMesh.visible = true;
      pickupMesh.visible = false;
    },
    hideAll() {
      pickupMesh.visible = false;
      destMesh.visible = false;
    },
    step(time, dt) {
      pickupMesh.position.y = 6 + Math.sin(time * 2) * 0.5;
      destMesh.position.y = 6 + Math.sin(time * 2) * 0.5;
      pickupMesh.rotation.y += dt * 2;
      destMesh.rotation.y += dt * 2;
    },
  };
}
