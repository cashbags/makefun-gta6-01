# makefun-gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/cashbags/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/cashbags/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLMAR — a complete open-world crime game in the spirit of GTA 6, built from scratch in three.js. A living coastal city, Solmar Bay: drive its streets and steal its cars, dodge traffic and pedestrians, outrun a five-star wanted level and the Solmar PD, fight with a pistol, and run five story missions for the fixer Marisol Vega — from meeting at the docks to the Big Score at Solmar Trust Bank. Third-person on foot and behind the wheel, a HUD with health, armour, cash, wanted stars and a live minimap, a start screen and a save that persists in the browser, and fully synthesised sound (engine, sirens, gunshots, a bassline) with no audio files and no network request anywhere.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

WASD walk/drive, mouse-drag camera, E steal &amp; exit cars, click shoot, R reload, Space jump, Shift run, Esc pause &amp; save, M sound. Follow the amber beacon to the next job. The city ends at a fence with hills behind it (and the sea to the south) — hitting the fence thuds and the HUD says so; the docks and the marina sit just inside it, so no mission is ever blocked by the edge.

## The city

Solmar Bay is a 5×5 grid of blocks (46 m blocks, 14 m streets) on
a coastal edge: a park, a plaza with a fountain, five landmarks
(hospital, bank, garage, safehouse, shops), a dockyard of
containers on the west edge, and a marina with piers, boats and a
beach on the south edge. A fence and a ring of hills mark the city
limit; the sea is the boundary to the south. Everything is built
from one seed (`?seed=N`), so the same seed always builds the same
city, the same traffic and the same opening pedestrians.

## The systems

| System | What it does |
| --- | --- |
| Driving | Arcade model: accelerate, brake/reverse, steering that bites harder at low speed; 7 car kinds (sedan, taxi, van, sport, muscle, truck, police) with their own speed and handling |
| Stealing | E near any parked or traffic car takes it (+1 wanted star) |
| Wanted | 0–5 stars, decay after 25 quiet seconds, foot cops + patrol cars spawn to match, busted/wasted respawn at the hospital with a $300 fine |
| Missions | Five jobs for the fixer Marisol Vega — walk, steal, timed delivery, evade, grab-and-escape — $500 to $5,000 a job |
| Combat | Hitscan pistol, 12-round magazine, 1.1 s reload, 34 damage; armour absorbs 60%; health/ammo pickups respawn every 30 s |
| HUD | Cash, stars, clock, health, armour, ammo, objective, timed-mission countdown, toast, live minimap with the fence, waypoint, traffic and police |
| Sound | Fully synthesised WebAudio: engine, two-tone siren, tension drone at 3+ stars, gunshots, crashes, fence thud, pickup and mission chimes, A-minor bassline — no audio files |
| Save | Pause menu saves to localStorage; CONTINUE on the title screen |

## The story

You are Rook, a driver-for-hire with a borrowed pistol and a debt
to pay. Marisol Vega runs Solmar Bay from the docks, and she has
five jobs with your name on them: meet her at the docks, steal a
red sports car by the park, run a package to the garage in 100
seconds, lose the police and lay low at the flat, and finish with
the Big Score at Solmar Trust Bank — grab the vault cash and escape
to the marina. Finish all five and the city is yours to drive.

## Verification

Independently re-verified in a real browser (headless Chromium):
deterministic `main.ts` output (two runs byte-identical), a 24-check
live play-test (start, steal, drive, shoot, missions 1–2, busted,
save/reload/continue) all passing with zero page errors, and a
9-check fence probe (the car stops at the fence on all four sides,
the docks and marina stay reachable). See `TESTS.md` and `CHECK.md`
for the runs and the numbers.

## How it is built

- `game/` — the playable game as static files: `index.html`, `src/*.js` (city, traffic, pedestrians, police, missions, combat, HUD, audio, screenshots), three.js vendored as `game/vendor/three.module.min.js`.
- `main.ts` — the entry program (Node 22): copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the vendored make.fun library.
- `screenshots/` — 4 real browser captures of the game's own code (start, driving, police chase, mission).
- `shots.json` — the `?shot=` scenes the captures come from; every scene is a deterministic staged play of the real rules from a fixed seed.
- Deterministic: one seeded RNG drives the city, traffic, pedestrians and police; the same `?seed=` always builds the same Solmar Bay.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qrg7fvky&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
