// rng.js — SOLMAR's only source of randomness for the simulation.
// A small mulberry32 generator plus helpers. The world, traffic, pedestrians
// and mission spawns all draw from one seeded stream, so the same seed always
// builds the same city and the same opening traffic. Rendering and audio may
// use the wall clock for visuals, but nothing in the simulation reads
// Math.random() or Date.now(): determinism is a property of this file.
export function createRandom(seed) {
  let a = seed >>> 0;
  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    // Uniform float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Uniform integer in [min, max].
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    // One element of a non-empty array.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    // True with probability p.
    chance(p) {
      return next() < p;
    },
    // A fresh stream forked from this one, for a subsystem that wants its own
    // sequence without disturbing the caller's order.
    fork() {
      return createRandom(Math.floor(next() * 4294967296));
    },
  };
}
