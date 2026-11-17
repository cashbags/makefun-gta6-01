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
// sides, 79 m past it to the north (the airport strip), 10 m past it
// toward the water. Every
// mover (player on foot, player car, traffic, cops, pedestrians) is
// clamped to this rectangle by resolveCollisions in city.js, and city.js
// draws the fence and the hills on exactly this line, so the edge of the
// map is something the player can see, not an invisible wall in the
// middle of bare ground.
export const BOUNDS = {
  x: CITY.half + 14,
  // North is further out than the other sides: Solmar International
  // airport occupies the strip z -166..-232, so the fence stands at
  // -236 (half + 79) and the hills behind it move north with it. The
  // ground plane reaches z -247, so the fence still stands on concrete.
  // The docks and marina markers are unchanged; the airport markers
  // (airport, hangar, runway, shuttle) sit inside this rectangle by
  // the same design rule: no mission place is ever outside the fence.
  zMin: -(CITY.half + 79),
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
// (more than the starting $250) and becomes trivial late. The Airport
// Arc continues the climb — 3000 → 6500 → 12000 — so the finale pays
// more than the whole first arc: by then the player is earning it
// against four stars, roadblocks, and wet roads.
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
  // Heat persistence: the wanted level and the lifetime heat total
  // are saved with the game and restored on load, so quitting mid-
  // chase does not wash the heat away. Busted and wasted still clear
  // the stars (the fine is the price of getting caught); the lifetime
  // total never resets, and the HUD shows it as the player's record.
  persistWanted: true,
};
// The sky (weather.js): one full day is 480 s of play, starting at
// 10:00, so a session sees afternoon, dusk and night. Rain comes in
// five seeded windows, the first no earlier than 360 s of play —
// after every staged screenshot has finished — and wet roads cut
// grip to 0.75, so a rainy chase slides wider than a dry one. The
// day is 3 game-minutes per real second: fast enough to see the
// light change inside one mission, slow enough that night driving
// is a phase of the game rather than a flicker.
export const WEATHER = {
  dayLengthSeconds: 480,
  startClockMinutes: 600, // 10:00
  rainWindows: 5,
  firstRainAfterSeconds: 360,
  gripWet: 0.75,
};
// Police roadblocks (vehicles.js builds them, main.js places them):
// at three stars or more, while the player is driving, the PD throws
// a barrier across the road ahead. One roadblock at a time, no sooner
// than 20 s after the last one cleared, gone when the heat is off or
// the player gets 130 m away. The barriers are real colliders, so
// ramming one is a crash like any other — the way through is around,
// or through the gap the patrol cars leave.
export const ROADBLOCK = {
  minStars: 3,
  aheadMetres: 42,
  cooldownSeconds: 20,
  clearDistance: 130,
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
// Cab work (taxi.js): the side-job economy. A fare pays a base fee plus
// a per-metre rate on the straight-line distance between its two stops,
// so the airport run (about 200 m from the docks) pays roughly six
// times a hop across the plaza. Rain pays a surge — wet nights pay
// more because fewer cabs are out — and a driver under three stars
// earns 80% while the dispatcher trusts them less. The ride timer is
// the drive at cruise speed (11 m/s, a taxi's unhurried pace) plus 25 s
// of slack: a direct route with one wrong turn still makes it, a
// sightseeing tour does not. The tip is up to half the fare again,
// scaled by the time left when the passenger gets out, minus $5 per
// crash on the way — smooth and fast pays, rough and late does not.
// The rating starts at 5.0, climbs 0.2 on a clean ride, falls 0.3 per
// crash, and falls 0.5 on a failed or abandoned fare, clamped to 1..5.
export const TAXI = {
  baseFare: 12,
  perMetre: 0.35,
  rainSurge: 1.25,
  lowRatingCut: 0.8,
  lowRatingBelow: 3,
  pickupRadius: 6,
  dropRadius: 6,
  cruiseSpeed: 11,
  timerSlackSeconds: 25,
  tipMaxFraction: 0.5,
  crashTipPenalty: 5,
  ratingStart: 5,
  ratingStepUp: 0.2,
  ratingStepDown: 0.3,
  ratingFailPenalty: 0.5,
};
// Hidden packages (city.js places them, main.js collects them): twelve
// gold cases hidden across Solmar Bay — one per landmark, one at the
// docks, one on the runway, one at the airport taxi stand. Each is
// worth $150 on foot, and finding all twelve pays a $500 completion
// bonus on top, so the set is worth $2,300 to a player who walks the
// whole map. The spots are fixed offsets from the mission markers
// (see PACKAGE_SPOTS in city.js), never drawn from the RNG, so the
// same seed always hides them in the same places and a replay never
// reshuffles the hunt. Only the player on foot can pick one up —
// driving over a case does not count, because the hunt is a walk.
export const PACKAGES = {
  count: 12,
  value: 150,
  bonus: 500,
  pickupRadius: 2,
};
export const MISSIONS = [
  { id: 'fixer', name: 'The Fixer', reward: 500 },
  { id: 'wheels', name: 'Hot Wheels', reward: 1200 },
  { id: 'drop', name: 'The Drop', reward: 1500 },
  { id: 'heat', name: 'Heat', reward: 2000 },
  { id: 'score', name: 'The Big Score', reward: 5000 },
  // The Airport Arc (missions 6–8): the story leaves the city grid
  // for Solmar International. The runway job pays $3,000, the arms
  // deal $6,500, and the finale escape $12,000 — the arc pays more
  // than the first five jobs together, because by then the player is
  // driving at four stars with roadblocks up and rain on the road.
  { id: 'runway', name: 'Runway Job', reward: 3000 },
  { id: 'deal', name: 'The Arms Deal', reward: 6500 },
  { id: 'finale', name: 'The Finale Escape', reward: 12000 },
];
export const SAVE_KEY = 'solmar-save-v1';
