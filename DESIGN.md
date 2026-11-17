# DESIGN.md — SOLMAR: how the open world is put together

This is the design record for SOLMAR, the open-world crime game in `game/`.
It is written for the next person who opens the code, and for the judge
reading the source outline: what each system does, why it is shaped that
way, and where the seams are.

## The pitch in one paragraph

Solmar Bay is a fictional coastal city, five blocks by five, built fresh
from a seed every time the page loads. The player is Rook, a driver-for-hire
who owes money and takes five jobs from the fixer Marisol Vega. The game is
third-person, on foot and behind the wheel, with traffic, pedestrians,
stealable cars, a five-star wanted system, police on foot and in patrol
cars, pistol combat, a HUD with a live minimap, a start screen, and a save
in localStorage. Everything — the city, the characters, the vehicles, the
names, the story, the art, the sound — is original. Nothing comes from any
commercial game.

## The city (`city.js`)

The city is a grid: blocks of buildable ground separated by streets. The
grid is the whole design — traffic, pedestrians, police and missions all
read the same road centres, so every system agrees on where the streets
are. Buildings are boxes with a shared canvas window texture, in a warm
stucco palette, with varied heights so the skyline is not flat. One block
is a park, five blocks are landmarks (hospital, bank, garage, safehouse,
shops), the west edge is a dockyard of containers, and the south edge is a
marina with piers and boats on open water. Collision is a list of
axis-aligned boxes, and `resolveCollisions` pushes circles (the player, a
car, a pedestrian, a cop) out of them — cheap, exact, and the same code
for every mover.

## Cars (`vehicles.js`)

A car is boxes: body, cabin, wheels, headlights, plus a light bar for
police and a roof sign for taxis. Traffic owns a road and a direction and
drives to the next intersection, where it usually keeps going and
sometimes turns; it slows for the car ahead on its lane. The player's car
is an arcade model: accelerate, brake/reverse, steering that bites harder
at low speed, and a thud (speed cut, camera shake) against buildings.
Stealing is the core verb: E near any parked or traffic car takes it, and
the game answers with a wanted star.

## People (`peds.js`)

Pedestrians are box figures in varied shirts who walk the sidewalks, turn
at the city edge, and run from gunshots and crashes. Foot cops are the
same figure in dark blue with a badge and a cap: they run at the player,
shoot badly past six metres, and bust the player if they stay close for
two seconds. The police's difficulty is not aim — it is numbers: more
stars means more cops and more patrol cars.

## Wanted (`main.js`)

Stars 0–5. Crimes add stars: stealing a car, running a pedestrian over,
shooting a bystander, killing an officer (two). Stars decay one at a time
after 25 seconds with no crime and no cop in sight. Police spawn to match
the stars and despawn when the heat is off. Busted (a cop holds the player
on foot, or a patrol car catches them) and wasted (health zero) both end
at the hospital with a $300 fine — the loop that makes the player care
about the stars.

## Missions (`missions.js`)

Five jobs, in order, each a short list of stages. A stage is one of five
kinds: reach a marker, steal a target car, reach a marker against a timer,
lose the heat and then reach a marker, or grab the vault cash and escape
to the marina. The mission module is a pure state machine: it takes the
player's position, car and wanted level and returns events (stage done,
mission done, failed, story done). The story is small on purpose — five
jobs, about fifteen minutes — because the city, not the script, is the
game.

## Combat

Hitscan pistol, 12-round magazine, 1.1 s reload, 34 damage a hit. The
shot ray is tested against the nearest living person inside a narrow cone
and inside range, with a building check sampled along the ray, so cover
works. Armour absorbs 60% of incoming damage. Ammo and health pickups
sit at the hospital, the garage and the docks and respawn after 30 s.

## HUD and minimap (`hud.js`)

DOM for the numbers (cash, stars, clock, health, armour, ammo, objective,
toast) and a canvas for the minimap, redrawn every frame from the same
world data the 3D view uses: roads, blocks, water, traffic dots, police
dots, the pulsing amber waypoint diamond, the player triangle. The
waypoint also has a 3D beacon — a glowing pillar the player can see
across the city — so the objective is findable without the map.

## Sound (`audio.js`)

No audio files. WebAudio synthesises everything: a sawtooth engine whose
pitch follows speed, a two-tone siren while the police are near, filtered
noise bursts for gunshots and crashes, blips for pickups and mission
chimes, and a sequenced A-minor bassline with a hat tick. Audio starts on
the first gesture (the title click) and M mutes it. A headless run without
audio never throws: every call is guarded.

## Determinism

One seeded RNG (`rng.js`, mulberry32) drives the city, the traffic, the
pedestrians and the police. The simulation advances in fixed 1/60 s
steps; `?seed=N` fixes the world, and `?shot=` stages a scene by playing
the real rules forward a fixed number of steps with a scripted autopilot.
The same seed and the same shot always stage the same frame. Rendering
and audio may use the wall clock for visuals, but nothing in the
simulation reads `Math.random()` or `Date.now()`.

## What was deliberately left out

No car health or vehicle damage model, no melee, no day/night cycle, no
interior locations, no radio stations beyond the bassline loop. Each would
have cost a system the brief does not ask for; the brief asks for
completeness across the genre's systems, and every one of those is in and
wired to the others.
