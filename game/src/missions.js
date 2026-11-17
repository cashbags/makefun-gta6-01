// missions.js — SOLMAR's story: eight jobs for the fixer Marisol Vega, in
// order, each with a waypoint, an objective line, and a payout. The first
// five are the Vega Jobs in the city; the last three are the Airport Arc
// at Solmar International. The mission state machine is deliberately small: a mission is a list of stages, each
// stage waits for the player to reach a marker (or, for the escape jobs, to
// survive until a condition clears), and finishing a stage advances the
// story. The HUD reads currentObjective() and currentWaypoint() every frame;
// main.js reads the events this module emits (crime, reward, complete).
import { MISSIONS } from './config.js';

// Stage kinds — the vocabulary every job is written in, in the order
// the player meets them, so each job teaches one verb and the finale
// combines them instead of introducing a new rule:
//  reach  — arrive within `radius` of the named marker
//  steal  — enter the mission's target car (markers.sportscar,
//           or the shuttle at the airport for the Runway Job)
//  timed  — reach the marker before `seconds` run out
//  evade  — survive until wanted stars fall to 0 (then reach the marker)
//  grab   — reach the grab point (`grabAt`, default the vault), then
//           escape to the marker with wanted >= 3. The Big Score
//           grabs the vault cash; the Arms Deal grabs the hangar crate.
// The markers are all places the player has already seen (docks, park,
// garage, flat, bank, marina), never a new corner of the map: a mission
// tests driving and evasion, not map-reading. The Airport Arc is the
// one exception, and it earns it: missions 6–8 introduce the airport
// one place at a time (terminal, then hangar, then runway), each stage
// pointing at a place the previous stage already showed the player.
// The docks and marina markers sit just outside the street grid but
// inside the BOUNDS fence (docks x = -161, marina z = 159), so the
// fence never blocks a job — that placement is load-bearing, not
// incidental, and the boundary probe in tools/ asserts it on every
// verification run. The airport markers sit the same way inside the
// extended north fence (terminal z = -182, hangar z = -178, runway
// z = -218, all inside BOUNDS.zMin = -236).
const STORY = [
  // The five jobs, in the order the player meets them. Each job is one
  // idea in one sentence, and the stage kinds are the vocabulary for
  // those ideas — reach, steal, timed, evade, grab — introduced one
  // per job so the finale is a combination, not a new rule. The
  // waypoints are all places the player has already seen: the docks
  // (west edge, outside the grid but inside the fence), the park, the
  // garage, the flat, the bank, the marina. No job sends the player
  // somewhere new, because a mission should test driving and evasion,
  // not map-reading. Rewards climb with the risk, and the last job
  // pays more than the first four together.
  {
    id: 'fixer', title: 'The Fixer',
    intro: 'Marisol Vega runs this town from the docks. Go meet her. Walk or drive — nobody cares yet.',
    stages: [{ kind: 'reach', marker: 'docks', radius: 5, text: 'Meet Marisol at the docks (west edge)' }],
  },
  {
    id: 'wheels', title: 'Hot Wheels',
    intro: 'Marisol needs a fast car, no questions. There is a red sports car parked by the park. Take it.',
    stages: [{ kind: 'steal', marker: 'sportscar', radius: 6, text: 'Steal the red sports car by the park (press E)' }],
  },
  {
    id: 'drop', title: 'The Drop',
    intro: 'A package is waiting at the docks. Take it to the garage across town. You have 100 seconds — the buyers are impatient.',
    stages: [
      { kind: 'reach', marker: 'package', radius: 5, text: 'Pick up the package at the docks' },
      { kind: 'timed', marker: 'garage', radius: 6, seconds: 100, text: 'Deliver the package to Vega Motors — beat the clock' },
    ],
  },
  {
    id: 'heat', title: 'Heat',
    intro: 'The drop went loud. The whole Solmar PD is looking for you. Lose the heat, then lay low at the flat.',
    stages: [
      { kind: 'evade', marker: 'safehouse', radius: 6, text: 'Lose the police, then reach the safehouse' },
      { kind: 'reach', marker: 'safehouse', radius: 6, text: 'Reach the safehouse' },
    ],
  },
  {
    id: 'score', title: 'The Big Score',
    intro: 'One last job: the Solmar Trust vault. Grab the cash, then run for the marina. Do not get caught.',
    stages: [
      { kind: 'reach', marker: 'vault', radius: 6, text: 'Reach the Solmar Trust Bank' },
      { kind: 'grab', marker: 'marina', radius: 7, text: 'Grab the cash and escape to the marina' },
    ],
  },
  // The Airport Arc (missions 6–8): the story leaves the city grid for
  // Solmar International, north of the last street. No new stage kinds
  // are introduced — the arc recombines the ones the player already
  // knows (reach, steal, timed, evade, grab) on new ground, with the
  // grab generalised by `grabAt` so the same stage can take the vault
  // cash or the hangar crate. The arc's through-line is Marisol
  // cashing out: the runway job moves her money, the arms deal arms
  // her crew, and the finale gets Rook out of Solmar alive.
  {
    id: 'runway', title: 'Runway Job',
    intro: 'Marisol is moving money out through the airport. Get to Solmar International, take the shuttle, and drive it to the docks — the buyers wait there, and they do not wait long.',
    stages: [
      { kind: 'reach', marker: 'airport', radius: 8, text: 'Reach Solmar International — the terminal on the north edge' },
      { kind: 'steal', marker: 'shuttle', radius: 6, text: 'Take the airport shuttle at the forecourt (press E)' },
      { kind: 'timed', marker: 'docks', radius: 6, seconds: 120, text: 'Drive the shuttle to the docks — beat the clock' },
    ],
  },
  {
    id: 'deal', title: 'The Arms Deal',
    intro: 'The buyers are waiting at the north hangar with a crate of hardware and no patience. Take the crate, then lose them and get to the flat.',
    stages: [
      { kind: 'reach', marker: 'hangar', radius: 7, text: 'Meet the buyers at the north hangar' },
      { kind: 'grab', marker: 'safehouse', radius: 6, grabAt: 'hangar', text: 'Take the crate and escape to the safehouse' },
    ],
  },
  {
    id: 'finale', title: 'The Finale Escape',
    intro: 'It all comes due at once. The plane leaves in 90 seconds, the whole PD is on the access road, and the only way out of Solmar is the marina. Run.',
    stages: [
      { kind: 'timed', marker: 'runway', radius: 8, seconds: 90, text: 'Reach the runway — the plane leaves in 90 seconds' },
      { kind: 'evade', marker: 'safehouse', radius: 6, text: 'Lose the police, then reach the safehouse' },
      { kind: 'reach', marker: 'marina', radius: 7, text: 'Reach the marina — Rook leaves Solmar by boat' },
    ],
  },
];

