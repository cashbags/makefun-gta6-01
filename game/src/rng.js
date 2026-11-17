// rng.js — SOLMAR's only source of randomness for the simulation.
// A small mulberry32 generator plus helpers. The world, traffic, pedestrians
// and mission spawns all draw from one seeded stream, so the same seed always
// builds the same city and the same opening traffic. Rendering and audio may
// use the wall clock for visuals, but nothing in the simulation reads
// Math.random() or Date.now(): determinism is a property of this file.
//
// The contract, stated plainly so a later edit does not break it by
// accident: (1) every simulation draw goes through the stream created
// from the ?seed= value — never through Math.random, never through a
// second unseeded generator; (2) the order of draws is part of the
// world, so inserting a draw before existing ones reshuffles
// everything after it — new systems that need randomness take a fork()
// of their own instead of drawing from the shared stream; (3) anything
// that must not move the world at all (the fence, the hills, the
// minimap) draws nothing and derives its numbers from fixed constants
// or its own index. Forks are cheap and deterministic: fork() draws
// one number from the parent and seeds a fresh mulberry32 with it, so
// a subsystem's sequence is stable even when another subsystem is
// added, removed or reordered.
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
    // A shuffled copy of a list, drawn from this stream. Shuffling
    // consumes one draw per element, so it is deterministic like
    // everything else here — but it still disturbs the caller's order,
    // so prefer fork() first and shuffle on the fork when the order of
    // the caller's later draws must stay put.
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    // A standard-normal draw (mean 0, spread 1) by Box–Muller: two
    // uniform draws in, one bell-shaped number out. It consumes two
    // draws, so it disturbs the caller's order exactly like any other
    // draw — fork first when the order after it must stay put. Used
    // for anything that should cluster around a centre with a tail:
    // building heights, crowd pauses, rain-window lengths.
    gaussian() {
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    // One element of a list, weighted: weights[i] is the relative
    // chance of list[i]. The weights need not sum to 1; they must all
    // be non-negative and at least one must be positive. One draw,
    // so the cost is the same as pick() — the rarity lives in the
    // weights, not in extra draws. Traffic uses it for rare kinds
    // (a bus or a limo shows up about as often as a second taxi).
    pickWeighted(list, weights) {
      let total = 0;
      for (const w of weights) total += w;
      let r = next() * total;
      for (let i = 0; i < list.length; i += 1) {
        r -= weights[i];
        if (r <= 0) return list[i];
      }
      return list[list.length - 1];
    },
    // A schedule of `count` start times: the first no earlier than
    // `first`, each lasting a draw inside [durMin, durMax], each gap
    // a draw inside [gapMin, gapMax]. Returns [{start, dur}] sorted
    // by start, deterministic per stream. Weather uses it for the
    // rain windows: the schedule is fixed at build time, so the same
    // seed always rains at the same times and a replay never has to
    // decide when the rain starts.
    sampleSchedule(count, first, durMin, durMax, gapMin, gapMax) {
      const out = [];
      let t = first + next() * (gapMax - gapMin);
      for (let i = 0; i < count; i += 1) {
        const dur = durMin + next() * (durMax - durMin);
        out.push({ start: t, dur });
        t += dur + gapMin + next() * (gapMax - gapMin);
      }
      return out;
    },
  };
}
