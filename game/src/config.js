// config.js — SOLMAR's tuning constants in one place.
// The city is a grid: BLOCKS x BLOCKS blocks, each BLOCK metres wide, with a
// ROAD-wide street between neighbours. Everything else (speeds, wanted
// levels, mission rewards, timers) is tuned so a mission takes a couple of
// minutes and a full story run about fifteen.
export const STEP = 1 / 60;
export const CITY = {
  blocks: 5, // blocks per side
  block: 46, // metres of buildable ground per block
  road: 14, // metres of street between blocks
  // Derived half-size of the whole city, used for clamping and the minimap.
  get half() {
    return (this.blocks * (this.block + this.road) + this.road) / 2;
  },
  get pitch() {
    return this.block + this.road;
  },
};
// The playable edge of Solmar Bay, in world metres. The street grid ends
// at CITY.half, but two mission places sit just outside it — the docks 8 m
// past the west edge, the marina 2 m past the south edge — so the fence
// line is drawn a little further out: 14 m past the grid on the land
// sides, 6 m past it to the north, 10 m past it toward the water. Every
// mover (player on foot, player car, traffic, cops, pedestrians) is
// clamped to this rectangle by resolveCollisions in city.js, and city.js
// draws the fence and the hills on exactly this line, so the edge of the
// map is something the player can see, not an invisible wall in the
// middle of bare ground.
export const BOUNDS = {
  x: CITY.half + 14,
  zMin: -(CITY.half + 6),
  zMax: CITY.half + 10,
};
export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 8.5,
  accel: 30,
  jumpSpeed: 7.5,
  radius: 0.55,
  maxHealth: 100,
  maxArmor: 100,
};
// Tuning, as one set (see DESIGN.md for the reasoning behind the
// numbers): the player walks at 5.2 m/s and runs at 8.5, so a 46 m
// block takes about six seconds at a run — a street, not a hike.
// Cars top out at 34 m/s (about 122 km/h) with accel 16, so a car
// crosses the 314 m city in roughly fifteen seconds flat out and the
// 100-second timed drop is tight only if the player dawdles or gets
// stuck in traffic. Steering bites harder at low speed (CAR.steer
// 1.9, scaled up as speed falls), which is what makes parking-lot
// turns possible and highway turns stable in the same model. Wanted
// decays one star per 25 quiet seconds: a one-star heat from a
// stolen car fades while the player drives away, three stars from
// the drop demand a real escape. The pistol does 34 damage — two
// hits for a cop (60 health), one for a pedestrian (30) — lethal
// enough to matter, weak enough that shooting out of five stars is
// a bad plan. Armour absorbs 60% of incoming damage. Rewards climb
// 500 → 1200 → 1500 → 2000 → 5000 so the last job pays more than
// the first four together, and the $300 bust fine stings early
// (more than the starting $250) and becomes trivial late.
export const CAR = {
  accel: 16,
  brake: 30,
  reverseAccel: 9,
  maxSpeed: 34,
  maxReverse: 10,
  steer: 1.9,
  grip: 6.5,
};
export const WANTED = {
  maxStars: 5,
  // Seconds of no crime and no cop in sight before one star falls off.
  decaySeconds: 25,
  // How far away a cop still counts as "seeing" the player.
  sightRange: 55,
  // Busted when a cop stays this close, on foot, this long.
  bustRange: 2.4,
  bustSeconds: 2.0,
};
export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 70,
  magSize: 12,
  reloadSeconds: 1.1,
  fireSeconds: 0.22,
  copHealth: 60,
  pedHealth: 30,
};
export const MISSIONS = [
  { id: 'fixer', name: 'The Fixer', reward: 500 },
  { id: 'wheels', name: 'Hot Wheels', reward: 1200 },
  { id: 'drop', name: 'The Drop', reward: 1500 },
  { id: 'heat', name: 'Heat', reward: 2000 },
  { id: 'score', name: 'The Big Score', reward: 5000 },
];
export const SAVE_KEY = 'solmar-save-v1';
