# CHECK.md — SOLMAR (gta6-01)

How this entry was verified before submission. Every line below is a
check that was actually run in the build session, not a wish list.

## Determinism

- `MAKEFUN_OUTPUT_DIR=/tmp/gta6-a node main.ts` (Node 22.18.0) then the
  same into `/tmp/gta6-b`, `diff -r` — outputs byte-identical.
- Sim randomness comes only from `game/src/rng.js` (mulberry32, seed from
  `?seed=`). No `Date.now()` / `Math.random()` in sim code; rendering and
  audio use the wall clock only for visuals that never feed sim state.
- The same `?shot=` URL captured twice gives byte-identical JPEGs (all 4
  shots, sha256-compared across two capture runs).

## Play-test (headless Chromium, WebGL via SwiftShader)

- `node serve.ts`, then each `?shot=` scene in shots.json opened in
  Chromium Headless Shell: start, drive, chase, mission — all four render
  the 3D city with HUD and minimap, no console errors, no failed requests.
- Live play-test (`tools/playtest.mjs`, 24 checks, all PASS): start,
  steal a car (+1 wanted star), drive (18.3 m covered), shoot (ammo
  12 → 11), mission 1 completes at the docks (+$500), mission 2 completes
  by stealing the red sports car (+$1,200), busted by a foot cop ($300
  fine, respawn at the hospital), pause/save/reload/continue keeps cash
  and mission. Zero page errors.
- Screenshots are real browser captures (playwright-core), 1280x720,
  verified from disk for dimensions and size before bundling (all four
  under the 256 KiB cap: 56,253 / 69,006 / 58,154 / 48,823 bytes).

## Game rules (verified by the live play-test)

- On foot: WASD moves relative to the camera, Shift runs, Space jumps,
  E enters the nearest car within 3.4 m, click shoots, R reloads.
- Driving: W accelerates, S brakes/reverses, A/D steer; stealing any car
  adds one wanted star; running a pedestrian over adds one and slows the
  car; bumping traffic at speed is a crash (shake + speed cut).
- Wanted: stars 0-5, decay one star after 25 s with no crime and no cop
  in sight; police spawn to match the stars (foot cops + patrol cars);
  busted and wasted both respawn at St. Anselm with a $300 fine.
- Missions: five jobs in order — reach, steal, timed delivery, evade,
  grab-and-escape — each paying out on completion and saving the game.
- Save: pause menu saves to localStorage; the title screen offers
  CONTINUE when a save exists; a fresh start begins on the road with $250.

## Entry caps (program/v1, from the kit's gate)

- game/: 14 files, 2.2 MiB (cap 993 files / 48 MiB).
- screenshots/: 4 files, each under 256 KiB (cap 4).
- No network request from the game: every script, import and asset is a
  file under game/ (three.js vendored as `game/vendor/*.min.js`).
