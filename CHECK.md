# CHECK.md — SOLMAR (gta6-01)

What was actually run against this entry, and what each run said.
All of it was run in the verification session on the committed repo,
not assumed from the build session: the numbers below are the ones
this session's runs printed.

## The repo and the kit

- HEAD at verification time is the fence revision (see `git log`);
  the repo is public at `github.com/cashbags/makefun-gta6-01`, owner
  `cashbags`, description and homepage set, topic `makefun`, created
  2026-11-17T15:00:25Z — after the 15:00:00Z opening.
- README carries the three make.fun badges and the referral
  `qrg7fvky`; LICENSE is MIT with an SPDX line; `vendor/makefun-game.ts`
  is byte-identical to the kit starter's copy.
- `makefun check --kit <kit> --repo .`: 4 passed, 0 failed,
  16 skipped, 5 checked at submission. The skipped rows are the
  transcript gates, which the site runs on its sealed recordings;
  nothing local can run them. The entrypoint selects node22 and the
  snapshot (27 files, 2,537,029 bytes at the base commit) sits inside
  the intake caps.

## Determinism

- `MAKEFUN_OUTPUT_DIR=/tmp/gta6-out1 node main.ts`, same into
  `/tmp/gta6-out2`, `diff -r`: byte-identical. Repeated after the
  fence edits and again at the final commit: still byte-identical
  (dossier
  `sha256 1c2634ee5116319857cbee64acb57025ffd4ef31ca1b06dee05195729080605e`).
- The fence and hills draw no RNG, so the seeded city, parked cars
  and opening traffic are unchanged by the fence work.
- The same `?shot=` URL staged twice gives the same frame (fixed
  step count, no clock reads in the simulation).

## Live play (headless Chromium, SwiftShader WebGL)

- `tools/playtest.mjs`, 24 checks, all PASS, zero page errors:
  start ($250, 0 stars, mission 0), steal (+1 star, cars stolen 1),
  drive 24.0–25.6 m, speed in km/h, exit, shoot (ammo 12 → 11),
  mission 1 at the docks (+$500 → $750), mission 2 by stealing the
  red sports car (+$1,200 → $1,950), busted at 3 stars ($300 fine →
  $1,650), Enter back to play, pause/save/reload/CONTINUE keeps cash
  $1,650 and mission 2.
- `tools/boundary-probe.mjs`, 9 checks, all PASS, zero page errors:
  the fence stops a car at z = −163 (north), x = 171 (east),
  z = 167 (south) and a walker at x = −171 (west); `bounded: true`
  and the "City limits" toast appear; docks (−161, 0) and marina
  (30, 159) remain inside the fence.
- Screenshots: real browser captures (`tools/shots.mjs`), 1280×720,
  all four under 256 KiB, re-captured after the fence work and
  verified from disk for dimensions and size.

## Rules confirmed by playing

- On foot: WASD, Shift run, Space jump, E enter car (3.4 m), click
  shoot, R reload. Driving: W/S/A/D, arcade steering that bites
  harder at low speed.
- Steal = +1 star; pedestrian down = +1 star and a slower car;
  traffic bump at speed = crash (shake + speed cut); fence =
  thud (speed cut + toast, one warning per 4 s).
- Stars 0–5, decay one per 25 quiet seconds; police scale with the
  stars; busted and wasted respawn at St. Anselm with a $300 fine.
- Five missions in order (walk, steal, timed delivery, evade, grab
  and escape), each paying out; the timed drop restarts cleanly on
  failure.
- Save to localStorage from the pause menu; CONTINUE on the title
  screen; fresh start $250.

## Entry caps (program/v1, from the kit's gate)

- game/: 14 files, ~2.2 MiB (cap 993 files / 48 MiB).
- screenshots/: 4 files, each under 256 KiB (cap 4).
- No network request from the game: every script, import and asset
  is a file under game/ (three.js vendored as `game/vendor/*.min.js`).
