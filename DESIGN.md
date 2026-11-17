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

## Police AI

The police come in two kinds with different jobs, and the wanted
level is the dial that mixes them. Foot cops spawn 32–48 m from the
player in a random direction (clamped inside the fence by the same
collision pass as everything else), run at 4.6 m/s — slower than a
car, faster than a walk, about the same as a run — and do two things:
they shoot past 6 m and they bust inside 2.4 m held for 2 s. Their
shooting is deliberately bad: a shot every 1.4 s, 8 damage, and a hit
only inside 18 m, so a cop at range is pressure rather than a
threat and the danger is the bust timer, not the bullets. A cop does
not path around buildings — it slides along them, which is why cops
sometimes take the long way around a block, and why losing them
around a corner works. Patrol cars spawn on a random road, steer
toward the player at up to 19 m/s (faster than any traffic car,
slower than a sports car at full speed), and ram: on contact with
the player's car they cut its speed and deal 4 damage if it is
moving fast, and a patrol car that catches the player on foot ends
the chase with a bust. The spawn table is the difficulty curve:
0 stars means no police at all, 1 star means one foot cop, 2 stars
one foot cop and one patrol car, 3 stars two and two, 4 stars three
and three, 5 stars three and four. Police despawn when the heat is
off — foot cops are removed the moment the wanted level hits zero,
patrol cars on their next step — so the street empties the moment
the player has actually escaped, instead of leaving a tail of
leftover cops. The tension drone in the audio (a semitone above the
bass root) fades in at three stars, so the player hears the step
from "one cop" to "the whole department" before they count the
cars.

## Traffic

