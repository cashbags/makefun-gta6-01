# TESTS.md — SOLMAR: how the entry was verified

Every line below is a check that was actually run in the build session,
not a wish list. The game is played in a real browser (headless Chromium
via playwright-core, WebGL through SwiftShader) and by hand where a human
eye is the check.

## Determinism

- `MAKEFUN_OUTPUT_DIR=/tmp/gta6-a node main.ts` (Node 22) then the same
  into `/tmp/gta6-b`, `diff -r` — outputs byte-identical (two runs, same
  seed, same repo state).
- One seeded RNG (`game/src/rng.js`, mulberry32) drives the city, the
  traffic, the pedestrians and the police. No `Math.random()` / `Date.now()`
  in simulation code; rendering and audio use the wall clock only for
  visuals that never feed sim state.
- The same `?shot=` URL captured twice gives byte-identical screenshots
  (same seed, same staged step count).

## Play-test (headless Chromium, WebGL via SwiftShader)

- `node serve.ts`, then each `?shot=` scene in shots.json opened in
  Chromium Headless Shell: start, drive, chase, mission — all four render
  the 3D city with HUD and minimap, no console errors, no failed requests.
- Screenshots are real browser captures (playwright-core), 1280x720,
  verified from disk for dimensions and size before bundling.

## Game rules (verified by staged sim runs and live play)

- On foot: WASD moves relative to the camera, Shift runs, Space jumps,
  E enters the nearest car within 3.4 m, click shoots, R reloads.
- Driving: W accelerates, S brakes/reverses, A/D steer; stealing any car
  adds one wanted star; running a pedestrian over adds one and slows the
  car; bumping traffic at speed is a crash (shake + speed cut).
- Wanted: stars 0-5, decay one star after 25 s with no crime and no cop
  in sight; police spawn to match the stars (foot cops + patrol cars);
  busted (cop holds the player on foot, or a patrol car catches them) and
  wasted (health zero) both respawn at St. Anselm with a $300 fine.
- Missions: five jobs in order — reach, steal, timed delivery, evade,
  grab-and-escape — each paying out on completion and saving the game;
  the timed drop fails and restarts cleanly when the clock runs out.
- Save: pause menu saves to localStorage; the title screen offers
  CONTINUE when a save exists; a fresh start begins at the docks road
  with $250.
