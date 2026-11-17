# TESTS.md — SOLMAR: how this entry was checked

Everything here was run against the committed repo, in this session,
with the tools in `../tools/` where a tool exists. Nothing below is a
plan or a hope: each line names the command or the script, what it
reported, and the numbers it printed. Where a number varies between
runs (headless frame timing), the range seen is given instead of one
figure.

## The entry program is deterministic

- `MAKEFUN_OUTPUT_DIR=/tmp/gta6-out1 node main.ts` and the same into
  `/tmp/gta6-out2`, then `diff -r /tmp/gta6-out1 /tmp/gta6-out2`:
  no differences. Ran twice in this session — once on the original
  commit and once after the fence work — byte-identical both times.
  The dossier hash after the fence work is
  `sha256 4a3b2aa12b60bec8f7bd663e4924719054b84bf628a617f76916dd4716fee034`.
- The game code never reorders the seeded stream: the fence and hills
  in `city.js` use fixed positions and index-derived heights and draw
  no numbers from the RNG, so the city, the parked cars and the opening
  traffic build exactly as they did before the fence existed.
- No `Math.random()` or `Date.now()` in any simulation file; the only
  wall-clock reads are the render loop and the audio sequencer, which
  never feed simulation state.

## Live play in a real browser

- Served with `node serve.ts --port 8904`, driven in Chromium
  Headless Shell through playwright-core (`tools/playtest.mjs`).
  24 checks, all PASS, zero page errors, zero console errors:
  title → start ($250, 0 stars, mission 0) → steal a parked car with
  E (+1 star, cars stolen 1) → drive (24.0–25.6 m covered across runs)
  → speed shown in km/h → exit with E → shoot (ammo 12 → 11) →
  mission 1 completes at the docks (+$500, cash $750) → mission 2
  completes by stealing the red sports car (+$1,200, cash $1,950) →
  busted by a foot cop at 3 stars ($300 fine, cash $1,650) → Enter
  returns to play → pause overlay → save → reload → CONTINUE offered
  → continue keeps cash $1,650 and mission 2.
- The fence, checked separately (`tools/boundary-probe.mjs`, 9 checks,
  all PASS, zero page errors): driving north stops at z = −163, east
  at x = 171, south at z = 167, walking west stops at x = −171; the
  car reports `bounded: true` and the toast reads "City limits — the
  fence is the end of Solmar."; the docks (−161, 0) and the marina
  (30, 159) both sit inside the fence, so every mission marker stays
  reachable.

## Screenshots are real browser captures

- Captured with `tools/shots.mjs` (playwright-core, Chromium Headless
  Shell, 1280×720, JPEG q80) from the `?shot=` scenes in `shots.json`,
  one file per scene, never rendered from data. Verified from disk
  after capture: all four are 1280×720 and under the 256 KiB cap.
- Re-captured after the fence work, because the fence and hills change
  what the mission shot (docks) shows; the drive and chase shots stage
  inside the grid and the fence is out of frame there.

## The rules, as played

- On foot: WASD moves relative to the camera, Shift runs, Space
  jumps, E takes the nearest car within 3.4 m, click shoots, R
  reloads. Driving: W accelerates, S brakes and reverses, A/D steer.
- Stealing any car adds one wanted star; running a pedestrian over
  adds one and slows the car; bumping traffic at speed is a crash
  (shake + speed cut); hitting the fence is a thud (speed cut + toast,
  throttled to one warning per 4 s).
- Wanted runs 0–5 stars, one star decays after 25 s with no crime and
  no cop in sight; police spawn to match the stars and despawn when
  the heat is off. Busted and wasted both respawn at St. Anselm
  Hospital with a $300 fine.
- Five jobs in order — walk, steal, timed delivery, evade, grab and
  escape — each paying out on completion; the timed drop fails and
  restarts cleanly when the clock runs out.
- Save: the pause menu writes to localStorage; the title screen offers
  CONTINUE when a save exists; a fresh start begins on the road with
  $250.

## Kit check

- `node <kit>/cli/makefun.mjs check --kit <kit> --repo .` on the
  committed HEAD: 4 passed, 0 failed, 16 skipped (the transcript
  gates run on the site's sealed recordings, not locally), 5 checked
  at submission. The entrypoint selects node22, the LICENSE declares
  SPDX MIT, the snapshot is within the intake caps.
