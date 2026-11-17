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

WASD walk/drive, mouse-drag camera, E steal &amp; exit cars, click shoot, R reload, Space jump, Shift run, Esc pause &amp; save, M sound. Follow the amber beacon to the next job.

## How it is built

- `game/` — the playable game as static files: `index.html`, `src/*.js` (city, traffic, pedestrians, police, missions, combat, HUD, audio, screenshots), three.js vendored as `game/vendor/three.module.min.js`.
- `main.ts` — the entry program (Node 22): copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the vendored make.fun library.
- `screenshots/` — 4 real browser captures of the game's own code (start, driving, police chase, mission).
- `shots.json` — the `?shot=` scenes the captures come from; every scene is a deterministic staged play of the real rules from a fixed seed.
- Deterministic: one seeded RNG drives the city, traffic, pedestrians and police; the same `?seed=` always builds the same Solmar Bay.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qrg7fvky&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