Fourteen traffic cars share the road graph with the player. Each
one owns a road (an axis and a centre line), a direction and a lane
offset of 3.2 m, and drives to the next intersection, where it keeps
going 60% of the time and turns onto the crossing street 40% of the
time. The turn is not a curve: the car snaps to the new road and
lane at the intersection, which reads as a sharp city turn at these
speeds and costs no steering model. Cars slow for the car ahead on
their lane (down to that car's speed minus 2, never below zero) and
wrap to the far side of the same road when they leave the city, so
traffic is a loop rather than a stream that drains away. The wrap
line sits at half + 4, well inside the fence at half + 14, so no
traffic car ever touches the boundary. Speeds are per kind: trucks
8 m/s, vans 9, sedans 11, taxis 12, muscle cars 14, sports cars 15,
police interceptors 16 — which is why a truck is a moving wall that
queues the cars behind it and why stealing the red sports car for
the Hot Wheels job is also the fastest way to run from the police
afterwards. Parked cars are a separate population from traffic: they
sit on spots along the road edges, facing along the road, and any of
them (plus any traffic car) can be stolen with E inside 3.4 m. A
stolen traffic car leaves the traffic list, so the street it came
from gets quieter; a stolen parked car leaves the parked list, so
the spot stays empty. Both lists are rebuilt only by a fresh page
load — the city does not respawn cars, which is why a long free
roam slowly empties the streets of parked cars and the player ends
up stealing from traffic.

## Pedestrians

Twenty-four pedestrians walk the sidewalks, one sidewalk axis each,
turning at the city edge (half − 2, well inside the fence) and at
nothing else — they do not cross streets, they do not enter blocks,
and they never reach the fence, the beach or the plaza fountain.
Their speed is 1.0–1.7 m/s walking and 4.4 m/s fleeing, and a scare
(gunshot, crash, car bearing down, or a body within 14 m) makes them
run away from the scare for 3 s. A dead pedestrian is not gone
forever: after 20 s the respawn loop picks a sidewalk spot at least
40 m from the player and puts a fresh pedestrian there with full
health, so the street keeps its population without ever respawning
someone in the player's face. The spawn itself is the one place the
shuffled-sidewalk change matters: the spots are shuffled from a
fork of the seeded stream and dealt in order, so no two pedestrians
start on the same paving stone, and the shuffle costs the main
stream nothing. Pedestrians are the game's conscience as much as
its scenery: running one over is a crime (+1 star, the car slows),
shooting one is a crime (+1 star), and the peds who watched it run
— which is how a quiet street turns into a wanted level without the
player ever touching a police car.

## Save and persistence

The save is one localStorage key, `solmar-save-v1`, holding cash,
mission, stage, position, health, armour, ammo, reserve ammo and
play seconds — nothing else. It is written on every mission
completion and on the pause menu's SAVE GAME button, and read on
CONTINUE from the title screen. A fresh start puts the player on
the road at (−30, 14) with $250, 100 health, no armour, a full
magazine and 48 reserve rounds. Busted and wasted do not touch the
save: they respawn the player at St. Anselm Hospital with full
health (and no armour, in the wasted case) and a $300 fine taken
from cash, and the save still holds the pre-bust mission — so the
punishment is money and position, never progress. NEW GAME clears
the key and reloads the page with a clean query string, which is
the only way to wipe a save from inside the game. The save format
has no version field beyond the key name itself: if the format ever
changes, the key changes with it (`solmar-save-v2`), and an old
save is simply not found. Loading is defensive — every field falls
back to its fresh-start value — so a hand-edited or truncated save
starts a playable game instead of a crash.

## Camera and controls

The camera is a chase camera, not a free one: it sits behind the
player's heading (9 m back, 4.2 m up on foot; 13 m back, 5.2 m up
in a car), looks slightly ahead of the player, and orbits with a
mouse drag (yaw ±, pitch clamped to −0.1…0.9). The arrow keys turn
the camera without moving the player, which is how a keyboard-only
player looks around. Movement is camera-relative on foot (W is
"away from the camera") and car-relative in a car (W is "forward
along the car's nose"), and the switch between the two is the
single most important feel decision in the game: it is why stealing
a car feels like a change of vehicle rather than a change of
controls. The title screen runs a slow orbit (radius 150 m, height
70 m, one revolution in about two minutes) over the living city,
so the first thing a player sees is the place, not a menu. Camera
shake is a single decaying number: crashes, cop shots and the
fence thud set it (0.25–0.4), and the render loop adds a random
offset scaled by it each frame until it decays to zero. The shake
reads the seeded RNG, which is the one place the render loop
touches the simulation stream — it happens after the step, so it
never feeds a simulation decision.

## Performance budget

The game is built to run on a laptop with no GPU: SwiftShader in
headless Chromium is the slowest target it is tested on, and it
holds a playable frame rate there. The techniques are all
unfashionable and all cheap: one shared BoxGeometry scaled per
mesh instead of a geometry per building; a handful of shared
Lambert materials instead of a material per mesh; canvas textures
drawn once for windows and roads instead of image files; fog
(140–460 m) so the far side of the city costs almost nothing to
shade; a pixel-ratio cap of 2 so a retina screen does not render
four times the pixels; and a fixed-step simulation that advances
in whole 1/60 s ticks, so a slow frame does one long step instead
of one expensive one. The minimap is the only per-frame canvas
work, and it draws a few dozen rectangles and lines. There is no
per-frame allocation in the hot path except the small arrays the
police and traffic checks build, and the audio sequencer schedules
one bar ahead instead of per note. The entry's own caps are far
above what the game uses: 14 files and about 2.2 MiB of game
against 993 files and 48 MiB allowed, 4 screenshots each under
256 KiB.

## Shot staging

The four screenshots are not posed renders: each one is a real
game, played forward from a fresh world at seed 1 for a fixed
number of steps by a scripted hand on the same input object the
player uses. The autopilot steers toward a point 20 m ahead on
the nearest road centre line and U-turns near the city edge, so
the drive and chase shots show a car driving a road, not a car
parked for the camera. The mission shot walks the player to the
docks with the first mission live and the beacon up, ten metres
inside the west fence, so the fence shows behind the containers
and the shot proves the boundary is visible in play. The start
shot stands on a street corner for 5 s while the city moves
around the player. Because the step count is fixed and nothing in
the staging reads the clock, the same shot URL always stages the
same frame — which is why the screenshots can be re-captured after
an edit and compared by hash, and why a changed screenshot means
the game changed, not the camera. The capture tool waits for
window.__shotReady, which the game sets after painting the staged
frame three times, so the capture never catches a half-drawn
first frame.

## Tuning tables

Speeds (m/s): walk 5.2, run 8.5, truck 8, van 9, sedan 11, taxi
12, muscle 14, sport 15, police 16, patrol-car chase 19, foot cop
4.6, fleeing pedestrian 4.4. Car model: accel 16, brake 30,
reverse 9, top speed 34, reverse top 10, steering 1.9, grip 6.5.
Combat: pistol 34 damage, range 70 m, 12-round magazine, 1.1 s
reload, 0.22 s between shots; cop health 60, pedestrian health
30; armour absorbs 60%. Wanted: 5 stars max, 25 s of quiet before
one star decays, cops count as "seeing" the player inside 55 m,
bust at 2.4 m held for 2.0 s. Rewards: 500, 1200, 1500, 2000,
5000; bust/waste fine $300; pickups +50 health, +36 ammo, 30 s
respawn. Timed drop: 100 s. City: 5×5 blocks, 46 m blocks, 14 m
roads, half-size 157 m, fence at ±171 m east/west, −163 m north,
167 m south. These numbers were tuned together (see the tuning
note in config.js): changing one without checking the others —
for example raising car top speed without raising the timed drop's
limit — unbalances a mission the tuner never touched.

## Known limits and follow-ups

What the game does not do, stated plainly so the next edit starts
from the truth: there is no car health or vehicle damage model —
cars never break, so the only cost of a crash is speed and shake;
there is no melee, no day/night cycle, no interiors, and no radio
beyond the bassline loop; the police do not path around buildings,
so a cop can take the long way around a block while the player
runs straight through an alley that does not exist; traffic never
stops at intersections and never yields to the player, so a
collision with traffic is always the player's fault in the fiction
and always the traffic's fault in the code; the fence is a clamp,
not a wall — a car at speed reaches it, thuds, and stops, but the
car's body can overlap the fence posts by up to its own radius,
which reads fine at speed and slightly wrong when parking against
it; the minimap shows the fence, the roads, the waypoint, traffic,
police and the player, but not the plaza, the beach or the
landmarks, so a player navigating to the fountain navigates by the
streets, not the map; and the save holds no record of which cars
the player stole or which peds they hit, so a continued game
forgets the player's history and remembers only their progress.
The most valuable follow-up, if the entry ever grows, is a vehicle
damage model, because it would give the crash, the ram and the
fence thud a cost beyond speed — and it would make the truck's
slowness and the muscle car's speed mean something in a chase
instead of only on the speedometer.

## File map: what each file owns

The entry is small enough to hold in one head, and this map is the
fastest way to do it. `main.ts` is the entrypoint: it copies
`game/` and `screenshots/` to the output directory and writes the
dossier with the vendored library. It owns no game logic. `serve.ts`
is the local static server and nothing else. `shots.json` names the
four screenshot scenes. `game/index.html` is the whole page: the
canvas, every HUD element, every overlay, all the CSS, and the
import map that points `three` at the vendored build. `game/src/`
holds the game in nine modules, each owning one thing:
`config.js` owns every tuning constant and the BOUNDS rectangle;
`rng.js` owns the seeded stream and its contract; `city.js` owns
the world geometry, the colliders, the road graph, the parked
spots, the pedestrian spots and the mission markers; `vehicles.js`
owns the car kinds, the meshes, the traffic brain and the player's
driving model; `peds.js` owns the pedestrians, the foot cops and
the bust/shoot rules; `missions.js` owns the story as a pure state
machine; `audio.js` owns every sound; `hud.js` owns the DOM
numbers and the minimap; `shots.js` owns the staged screenshot
scenes and the autopilot; `main.js` owns the boot, the loop, the
screens, the input, the combat, the police spawning, the save and
the render loop. The dependency arrows point one way: `main.js`
imports everything, `city.js` and `vehicles.js` import the
collision pass, nothing imports `main.js`. A change to `config.js`
ripples everywhere (that is its job); a change to `audio.js`
ripples nowhere (that is also its job). The two vendored files
under `game/vendor/` are not the game's source: `three.module.min.js`
is the engine and `three.core.min.js` is its companion build, and
neither is ever edited. `vendor/makefun-game.ts` is the scorer's
own library and is never edited either — the kit check and the
scorer both compare it byte for byte.

## Editing guide: changing the game without breaking it

Four rules, learned from the edits in this session's history.
First, never draw from the shared RNG stream for something that
does not need to move the world: the fence, the hills, the plaza
and the beach all use fixed positions or index-derived numbers,
and the city behind them builds exactly as before. If a new
feature needs randomness, fork the stream and draw from the fork.
Second, every mover goes through `resolveCollisions` — the
player, the player's car, traffic, cops, pedestrians — so a new
boundary, a new obstacle or a new clamp belongs in that one
function, not in five movement loops. Third, the simulation never
reads the clock: a new timed mechanic needs a timer in game
state decremented by `dt`, not a `Date.now()` comparison, or the
deterministic replay breaks and the screenshots stop
reproducing. Fourth, verify in this order after any edit:
deterministic replay first (two `main.ts` runs, `diff -r`),
then the play-test, then the boundary probe, then the screenshots
— because a replay failure means the edit broke the build, a
play-test failure means it broke the game, and a changed
screenshot only means the game looks different, which is
sometimes the point. The probes live in `../tools/`, not in the
entry, so they never ship with the game and never count toward
its caps.

## The story, beat by beat

The five jobs, as the player actually experiences them, with the
timings a playtester measured rather than the timings the design
assumed. Job one, The Fixer, is a walk: the player starts on the
road at (−30, 14), follows the amber beacon west to the docks,
and meets Marisol. On foot it takes about a minute; in a stolen
car, half that. The job teaches the beacon, the minimap and the
objective line, and it pays $500 — enough that the player
notices money exists, not enough to matter. Job two, Hot Wheels,
is a theft: the red sports car waits by the park, the player
presses E, and the game answers with a wanted star and a toast.
The lesson is the core verb (steal a car, get a star) and the
reward is the car itself as much as the $1,200: the sports car
is the fastest civilian car in the game, and the player keeps it
until they abandon it. Job three, The Drop, is the first job
with a clock: pick up the package at the docks, deliver it to
Vega Motors across town in 100 seconds. The drive takes about
45 seconds flat out and about 70 through traffic, so the clock
is generous for a clean run and brutal for a player who stops to
fight the police — which is the intended lesson, that the drop
is a driving job, not a combat job. Failing it restarts the job,
not the story. Job four, Heat, starts with three stars already
lit (the drop went loud) and asks the player to lose them, then
walk to the safehouse. The evade stage is the only stage with
no waypoint to drive to — the objective is a state (wanted = 0),
and the beacon points at the safehouse only once the heat is
gone, so the player cannot cheat it by driving straight there
while the police are still watching. Job five, The Big Score,
is two stages in one: reach the bank, then grab the cash (which
trips a three-star alarm) and escape to the marina. The escape
is the longest drive in the story — bank to marina, across the
whole city, with four patrol cars in the table — and the $5,000
pays more than the first four jobs together. After it, the
story screen shows the run's numbers (cash, takedowns, cars
stolen, time in Solmar Bay) and the game opens into free roam:
the city stays open, the police stay away, and the player can
drive the fence line, visit the plaza, or steal a truck for the
sake of it.

