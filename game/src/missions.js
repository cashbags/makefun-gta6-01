// missions.js — SOLMAR's story: five jobs for the fixer Marisol Vega, in
// order, each with a waypoint, an objective line, and a payout. The mission
// state machine is deliberately small: a mission is a list of stages, each
// stage waits for the player to reach a marker (or, for the escape jobs, to
// survive until a condition clears), and finishing a stage advances the
// story. The HUD reads currentObjective() and currentWaypoint() every frame;
// main.js reads the events this module emits (crime, reward, complete).
import { MISSIONS } from './config.js';

// Stage kinds:
//  reach  — arrive within `radius` of the named marker
//  steal  — enter the mission's target car (markers.sportscar)
//  timed  — reach the marker before `seconds` run out
//  evade  — survive until wanted stars fall to 0 (then reach the marker)
//  grab   — reach the vault, then escape to the marker with wanted >= 3
const STORY = [
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
    // The grab is a two-part stage: first reach the vault to take the cash
    // (which trips the alarm), then escape to the stage marker.
    const vault = m.markers.vault;
    const vaultDist = vault ? Math.hypot(ctx.x - vault.x, ctx.z - vault.z) : Infinity;
    if (!m.grabbed) {
      if (vaultDist <= 6) {
        m.grabbed = true;
        events.push({ type: 'grabbed', text: 'Cash grabbed! Get to the marina — the alarm is up.' });
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
      events.push({ type: 'story', text: 'The Big Score is done. Solmar Bay is yours, Rook.' });
    } else {
      events.push({ type: 'stage', text: STORY[m.index].intro });
    }
  } else {
    events.push({ type: 'stage', text: def.stages[m.stage].text });
  }
  return events;
}

// The Heat mission needs the player hot when it starts: called by main.js
// when the mission begins.
export function onMissionStart(m) {
  const def = STORY[m.index];
  if (def.id === 'heat') return { wanted: 3 };
  if (def.id === 'score') return { wanted: 0 };
  return { wanted: 0 };
}