export function createMissions(markers) {
  return {
    markers,
    index: 0, // which mission of STORY is active
    stage: 0,
    timer: 0, // counts down during timed stages
    done: false,
    storyComplete: false,
    grabbed: false, // Big Score: the vault cash is in hand
  };
}

export function missionDef(m) {
  return STORY[m.index];
}

export function currentStage(m) {
  if (m.done) return null;
  return STORY[m.index].stages[m.stage];
}

export function currentObjective(m) {
  if (m.storyComplete) return 'Story complete — Solmar is yours. Free roam.';
  if (m.done) return 'Mission complete.';
  const stage = currentStage(m);
  const def = STORY[m.index];
  let text = `${def.title}: ${stage.text}`;
  if (stage.kind === 'timed') text += ` — ${Math.max(0, Math.ceil(m.timer))}s`;
  if (stage.kind === 'evade') text += ' — stay out of sight';
  return text;
}

export function currentWaypoint(m) {
  if (m.done || m.storyComplete) return null;
  const stage = currentStage(m);
  if (!stage) return null;
  return m.markers[stage.marker] ?? null;
}

// Advance the story. `ctx` carries what the stage needs to see:
// {x, z, inCar, inMissionCar, wanted, dt}. Returns an array of events:
// {type:'stage'|'mission'|'story'|'failed', ...}.
export function stepMissions(m, ctx) {
  const events = [];
  if (m.done || m.storyComplete) return events;
  const stage = currentStage(m);
  const def = STORY[m.index];
  const wp = m.markers[stage.marker];
  const dist = wp ? Math.hypot(ctx.x - wp.x, ctx.z - wp.z) : Infinity;

  if (stage.kind === 'timed') {
    if (m.timer <= 0) m.timer = stage.seconds;
    m.timer -= ctx.dt;
    if (m.timer <= 0 && dist > stage.radius) {
      events.push({ type: 'failed', reason: 'The buyers walked. The drop is blown — try again.' });
      m.timer = stage.seconds;
      m.stage = 0;
      return events;
    }
  }

  let advance = false;
  if (stage.kind === 'reach' || stage.kind === 'timed') {
    if (dist <= stage.radius) advance = true;
  } else if (stage.kind === 'steal') {
    if (ctx.inMissionCar) advance = true;
  } else if (stage.kind === 'evade') {
    // The evade stage completes when the heat is gone; the next stage is
    // the walk to the safehouse. Set wanted to 0 externally to test it.
    if (ctx.wanted === 0) advance = true;
  } else if (stage.kind === 'grab') {
    // The grab is a two-part stage: first reach the grab point to take
    // the goods (which trips the alarm), then escape to the stage
    // marker. `grabAt` names the grab point: 'vault' for the Big Score,
    // 'hangar' for the Arms Deal. The alarm text and the wanted jump
    // travel with the event, so main.js never has to know which job
    // is running.
    const grabAt = stage.grabAt ?? 'vault';
    const grabPoint = m.markers[grabAt];
    const grabDist = grabPoint ? Math.hypot(ctx.x - grabPoint.x, ctx.z - grabPoint.z) : Infinity;
    if (!m.grabbed) {
      if (grabDist <= 6) {
        m.grabbed = true;
        if (grabAt === 'hangar') {
          events.push({ type: 'grabbed', text: 'Crate secured! The buyers are coming — get to the flat.', alarm: 'The deal went loud — the buyers called it in' });
        } else {
          events.push({ type: 'grabbed', text: 'Cash grabbed! Get to the marina — the alarm is up.', alarm: 'The bank alarm is screaming' });
        }
      }
    } else if (dist <= stage.radius) {
      advance = true;
    }
  }

  if (!advance) return events;
  m.stage += 1;
  m.timer = 0;
  if (m.stage >= def.stages.length) {
    const reward = MISSIONS[m.index].reward;
    events.push({ type: 'mission', name: def.title, reward });
    m.index += 1;
    m.stage = 0;
    m.grabbed = false;
    if (m.index >= STORY.length) {
      m.storyComplete = true;
      m.done = true;
      // The story ends twice, in a sense: the Big Score closes the
      // first arc ("Solmar is yours"), and the Finale Escape closes
      // the whole game — Rook leaves by boat, so the line says so.
      events.push({
        type: 'story',
        text: def.id === 'finale'
          ? 'The Finale Escape is done. Rook leaves Solmar by boat, the money in the hold and the city behind him.'
          : 'The Big Score is done. Solmar Bay is yours, Rook.',
      });
    } else {
      events.push({ type: 'stage', text: STORY[m.index].intro });
    }
  } else {
    events.push({ type: 'stage', text: def.stages[m.stage].text });
  }
  return events;
}