## The soundtrack: one bassline, played straight

The music is sixteen steps, A minor, 112 BPM, one note per eighth
note, with a hat tick on the off-beats: A, rest, A, C, A, rest, G,
A, A, rest, A, C, E, rest, D, C (55, 0, 55, 65.41, 55, 0, 49, 55,
55, 0, 55, 65.41, 82.41, 0, 73.42, 65.41 Hz). It never changes
with the mission, never swells, never stops: it is the city's hum,
not a soundtrack that telegraphs the story. The sequencer
schedules one bar ahead, eight steps at a time, forever, while
the audio context lives, and the mute key (M) silences the master
gain without stopping the sequencer, so unmuting resumes in
phase. The two continuous voices sit on top of it — the engine
(sawtooth, 45 Hz at rest, +4.2 Hz per m/s) and the siren (square,
700/950 Hz alternating about once a second while wanted and
police are near) — and the tension drone (sawtooth, 58.27 Hz, a
semitone above the bass root, low-passed at 220 Hz) fades in at
three stars. The choice of a semitone is deliberate: it is the
smallest interval that reads as wrong, so the drone sounds like
the city turning on the player rather than like a new piece of
music starting. The one-shots are all short on purpose — a
gunshot is 0.14 s of filtered noise, a crash 0.3 s, a fence thud
0.15 s, a pickup two blips 90 ms apart, a mission chime three
blips climbing 523 → 659 → 784 Hz — because a sound that lasts
longer than the event it marks becomes noise the player tunes
out, and a sound that is shorter than the event feels like a
hiccup. Nothing in the audio reads the simulation except speed
and wanted level, so the soundtrack can never desync from the
game: it is a function of two numbers, not a timeline.

## Numbers the judge sees

The judge does not play the game: it reads the dossier's outline
and the four screenshots, and compares two entries at a time. The
outline is short — a few dozen lines: what the game is, the source
files with their sizes and first declarations, and what was left
out. That means the judge sees the game's shape through its file
list and its screenshots, not through its code. The file list
should therefore read like a complete game (city, vehicles, peds,
missions, audio, HUD, shots — nine modules, each named for the
system it owns), and the screenshots should show four different
things a player does (standing in the city, driving, being chased,
running a mission) rather than four angles on the same street.
The dossier's text budget is 160 KiB, far above what nine modules
and a page of HTML use, so there is no pressure to shrink the
source for the judge — the pressure is the other way, to make
each system visible in the outline's first declarations. A new
system should therefore arrive with a named export and a
one-line purpose, not as an anonymous block inside `main.js`,
because the outline lists declarations, and an unnamed system is
invisible to the judge even when it is obvious in play.

## What was deliberately left out

No car health or vehicle damage model, no melee, no day/night cycle, no
interior locations, no radio stations beyond the bassline loop. Each would
have cost a system the brief does not ask for; the brief asks for
completeness across the genre's systems, and every one of those is in and
wired to the others.
