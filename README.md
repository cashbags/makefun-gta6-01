# makefun-gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/cashbags/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/cashbags/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLMAR — a complete open-world crime game in the spirit of GTA 6, built from scratch in three.js. A living coastal city, Solmar Bay: drive its streets and steal its cars, dodge traffic and pedestrians, outrun a five-star wanted level and the Solmar PD, fight with a pistol, and run eight story missions for the fixer Marisol Vega — from meeting at the docks to the Big Score at Solmar Trust Bank, then three more at Solmar International airport, where the money leaves town and so, in the end, do you. Between jobs, drive a yellow taxi for fares: pick up passengers at the kerb, run them across town against the clock, and build a driver rating that pays. Third-person on foot and behind the wheel, a HUD with health, armour, cash, wanted stars and a live minimap, a day/night cycle with seeded rain that changes how the cars handle, police roadblocks at three stars, a start screen and a save that persists in the browser (including the heat), and fully synthesised sound (engine, sirens, gunshots, rain, thunder, jet rumble, a bassline) with no audio files and no network request anywhere.

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
beach on the south edge. North of the last street is Solmar
International airport: a terminal, a hangar, a control tower, fuel
tanks, a runway with a plane taxiing on it, and the shuttle bus for
the Runway Job. A fence and a ring of hills mark the city
limit; the sea is the boundary to the south. Everything is built
from one seed (`?seed=N`), so the same seed always builds the same
city, the same traffic and the same opening pedestrians — and the
same rain schedule, so the same seed always rains at the same
times.

## The systems

| System | What it does |
| --- | --- |
| Driving | Arcade model: accelerate, brake/reverse, steering that bites harder at low speed; 11 car kinds (sedan, taxi, van, sport, muscle, truck, police, bus, shuttle, interceptor, limo) with their own speed and handling; rain cuts grip to 0.75 |
| Stealing | E near any parked or traffic car takes it (+1 wanted star) |
| Cab work | Get in a yellow taxi: a fare is offered between two known stops, a passenger waits at the kerb, drive them there before the timer runs out — $12 base + $0.35/m, rain surge 1.25×, tip up to half the fare, driver rating 1–5★ that persists in the save |
| Hidden packages | 12 gold cases hidden across the city (one per landmark, docks, runway, airport taxi stand) — $150 each on foot, $500 bonus for the full set; count in the HUD, gold dots on the minimap, found cases persist in the save |
| Wanted | 0–5 stars, decay after 25 quiet seconds, foot cops + patrol cars spawn to match, interceptors at 4 stars, roadblocks across the road at 3 stars while driving, busted/wasted respawn at the hospital with a $300 fine; the wanted level and the lifetime heat total persist across save/load |
| Missions | Eight jobs for the fixer Marisol Vega — walk, steal, timed delivery, evade, grab-and-escape, then the Airport Arc: the Runway Job, the Arms Deal, the Finale Escape — $500 to $12,000 a job |
| Combat | Hitscan pistol, 12-round magazine, 1.1 s reload, 34 damage; armour absorbs 60%; health/ammo pickups respawn every 30 s |
| HUD | Cash, stars, clock, weather chip (in-world time, day phase, rain), health, armour, ammo, objective, story arc, lifetime heat, timed-mission countdown, toast, live minimap with the fence, the airport, waypoint, traffic and police |
| Weather | A day/night cycle (480 s per day from 10:00) and five seeded rain windows; rain darkens the sky, closes the fog in, and cuts road grip |
| People | 24 street pedestrians with moods (commuters, tourists who stop to look, joggers) and jaywalkers, plus an 8-person crowd at the airport terminal |
| Sound | Fully synthesised WebAudio: engine, two-tone siren, tension drone at 3+ stars, gunshots, crashes, fence thud, pickup and mission chimes, rain loop, thunder, airport jet rumble, A-minor bassline — no audio files |
| Save | Pause menu saves to localStorage; CONTINUE on the title screen |

## The story

You are Rook, a driver-for-hire with a borrowed pistol and a debt
to pay. Marisol Vega runs Solmar Bay from the docks, and she has
eight jobs with your name on them: meet her at the docks, steal a
red sports car by the park, run a package to the garage in 100
seconds, lose the police and lay low at the flat, and finish the
first arc with the Big Score at Solmar Trust Bank — grab the vault
cash and escape to the marina. Then the Airport Arc: take the
shuttle at Solmar International and drive it to the docks, take the
crate from the buyers at the north hangar, and finish with the
Finale Escape — reach the runway in 90 seconds, lose the police,
and leave Solmar by boat. Finish all eight and the city is yours
to drive.

## Verification

Independently re-verified in a real browser (headless Chromium):
deterministic `main.ts` output (two runs byte-identical), a 23-check
live play-test (start, steal, drive, shoot, missions 1–2, busted,
save/reload/continue) all passing with zero page errors, a 9-check
fence probe (the car stops at the fence on all four sides — north
now −236, past the airport — the docks, marina, airport and runway
stay reachable), and a 30-check probe of the new systems (missions
6–8 end to end, roadblock, interceptor, heat persistence, rain
grip, night) all passing with zero page errors. See `TESTS.md` and
`CHECK.md` for the runs and the numbers.

## How it is built

- `game/` — the playable game as static files: `index.html`, `src/*.js` (city, airport, weather, taxi, traffic, pedestrians, police, missions, combat, HUD, audio, screenshots), three.js vendored as `game/vendor/three.module.min.js`.
- `main.ts` — the entry program (Node 22): copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the vendored make.fun library.
- `screenshots/` — 4 real browser captures of the game's own code (start, driving, police chase, airport).
- `shots.json` — the `?shot=` scenes the captures come from; every scene is a deterministic staged play of the real rules from a fixed seed.
- Deterministic: one seeded RNG drives the city, traffic, pedestrians, police, weather and the airport; the same `?seed=` always builds the same Solmar Bay.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qrg7fvky&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