// The Heat mission needs the player hot when it starts: called by main.js
// when the mission begins. The finale starts hotter still — four stars
// the moment it opens, with interceptors and roadblocks already in the
// deck — because the finale is an escape, not a job that goes wrong
// halfway through. The arms deal starts cold; the grab trips the alarm.
export function onMissionStart(m) {
  const def = STORY[m.index];
  if (def.id === 'heat') return { wanted: 3 };
  if (def.id === 'finale') return { wanted: 4 };
  if (def.id === 'score') return { wanted: 0 };
  return { wanted: 0 };
}

// Which arc the player is in, for the HUD: the first five jobs are
// "The Vega Jobs", the last three are "The Airport Arc". The HUD
// shows the arc, the mission number out of eight, and the arc's
// progress, so the player always knows how much story is left.
export function storyArc(m) {
  const total = STORY.length;
  const arc = m.index < 5 ? 'The Vega Jobs' : 'The Airport Arc';
  const arcIndex = m.index < 5 ? m.index + 1 : m.index - 4;
  const arcTotal = m.index < 5 ? 5 : 3;
  return {
    arc,
    text: `${arc} — mission ${m.index + 1} of ${total} (arc ${arcIndex} of ${arcTotal})`,
    mission: m.index + 1,
    total,
  };
}
