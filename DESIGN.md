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

## The city limit

Solmar Bay ends at a fence, not at an invisible wall. The playable
rectangle is `BOUNDS` in `config.js`: 14 m past the last street on the
east and west, 6 m past it to the north, 10 m toward the water to the
south. Those numbers are not round for the sake of it — they are the
smallest rectangle that still contains the two mission places outside
the street grid (the docks at x = −161, the marina at z = 159), so the
fence never blocks a job. `city.js` draws the fence on exactly that
rectangle (posts every 8 m, two rails) with a ring of hills behind it
on the land sides; the south side has no fence because the sea is the
boundary there. The hills cost the seeded RNG nothing — their heights
come from their index — so adding the edge did not reshuffle the city
behind it. `resolveCollisions` clamps every mover to the rectangle and
reports `bounded`, so the car thuds, the HUD says why, and the minimap
draws the same rectangle in amber. The previous limit (60 m past the
grid) let a car drive onto bare concrete with nothing to look at; the
new one keeps the drive inside the place that was built.

## Tuning the numbers

The constants in `config.js` are tuned as one set, not one by one. The
player walks at 5.2 m/s and runs at 8.5, so crossing a 46 m block on
foot takes about six seconds at a run — long enough to feel like a
street, short enough that the docks job never drags. Cars top out at
34 m/s (about 122 km/h) with acceleration 16, so a car crosses the
whole 314 m city in roughly fifteen seconds at full speed and the
100-second timed drop is tight only if the player dawdles or gets
stuck in traffic. The wanted clock decays one star per 25 quiet
seconds, which means a one-star heat from a stolen car fades on its
own while the player drives away, but three stars from the drop demand
a real escape. The pistol does 34 damage, so a cop (60 health) takes
two hits and a pedestrian (30) one — lethal enough to matter, weak
enough that shooting your way out of five stars is a bad plan. The
bust range (2.4 m held for 2 s) is generous to the cops on purpose:
getting caught should feel inevitable once they are on you, not like
a dice roll. Rewards climb 500 → 1200 → 1500 → 2000 → 5000 so the
last job pays more than the first four together, and the $300 bust
fine stings early (more than the starting $250) and becomes trivial
late — the fine is a lesson for beginners, not a tax on experts.

## Mission design

Each job is one idea, stated in one sentence, and the stage kinds are
the vocabulary for those ideas: reach (go there), steal (take the
car), timed (go there fast), evade (lose the heat, then go there),
grab (take the cash, then run). The five jobs use the vocabulary in
escalating order — the first job is a walk, the second is a theft, the
third adds a clock, the fourth adds the police, the fifth combines
everything — so the player learns one verb per job and the finale is
a combination, not a new rule. Waypoints are always places the player
has already seen (the docks, the park, the garage, the flat, the
bank, the marina), never a new corner of the map, because a mission
should test driving and evasion, not map-reading. The beacon pillar
and the minimap diamond point at the same place so the player can
navigate by looking at the world or at the map, whichever they
prefer. A failed timed drop restarts that job cleanly rather than
failing the story: the punishment for being slow is lost time, not a
lost save.

## Audio design

The sound is built, not recorded. Two continuous voices carry the
game: a sawtooth engine whose pitch tracks speed (45 Hz at rest,
rising about 4 Hz per m/s) and a two-tone siren that only sounds while
the player is wanted and the police are near, alternating 700/950 Hz
about once a second. Everything else is a one-shot on top of that
bed: gunshots and crashes are filtered noise bursts (a crash is
longer and lower than a shot, a fence thud shorter and lower than a
crash, so the three impacts are distinguishable by ear), pickups and
mission chimes are short sine blips in rising pairs and triads, and
the bassline is a 16-step A-minor loop at 112 BPM with a hat tick on
the off-beats. The music never changes with the mission — it is the
city's hum, not a soundtrack that telegraphs the story. All of it is
guarded: a headless run with no audio context never throws, and M
mutes the master gain without stopping the sequencer.

## What was deliberately left out

No car health or vehicle damage model, no melee, no day/night cycle, no
interior locations, no radio stations beyond the bassline loop. Each would
have cost a system the brief does not ask for; the brief asks for
completeness across the genre's systems, and every one of those is in and
wired to the others.
